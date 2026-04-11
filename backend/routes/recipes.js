
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:password@host:port/db?sslmode=require';
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

function normalizeInstructionLine(line) {
  return (line || '')
    .replace(/JSON-LD\s+Recipe\s+Instructions\s*:/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/[Â]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    // Strip pre-existing step numbers like "2 Preheat..." or "12 Serve..." at the
    // start of a line. Only match 1–2 digit numbers followed by a space and an
    // uppercase letter so that quantities like "350 degrees" are not stripped.
    .replace(/^\d{1,2}\s+(?=[A-Z])/, '');
}

function cleanInstructionsForDisplay(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return '';
  const source = raw.trim();

  // Preferred path: extract every JSON-like "text" field from HowToStep blobs.
  const textMatches = [...source.matchAll(/"text"\s*:\s*"((?:\\.|[^"\\])*)"/g)];
  if (textMatches.length > 0) {
    const lines = textMatches
      .map((match) => {
        try {
          return normalizeInstructionLine(JSON.parse(`"${match[1]}"`));
        } catch {
          return normalizeInstructionLine(match[1].replace(/\\n/g, ' '));
        }
      })
      .filter(Boolean);
    if (lines.length > 0) return lines.join('\n');
  }

  // Fallback: aggressively remove structural JSON/schema markers, keep readable text.
  return source
    .replace(/JSON-LD\s+Recipe\s+Instructions\s*:/gi, ' ')
    .replace(/"@type"\s*:\s*"HowToStep",?/gi, '')
    .replace(/"name"\s*:\s*"((?:\\.|[^"\\])*)",?/gi, '')
    .replace(/"text"\s*:\s*/gi, '')
    .replace(/[\[\]{}]/g, ' ')
    .replace(/"/g, '')
    .replace(/\\n/g, '\n')
    .replace(/\s*,\s*/g, '\n')
    .split('\n')
    .map(normalizeInstructionLine)
    .filter(Boolean)
    .join('\n');
}

function isMeaningfulInstructionSentence(s) {
  if (!s || s.length < 5) return false;
  const junkPatterns = [
    /^(Visible\s+List\s+Items|Recipes|Biscuits|Bread|Cakes|Cupcakes|Desserts|Loaves|Muffins|Pastry|Scones|Slices|Sweets|Products|Explore|Shop|Kids|Contact|Factory|Tours|School|Visits|Groups|Events|Home|Ingredients|Method\s*2|teaspoons|tablespoons|butter|flour|milk|sugar|cinnamon|vanilla|water|lemon|cream|cheese|onion|egg|approximately|finely|melted|chopped|grated|salt|pinch)\b/i,
    /^([A-Z][a-z]+\s+){2,}(Tour|Visits|School|Factory|Products|Recipes|Ingredients|Method)/i,
    /^\d+\s*(cups?|tsp|tbsp|g|kg|ml|teaspoon|tablespoon|gram)\b/i,
    /^(Tour|School|Visits|Factory|Products|Recipes|Ingredients|Method|Home)[\s:,]/i
  ];
  return !junkPatterns.some(pattern => pattern.test(s));
}

function formatInstructionsAsNumberedSentences(raw) {
  const normalized = normalizeInstructionLine(String(raw || ''));
  if (!normalized) return '';

  const sentenceMatches = normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  const normalizedSentences = sentenceMatches
    .map((s) => normalizeInstructionLine(s))
    .filter(Boolean);
  const sentences = normalizedSentences
    .filter(isMeaningfulInstructionSentence);

  const finalSentences = sentences.length > 0 ? sentences : normalizedSentences;
  if (finalSentences.length === 0) return '';
  const listItems = finalSentences.map((s) => `<li>${s}</li>`).join('');
  return `<ol>${listItems}</ol>`;
}

function normalizeIngredientLine(line) {
  return (line || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&rsquo;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[Â]/g, '')
    .replace(/^\s*[,;:\-]+\s*/g, '')
    .replace(/\s*[,;:\-]+\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitCompressedIngredientText(text) {
  if (!text) return '';
  const units = '(?:cups?|cup|tbsp|tablespoons?|tsp|teaspoons?|g|grams?|kg|kilograms?|ml|millilit(?:er|re)s?|l|lit(?:er|re)s?|oz|ounces?|lb|pounds?|pinch(?:es)?|dash(?:es)?|cloves?|cans?|slices?|pieces?)';
  const qty = '(?:\\d+(?:\\s+\\d+\\/\\d+)?|\\d+\\/\\d+|\\d*\\.\\d+|[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])';

  let normalized = String(text)
    .replace(/\bFILLING\b/gi, '\nFILLING\n')
    // Split when a quantity+unit is glued right after a word, e.g. "eggs¼ cup".
    .replace(/(?<=[A-Za-z])(?=[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/g, '\n')
    // Split before embedded quantity+unit tokens, e.g. "Sugar 2 tsp", preserving all characters.
    .replace(new RegExp(`\\s+(?=${qty}\\s*${units}\\b)`, 'gi'), '\n')
    // Keep existing split for letter-digit joins like "item2".
    .replace(/(?<=[A-Za-z])(?=\d)/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .trim();

  return normalized;
}

function isMeaningfulIngredientLine(line) {
  if (!line) return false;
  const normalized = String(line).trim();
  if (!normalized) return false;
  if (normalized === '...') return false;
  if (/^[,.;:\-]+$/.test(normalized)) return false;
  if (/^[1-5]\s*star$/i.test(normalized)) return false;
  if (/^(noopener|noreferrer|_blank)$/i.test(normalized)) return false;
  if (/^\/products\//i.test(normalized)) return false;
  return true;
}

function isLikelyInstructionToken(line) {
  const token = String(line || '').trim();
  if (!token) return false;
  // Keep quantity/measurement ingredient lines even when they contain decimal dots
  // such as "3.7kg Rice".
  if (/^\d+(?:\.\d+)?\s*(?:cups?|cup|tbsp|tablespoons?|tsp|teaspoons?|g|grams?|kg|kilograms?|ml|millilit(?:er|re)s?|l|lit(?:er|re)s?|oz|ounces?|lb|pounds?|pinch(?:es)?|dash(?:es)?|cloves?|cans?|slices?|pieces?)\b/i.test(token)) {
    return false;
  }
  if (/[!?]/.test(token) || /\.(?:\s|$)/.test(token)) return true;
  if (/^for\s+the\s+doughboys\b/i.test(token)) return true;
  if (/\b(bring|add|boil|simmer|cook|serve|mix|top up|form|divide|mould|continue cooking)\b/i.test(token)) return true;
  return false;
}

function cleanIngredientsForDisplay(raw) {
  if (Array.isArray(raw)) {
    return raw
      .flatMap((item) => splitCompressedIngredientText(String(item || '')).split(/\r?\n/))
      .map((item) => normalizeIngredientLine(String(item || '')))
      .filter(isMeaningfulIngredientLine)
      .join('\n');
  }

  if (raw && typeof raw === 'object') {
    raw = JSON.stringify(raw);
  }

  if (typeof raw !== 'string' || !raw.trim()) return '';
  const source = raw.trim();

  // HTML/anchor path: keep visible link text, never link attributes.
  if (/<a\b/i.test(source) || /<[^>]+>/.test(source)) {
    const htmlToText = source
      .replace(/<\/?li[^>]*>/gi, '\n')
      .replace(/<\/?ul[^>]*>/gi, '\n')
      .replace(/<\/?ol[^>]*>/gi, '\n')
      .replace(/<\/?p[^>]*>/gi, '\n')
      .replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, '$1')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&rsquo;/gi, "'")
      .replace(/&quot;/gi, '"');

    const htmlTokens = htmlToText
      .split(/\r?\n/)
      .flatMap((line) => splitCompressedIngredientText(String(line || '')).split(/\r?\n/))
      .flatMap((line) => String(line || '').split(/\s*,\s*/))
      .map(normalizeIngredientLine)
      .filter((line) => isMeaningfulIngredientLine(line) && !isLikelyInstructionToken(line));

    if (htmlTokens.length > 0) {
      return htmlTokens.join('\n');
    }
  }

  // JSON-array path: many extracted ingredients are stored as JSON text.
  if (source.startsWith('[') && source.endsWith(']')) {
    try {
      const parsed = JSON.parse(source);
      if (Array.isArray(parsed)) {
        return parsed
          .flatMap((item) => splitCompressedIngredientText(String(item || '')).split(/\r?\n/))
          .map((item) => normalizeIngredientLine(String(item || '')))
          .filter(isMeaningfulIngredientLine)
          .join('\n');
      }
    } catch {
      // Continue to the regex/text fallbacks below.
    }
  }

  // HTML path: Extract only visible ingredient text from recipeIngredient paragraph nodes.
  if (/<p[^>]*itemprop=["']recipeIngredient["']/i.test(source)) {
    const htmlLines = [...source.matchAll(/<p[^>]*itemprop=["']recipeIngredient["'][^>]*>([\s\S]*?)<\/p>/gi)]
      .map((match) => normalizeIngredientLine(match[1].replace(/<[^>]+>/g, ' ')))
      .filter(isMeaningfulIngredientLine);
    if (htmlLines.length > 0) {
      return htmlLines.join('\n');
    }
  }

  // Preferred path: extract quoted ingredient entries from JSON-like arrays.
  const quotedItems = [...source.matchAll(/"((?:\\.|[^"\\])+)"/g)]
    .map((match) => {
      try {
        return normalizeIngredientLine(JSON.parse(`"${match[1]}"`));
      } catch {
        return normalizeIngredientLine(match[1].replace(/\\n/g, ' '));
      }
    })
    .flatMap((item) => splitCompressedIngredientText(String(item || '')).split(/\r?\n/))
    .map(normalizeIngredientLine)
    .filter((item) => isMeaningfulIngredientLine(item) && !isLikelyInstructionToken(item) && !/^(@type|name|text|recipeIngredient)$/i.test(item));

  if (quotedItems.length > 0) {
    return quotedItems.join('\n');
  }

  // Fallback cleanup for mixed text/HTML blobs.
  return source
    .replace(/"?recipeIngredient"?\s*:\s*/gi, '')
    .replace(/[\[\]{}]/g, ' ')
    .replace(/"/g, '')
    .replace(/\\n/g, '\n')
    .replace(/\s*,\s*/g, '\n')
    .split('\n')
    .map(normalizeIngredientLine)
    .filter((line) => isMeaningfulIngredientLine(line) && !isLikelyInstructionToken(line))
    .join('\n');
}

const INGREDIENT_UNITS_PATTERN = '(?:cups?|cup|tbsp|tablespoons?|tsp|teaspoons?|g|grams?|kg|kilograms?|ml|millilit(?:er|re)s?|l|lit(?:er|re)s?|oz|ounces?|lb|pounds?|pinch(?:es)?|dash(?:es)?|cloves?|cans?|slices?|pieces?)';
const INGREDIENT_QTY_PATTERN = '(?:\\d+(?:\\s+\\d+\\/\\d+)?|\\d+\\/\\d+|\\d*\\.\\d+|[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])';
const leadingMeasureRegex = new RegExp(`^(${INGREDIENT_QTY_PATTERN}(?:\\s*[-–]\\s*${INGREDIENT_QTY_PATTERN})?)\\s*(${INGREDIENT_UNITS_PATTERN})\\b\\s*(.+)?$`, 'i');
const trailingMeasureRegex = new RegExp(`^(.*?)\\s*[-:–]\\s*(${INGREDIENT_QTY_PATTERN}(?:\\s*[-–]\\s*${INGREDIENT_QTY_PATTERN})?)\\s*(${INGREDIENT_UNITS_PATTERN})\\b\\s*(.*)$`, 'i');
const qtyUnitOnlyRegex = new RegExp(`^${INGREDIENT_QTY_PATTERN}\\s*${INGREDIENT_UNITS_PATTERN}\\b$`, 'i');

function formatIngredientsAsMeasureFooditem(cleanedLines) {
  if (!Array.isArray(cleanedLines)) return [];

  let previousFooditem = '';
  return cleanedLines
    .map((line) => String(line || '').trim())
    .filter(Boolean)
    .map((line) => {
      let measurement = '';
      let fooditem = '';

      const leading = line.match(leadingMeasureRegex);
      if (leading) {
        measurement = `${leading[1]} ${leading[2]}`.replace(/\\s+/g, ' ').trim();
        fooditem = String(leading[3] || '').trim();
      } else {
        const trailing = line.match(trailingMeasureRegex);
        if (trailing) {
          measurement = `${trailing[2]} ${trailing[3]}`.replace(/\\s+/g, ' ').trim();
          fooditem = `${String(trailing[1] || '').trim()} ${String(trailing[4] || '').trim()}`.replace(/\\s+/g, ' ').trim();
        } else {
          fooditem = line;
        }
      }

      if (!fooditem && measurement && previousFooditem && qtyUnitOnlyRegex.test(line)) {
        fooditem = previousFooditem;
      }

      if (fooditem) {
        previousFooditem = fooditem.replace(/[-:–]\\s*$/, '').trim() || previousFooditem;
      }

      const merged = measurement && fooditem ? `${measurement} ${fooditem}` : (fooditem || measurement);
      return merged.replace(/\s*,\s*/g, ' ').replace(/\s+/g, ' ').trim();
    })
    .filter(Boolean);
}

function splitExtractedIngredientsPreserveOrder(rawExtractedIngredients) {
  const raw = String(rawExtractedIngredients || '').trim();
  if (!raw) return [];

  const qtyToken = `${INGREDIENT_QTY_PATTERN}(?:\\s*[-–]\\s*${INGREDIENT_QTY_PATTERN})?`;
  const qtyFirstBoundary = new RegExp(`\\s*,\\s*(?=${qtyToken}\\s*${INGREDIENT_UNITS_PATTERN}\\b)`, 'gi');

  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .split(/\r?\n/)
    .flatMap((line) => splitCompressedIngredientText(String(line || '')).split(/\r?\n/))
    .flatMap((line) => String(line || '').split(qtyFirstBoundary))
    .map(normalizeIngredientLine)
    .filter((line) => isMeaningfulIngredientLine(line) && !isLikelyInstructionToken(line));
}

// PUT /api/recipes/:id/raw - Save raw data for a recipe (file only)
router.put('/:id/raw', async (req, res) => {
  const { id } = req.params;
  const { raw_data } = req.body;
  if (!raw_data) return res.status(400).json({ success: false, error: 'Missing raw_data' });
  const rawDataDir = path.join(__dirname, '../public/RawDataTXT');
  if (!fs.existsSync(rawDataDir)) {
    fs.mkdirSync(rawDataDir, { recursive: true });
  }
  const filePath = path.join(rawDataDir, `${id}.txt`);
  fs.writeFile(filePath, raw_data, (fileErr) => {
    if (fileErr) {
      return res.status(500).json({ success: false, error: 'Failed to write raw data file', details: fileErr.message });
    }
    res.json({ success: true });
  });
});


// GET /api/recipes/display-dropdown - Get all recipes from recipe_display for dropdown
// Updated: Return both id (primary key), recipeID, and name
router.get('/display-dropdown', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, recipeid, name, serving_size FROM recipe_display ORDER BY name');
    res.json({ recipes: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/recipes/display-table - Get all rows from recipe_display
router.get('/display-table', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM recipe_display');
    res.json(result.rows);
  } catch (err) {
    console.error('[ERROR][GET /api/recipes/display-table]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Stepwise Cleanup Instructions API with Progress ---
// let cleanupProgress = { total: 0, current: 0, running: false }; // Removed duplicate declaration
router.post('/cleanup-instructions-stepwise', async (req, res) => {
  if (cleanupProgress.running) return res.status(429).json({ error: 'Cleanup already running' });
  console.log('[CLEANUP] Starting stepwise cleanup of instructions...');
  cleanupProgress.running = true;
  try {
    const requestedRecipeId = Number(req.body?.recipeId);
    if (req.body?.recipeId !== undefined && (!Number.isInteger(requestedRecipeId) || requestedRecipeId <= 0)) {
      cleanupProgress.running = false;
      return res.status(400).json({ error: 'Invalid recipeId' });
    }
    const result = req.body?.recipeId !== undefined
      ? await pool.query('SELECT id, instructions, instructions_extracted FROM recipes WHERE id = $1', [requestedRecipeId])
      : await pool.query('SELECT id, instructions, instructions_extracted FROM recipes');
    const rows = result.rows;
    cleanupProgress.total = rows.length;
    cleanupProgress.current = 0;
    for (const row of rows) {
      const rawExtracted = row.instructions_extracted;
      let cleanedExtracted = cleanInstructionsForDisplay(row.instructions_extracted);
      if (!cleanedExtracted) {
        cleanedExtracted = cleanInstructionsForDisplay(row.instructions);
      }
      const numberedDisplay = formatInstructionsAsNumberedSentences(cleanedExtracted);
      // Debug output for extracted instructions
      console.log(`[CLEANUP] Recipe ID ${row.id}: rawExtracted=`, rawExtracted);
      console.log(`[CLEANUP] Recipe ID ${row.id}: cleanedExtracted=`, cleanedExtracted);
      // Always write to instructions_display, never overwrite instructions
      if (numberedDisplay && numberedDisplay.length > 0) {
        try {
          const updateResult = await pool.query('UPDATE recipes SET instructions_display = $1 WHERE id = $2', [numberedDisplay, row.id]);
          console.log(`[CLEANUP] Recipe ID ${row.id}: Cleaned extracted_instructions and copied to instructions_display. Updated rows: ${updateResult.rowCount}`);
        } catch (err) {
          console.error(`[CLEANUP][ERROR] Recipe ID ${row.id}: Failed to update instructions_display.`, err);
        }
      } else if (row.instructions) {
        let cleaned = row.instructions
          .replace(/"recipeInstructions"\s*:\s*\[.*?\]/gs, '')
          .replace(/\{\s*"@type"\s*:\s*"HowToStep".*?\}/gs, '')
          .replace(/JSON-LD\s+Recipe\s+Instructions\s*:/gi, ' ')
          .replace(/<\/?p>/gi, ' ')
          .replace(/<br\s*\/?\s*>/gi, ' ')
          .replace(/<[^>]+>/g, '')
          .replace(/[Â]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        const numberedFallback = formatInstructionsAsNumberedSentences(cleaned);
        try {
          const updateResult = await pool.query('UPDATE recipes SET instructions_display = $1 WHERE id = $2', [numberedFallback || cleaned, row.id]);
          console.log(`[CLEANUP] Recipe ID ${row.id}: Cleaned instructions and copied to instructions_display. Updated rows: ${updateResult.rowCount}`);
        } catch (err) {
          console.error(`[CLEANUP][ERROR] Recipe ID ${row.id}: Failed to update instructions_display.`, err);
        }
      } else {
        console.log(`[CLEANUP] Recipe ID ${row.id}: No instructions, skipping.`);
      }
      cleanupProgress.current++;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    cleanupProgress.running = false;
    console.log(`[CLEANUP] Stepwise cleanup complete. Updated ${cleanupProgress.current} recipes.`);
    res.json({ success: true, message: 'Stepwise cleanup complete.' });
  } catch (e) {
    cleanupProgress.running = false;
    console.error('[CLEANUP] Error during cleanup:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/recipes/:id/display - Copy recipe to recipe_display table
router.post('/:id/display', async (req, res) => {
  const recipeId = req.params.id;
  try {
    // Fetch the recipe from Postgres
    const recipeResult = await pool.query('SELECT * FROM recipes WHERE id = $1', [recipeId]);
    if (recipeResult.rows.length === 0) {
      console.error(`[DISPLAY][ERROR] Recipe not found for id=${recipeId}`);
      return res.status(404).json({ success: false, error: 'Recipe not found' });
    }
    const row = recipeResult.rows[0];
    // Use display columns when publishing, with fallback to original fields.
    const ingredients = row.ingredients_display || row.ingredients;
    const instructions = row.instructions_display || row.instructions;
    // Debug log the data being upserted
    console.log('[DISPLAY][DEBUG] Upserting to recipe_display:', {
      name: row.name,
      description: row.description,
      ingredients,
      serving_size: row.serving_size,
      url: row.url,
      instructions,
      recipeid: row.id
    });
    // Insert or update into recipe_display
    const upsertSql = `
      INSERT INTO recipe_display (name, description, ingredients, serving_size, url, instructions, recipeid)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (recipeid) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        ingredients = EXCLUDED.ingredients,
        serving_size = EXCLUDED.serving_size,
        url = EXCLUDED.url,
        instructions = EXCLUDED.instructions
    `;
    const upsertResult = await pool.query(upsertSql, [
      row.name,
      row.description,
      ingredients,
      row.serving_size,
      row.url,
      instructions,
      row.id
    ]);
    console.log('[DISPLAY][DEBUG] Upsert result:', upsertResult.command, upsertResult.rowCount);
    return res.json({ success: true });
  } catch (err) {
    console.error('[DISPLAY][ERROR] Exception during upsert:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/recipes/display-table/:id - Unpublish a recipe from recipe_display (by id)
router.delete('/display-table/:id', async (req, res) => {
  let displayId = req.params.id;
  displayId = parseInt(displayId, 10);
  console.log('[UNPUBLISH][DEBUG] Attempting to delete from recipe_display with id:', displayId, 'Type:', typeof displayId);
  try {
    const result = await pool.query('DELETE FROM recipe_display WHERE id = $1', [displayId]);
    console.log('[UNPUBLISH][DEBUG] Delete result:', result.command, 'rowCount:', result.rowCount);
    if (result.rowCount > 0) {
      res.json({ success: true });
    } else {
      res.status(404).json({ success: false, error: 'Recipe not found in display table.' });
    }
  } catch (err) {
    console.error('[UNPUBLISH][ERROR]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Stepwise Cleanup Ingredients API with Progress ---

let cleanupIngredientsProgress = { total: 0, current: 0, running: false };
router.post('/cleanup-ingredients-stepwise', async (req, res) => {
  if (cleanupIngredientsProgress.running) return res.status(429).json({ error: 'Cleanup already running' });
  console.log('[CLEANUP] Starting stepwise cleanup of ingredients...');
  cleanupIngredientsProgress.running = true;
  try {
    const requestedRecipeId = Number(req.body?.recipeId);
    if (req.body?.recipeId !== undefined && (!Number.isInteger(requestedRecipeId) || requestedRecipeId <= 0)) {
      cleanupIngredientsProgress.running = false;
      return res.status(400).json({ error: 'Invalid recipeId' });
    }
    // Use Postgres
    const result = req.body?.recipeId !== undefined
      ? await pool.query('SELECT id, extracted_ingredients, ingredients FROM recipes WHERE id = $1', [requestedRecipeId])
      : await pool.query('SELECT id, extracted_ingredients, ingredients FROM recipes');
    const rows = result.rows;
    cleanupIngredientsProgress.total = rows.length;
    cleanupIngredientsProgress.current = 0;
    for (const row of rows) {
      const rawExtractedIngredients = row.extracted_ingredients;
      const rawIngredients = row.ingredients;
      const rawSource = rawExtractedIngredients || rawIngredients || '';
      const extractedOrderedLines = splitExtractedIngredientsPreserveOrder(rawExtractedIngredients);
      const cleaned = extractedOrderedLines.length ? '' : cleanIngredientsForDisplay(rawSource);
      const cleanedLines = extractedOrderedLines.length
        ? extractedOrderedLines
        : cleaned
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean);
      const formattedLines = formatIngredientsAsMeasureFooditem(cleanedLines);
      const listItems = formattedLines
        .map(line => String(line || '').trim())
        .filter(Boolean)
        .map(line => `<li>${line}</li>`)
        .join('');
      const cleanedForDisplay = listItems ? `<ul>${listItems}</ul>` : '';

      const rawExtractedPreview = String(rawExtractedIngredients || '').slice(0, 500);
      const rawIngredientsPreview = String(rawIngredients || '').slice(0, 500);
      const cleanedPreview = String(cleanedForDisplay || '').slice(0, 500);

      console.log(`[CLEANUP][INGREDIENTS] Recipe ID ${row.id} raw extracted preview:`, rawExtractedPreview);
      console.log(`[CLEANUP][INGREDIENTS] Recipe ID ${row.id} raw ingredients preview:`, rawIngredientsPreview);
      console.log(`[CLEANUP][INGREDIENTS] Recipe ID ${row.id} cleaned display preview:`, cleanedPreview);
      console.log(`[CLEANUP][INGREDIENTS] Recipe ID ${row.id} source length=${String(rawSource || '').length}, cleaned length=${String(cleanedForDisplay || '').length}`);

      const updateResult = await pool.query(
        'UPDATE recipes SET ingredients_display = $1 WHERE id = $2 RETURNING id, ingredients_display',
        [cleanedForDisplay, row.id]
      );
      console.log(`[CLEANUP][INGREDIENTS] Recipe ID ${row.id}: Updated ingredients_display. Updated rows: ${updateResult.rowCount}`);
      if (updateResult.rows[0]) {
        console.log(`[CLEANUP][INGREDIENTS] Recipe ID ${row.id}: ingredients_display saved preview=`, String(updateResult.rows[0].ingredients_display || '').slice(0, 500));
      }
      cleanupIngredientsProgress.current++;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    cleanupIngredientsProgress.running = false;
    console.log(`[CLEANUP] Stepwise ingredients cleanup complete. Updated ${cleanupIngredientsProgress.current} recipes.`);
    res.json({ success: true, message: 'Stepwise ingredients cleanup complete.' });
  } catch (e) {
    cleanupIngredientsProgress.running = false;
    console.error('[CLEANUP] Error during ingredients cleanup:', e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/cleanup-ingredients-progress', (req, res) => {
  res.json(cleanupIngredientsProgress);
});

// --- Stepwise Cleanup Instructions API with Progress ---
let cleanupProgress = { total: 0, current: 0, running: false };
router.post('/cleanup-instructions-stepwise', async (req, res) => {
  if (cleanupProgress.running) return res.status(429).json({ error: 'Cleanup already running' });
  console.log('[CLEANUP] Starting stepwise cleanup of instructions...');
  cleanupProgress.running = true;
  try {
    const result = await pool.query('SELECT id, instructions, instructions_extracted FROM recipes');
    const rows = result.rows;
    cleanupProgress.total = rows.length;
    cleanupProgress.current = 0;
    for (const row of rows) {
      let cleanedExtracted = row.instructions_extracted;
      let rawExtracted = row.instructions_extracted;
      if (typeof cleanedExtracted === 'string') {
        // Try to extract JSON-LD recipeInstructions array
        let match = cleanedExtracted.match(/"recipeInstructions"\s*:\s*(\[.*\])/s);
        if (match) {
          try {
            // Attempt to parse the array
            let arr = JSON.parse(match[1]
              .replace(/\n/g, '')
              .replace(/\r/g, '')
              .replace(/\s+/g, ' ')
              .replace(/([,{])\s*([a-zA-Z0-9_@]+)\s*:/g, '$1"$2":') // ensure keys are quoted
            );
            if (Array.isArray(arr)) {
              // Only keep the instruction text, remove all keys like '@type'.
              cleanedExtracted = arr.map(step => {
                if (typeof step === 'string') {
                  // Remove any leading/trailing quotes or whitespace
                  return step.trim().replace(/^"|"$/g, '');
                }
                if (step && typeof step.text === 'string') {
                  // Remove leading/trailing whitespace from text
                  return step.text.trim();
                }
                return '';
              }).filter(Boolean).join('\n');
              cleanedExtracted = cleanedExtracted.replace(/[Â]/g, '');
            }
          } catch (e) {
            // fallback to regex cleaning if JSON parse fails
            cleanedExtracted = cleanedExtracted
              .replace(/"recipeInstructions"\s*:\s*\[.*?\]/gs, '')
              .replace(/\{\s*"@type"\s*:\s*"HowToStep".*?\}/gs, '')
              .replace(/<\/?p>/gi, ' ')
              .replace(/<br\s*\/?\s*>/gi, ' ')
              .replace(/<[^>]+>/g, '')
              .replace(/[Â]/g, '')
              .replace(/\s+/g, ' ')
              .trim();
          }
        } else {
          cleanedExtracted = cleanedExtracted
            .replace(/"recipeInstructions"\s*:\s*\[.*?\]/gs, '')
            .replace(/\{\s*"@type"\s*:\s*"HowToStep".*?\}/gs, '')
            .replace(/<\/?p>/gi, ' ')
            .replace(/<br\s*\/?\s*>/gi, ' ')
            .replace(/<[^>]+>/g, '')
            .replace(/[Â]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        }
      }
      cleanedExtracted = String(cleanedExtracted || '').replace(/JSON-LD\s+Recipe\s+Instructions\s*:/gi, ' ').trim();
      const numberedDisplay = formatInstructionsAsNumberedSentences(cleanedExtracted);

      // Debug output for extracted instructions
      console.log(`[CLEANUP] Recipe ID ${row.id}: rawExtracted=`, rawExtracted);
      console.log(`[CLEANUP] Recipe ID ${row.id}: cleanedExtracted=`, cleanedExtracted);
      // Always write to instructions_display, never overwrite instructions
      if (numberedDisplay && numberedDisplay.length > 0) {
        await pool.query('UPDATE recipes SET instructions_display = $1 WHERE id = $2', [numberedDisplay, row.id]);
        console.log(`[CLEANUP] Recipe ID ${row.id}: Cleaned extracted_instructions and copied to instructions_display.`);
      } else if (row.instructions) {
        let cleaned = row.instructions
          .replace(/JSON-LD\s+Recipe\s+Instructions\s*:/gi, ' ')
          .replace(/"recipeInstructions"\s*:\s*\[.*?\]/gs, '')
          .replace(/\{\s*"@type"\s*:\s*"HowToStep".*?\}/gs, '')
          .replace(/<\/?p>/gi, ' ')
          .replace(/<br\s*\/?\s*>/gi, ' ')
          .replace(/<[^>]+>/g, '')
          .replace(/[Â]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        const numberedFallback = formatInstructionsAsNumberedSentences(cleaned);
        await pool.query('UPDATE recipes SET instructions_display = $1 WHERE id = $2', [numberedFallback || cleaned, row.id]);
        console.log(`[CLEANUP] Recipe ID ${row.id}: Cleaned instructions and copied to instructions_display.`);
      } else {
        console.log(`[CLEANUP] Recipe ID ${row.id}: No instructions, skipping.`);
      }
      cleanupProgress.current++;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    cleanupProgress.running = false;
    console.log(`[CLEANUP] Stepwise cleanup complete. Updated ${cleanupProgress.current} recipes.`);
    res.json({ success: true, message: 'Stepwise cleanup complete.' });
  } catch (e) {
    cleanupProgress.running = false;
    console.error('[CLEANUP] Error during cleanup:', e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/cleanup-instructions-progress', (req, res) => {
  res.json(cleanupProgress);
});
// --- Cleanup Instructions API ---
router.post('/cleanup-instructions', (req, res) => {
  console.log('[CLEANUP] Starting cleanup of instructions...');
  db.all('SELECT id, instructions FROM recipes', [], (err, rows) => {
    if (err) {
      console.error('[CLEANUP] DB error:', err);
      return res.status(500).json({ error: err.message });
    }
    let updated = 0;
    let checked = 0;
    let total = rows.length;
    let finished = 0;
    if (total === 0) {
      console.log('[CLEANUP] No recipes found.');
      return res.json({ success: true, updated: 0 });
    }
    rows.forEach(row => {
      checked++;
      if (!row.instructions) {
        console.log(`[CLEANUP] Recipe ID ${row.id}: No instructions, skipping.`);
        finished++;
        if (finished === total) {
          console.log(`[CLEANUP] Checked ${checked} recipes, updated ${updated}.`);
          res.json({ success: true, updated });
        }
        return;
      }
      // Remove <p>, </p>, <br>, <br/>, <br /> and all HTML tags
      let cleaned = row.instructions
        .replace(/<\/?p>/gi, ' ')
        .replace(/<br\s*\/?\s*>/gi, ' ')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ') // collapse whitespace
        .trim();
      if (cleaned !== row.instructions.trim()) {
        db.run('UPDATE recipes SET instructions = ? WHERE id = ?', [cleaned, row.id], function(err2) {
          if (!err2) {
            updated++;
            console.log(`[CLEANUP] Recipe ID ${row.id}: Cleaned and updated.`);
          } else {
            console.error(`[CLEANUP] Recipe ID ${row.id}: Update error:`, err2);
          }
          finished++;
          if (finished === total) {
            console.log(`[CLEANUP] Checked ${checked} recipes, updated ${updated}.`);
            res.json({ success: true, updated });
          }
        });
      } else {
        console.log(`[CLEANUP] Recipe ID ${row.id}: No change needed.`);
        finished++;
        if (finished === total) {
          console.log(`[CLEANUP] Checked ${checked} recipes, updated ${updated}.`);
          res.json({ success: true, updated });
        }
      }
    });
  });
});

// Get all recipes (with upload raw_data)
router.get('/', async (req, res) => {
  const sql = `
    SELECT recipes.*, recipes.instructions_display, recipes.ingredients_display, uploads.raw_data as upload_raw_data
    FROM recipes
    LEFT JOIN uploads ON recipes.uploaded_recipe_id = uploads.id
    ORDER BY recipes.id DESC
  `;
  try {
    const result = await pool.query(sql);
    console.log('[DEBUG /api/recipes] Number of recipes returned:', result.rows.length);
    res.json(result.rows);
  } catch (err) {
    console.error('[DEBUG /api/recipes] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Create a new recipe
router.post('/recipes', async (req, res) => {
  const { name, description } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Recipe name is required.' });
  }
  try {
    const result = await pool.query('INSERT INTO recipes (name, description) VALUES ($1, $2) RETURNING id', [name, description]);
    res.json({ id: result.rows[0].id, name, description });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update recipe
router.put('/recipes/:id', async (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Recipe name is required.' });
  }
  try {
    const result = await pool.query('UPDATE recipes SET name = $1, description = $2 WHERE id = $3 RETURNING id', [name, description, id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Recipe not found.' });
    res.json({ id, name, description });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete recipe
router.delete('/recipes/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM recipes WHERE id = $1', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Recipe not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get recipe options for dropdown
router.get('/dropdown', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name FROM recipes ORDER BY id DESC');
    res.json({ recipes: result.rows || [] });
  } catch (err) {
    console.error('[DEBUG] Error fetching recipes:', err);
    res.status(500).json({ error: 'Failed to fetch recipes.' });
  }
});

// Get a single recipe by ID (for Recipe Details page) - THIS ROUTE MUST BE LAST
router.get('/recipes/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT *,
        CASE WHEN instructions IS NULL OR instructions = '' THEN instructions_extracted ELSE instructions END as instructions
       FROM recipes WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Recipe not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch recipe.' });
  }
});

module.exports = router;

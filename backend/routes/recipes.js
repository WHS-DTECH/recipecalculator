
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:password@host:port/db?sslmode=require';
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

// PUT /api/recipes/:id/raw - Save raw data for a recipe (file only)
router.put('/recipes/:id/raw', async (req, res) => {
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
    const result = await pool.query('SELECT id, recipeid, name FROM recipe_display ORDER BY name');
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
    const result = await pool.query('SELECT id, instructions, instructions_extracted FROM recipes');
    const rows = result.rows;
    cleanupProgress.total = rows.length;
    cleanupProgress.current = 0;
    for (const row of rows) {
      let cleanedExtracted = row.instructions_extracted;
      let rawExtracted = row.instructions_extracted;
      if (typeof cleanedExtracted === 'string') {
        // Directly strip HowToStep and text markup, leaving only instructions
        cleanedExtracted = cleanedExtracted
          .replace(/"@type"\s*:\s*"HowToStep",?/g, '')
          .replace(/"text"\s*:\s*"/g, '')
          .replace(/[\[\]{}]/g, '')
          .replace(/"/g, '')
          .replace(/,/g, '\n')
          .replace(/\\n/g, '\n')
          .replace(/<\/?p>/gi, ' ')
          .replace(/<br\s*\/?\s*>/gi, ' ')
          .replace(/<[^>]+>/g, '')
          .replace(/[Â]/g, '')
          .replace(/\s+/g, ' ')
          .replace(/\n+/g, '\n')
          .trim();
      }
      // Debug output for extracted instructions
      console.log(`[CLEANUP] Recipe ID ${row.id}: rawExtracted=`, rawExtracted);
      console.log(`[CLEANUP] Recipe ID ${row.id}: cleanedExtracted=`, cleanedExtracted);
      // Always write to instructions_display, never overwrite instructions
      if (cleanedExtracted && cleanedExtracted.length > 0) {
        try {
          const updateResult = await pool.query('UPDATE recipes SET instructions_display = $1 WHERE id = $2', [cleanedExtracted, row.id]);
          console.log(`[CLEANUP] Recipe ID ${row.id}: Cleaned extracted_instructions and copied to instructions_display. Updated rows: ${updateResult.rowCount}`);
        } catch (err) {
          console.error(`[CLEANUP][ERROR] Recipe ID ${row.id}: Failed to update instructions_display.`, err);
        }
      } else if (row.instructions) {
        let cleaned = row.instructions
          .replace(/"recipeInstructions"\s*:\s*\[.*?\]/gs, '')
          .replace(/\{\s*"@type"\s*:\s*"HowToStep".*?\}/gs, '')
          .replace(/<\/?p>/gi, ' ')
          .replace(/<br\s*\/?\s*>/gi, ' ')
          .replace(/<[^>]+>/g, '')
          .replace(/[Â]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        if (cleaned !== row.instructions.trim()) {
          try {
            const updateResult = await pool.query('UPDATE recipes SET instructions_display = $1 WHERE id = $2', [cleaned, row.id]);
            console.log(`[CLEANUP] Recipe ID ${row.id}: Cleaned instructions and copied to instructions_display. Updated rows: ${updateResult.rowCount}`);
          } catch (err) {
            console.error(`[CLEANUP][ERROR] Recipe ID ${row.id}: Failed to update instructions_display.`, err);
          }
        } else {
          console.log(`[CLEANUP] Recipe ID ${row.id}: No change needed.`);
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
    // Use ingredients_display if present, else fallback to ingredients
    const ingredients = row.ingredients_display || row.ingredients;
    // Debug log the data being upserted
    console.log('[DISPLAY][DEBUG] Upserting to recipe_display:', {
      name: row.name,
      description: row.description,
      ingredients,
      serving_size: row.serving_size,
      url: row.url,
      instructions: row.instructions,
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
      row.instructions,
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
    // Use Postgres
    const result = await pool.query('SELECT id, ingredients FROM recipes');
    const rows = result.rows;
    cleanupIngredientsProgress.total = rows.length;
    cleanupIngredientsProgress.current = 0;
    for (const row of rows) {
      let cleaned = row.ingredients;
      if (typeof cleaned === 'string') {
        cleaned = cleaned
          .replace(/<li>/gi, '')
          .replace(/<\/li>/gi, '\n')
          .replace(/<ul>|<\/ul>/gi, '')
          .replace(/<br\s*\/??\s*>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/[Â]/g, '')
          .replace(/"?recipeIngredient"?\s*:\s*/gi, '') // Remove recipeIngredient keys
          .replace(/\"/g, '') // Remove all double quotes
          .replace(/^\[|\]$/g, '') // Remove leading/trailing brackets
          .replace(/^\s*\[\s*\]/g, '') // Remove empty array brackets
          .replace(/,\s*/g, '<br>') // Replace commas with <br> tags
          .replace(/\\[tnr]/g, ' ') // Remove \t, \n, \r
          .replace(/\s+/g, ' ')
          .replace(/\n+/g, '\n')
          .split('\n')
          .map(line => line.trim())
          .filter(line => line && !/^\d+\s*Star$/i.test(line) && !/^Star$/i.test(line) && !/^\d+$/.test(line))
          .join(' ')
          .replace(/\s+/g, ' ')
          .replace(/,?\s*5 Star 4 Star 3 Star 2 Star 1 Star/i, '') // Remove trailing '5 Star 4 Star 3 Star 2 Star 1 Star'
          .trim();
      }
      await pool.query('UPDATE recipes SET Ingredients_display = $1 WHERE id = $2', [cleaned, row.id]);
      console.log(`[CLEANUP] Recipe ID ${row.id}: Cleaned ingredients and copied to Ingredients_display.`);
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
      // Debug output for extracted instructions
      console.log(`[CLEANUP] Recipe ID ${row.id}: rawExtracted=`, rawExtracted);
      console.log(`[CLEANUP] Recipe ID ${row.id}: cleanedExtracted=`, cleanedExtracted);
      // Always write to instructions_display, never overwrite instructions
      if (cleanedExtracted && cleanedExtracted.length > 0) {
        await pool.query('UPDATE recipes SET instructions_display = $1 WHERE id = $2', [cleanedExtracted, row.id]);
        console.log(`[CLEANUP] Recipe ID ${row.id}: Cleaned extracted_instructions and copied to instructions_display.`);
      } else if (row.instructions) {
        let cleaned = row.instructions
          .replace(/"recipeInstructions"\s*:\s*\[.*?\]/gs, '')
          .replace(/\{\s*"@type"\s*:\s*"HowToStep".*?\}/gs, '')
          .replace(/<\/?p>/gi, ' ')
          .replace(/<br\s*\/?\s*>/gi, ' ')
          .replace(/<[^>]+>/g, '')
          .replace(/[Â]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        if (cleaned !== row.instructions.trim()) {
          await pool.query('UPDATE recipes SET instructions_display = $1 WHERE id = $2', [cleaned, row.id]);
          console.log(`[CLEANUP] Recipe ID ${row.id}: Cleaned instructions and copied to instructions_display.`);
        } else {
          console.log(`[CLEANUP] Recipe ID ${row.id}: No change needed.`);
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
router.get('/recipes', async (req, res) => {
  const sql = `
    SELECT recipes.*, recipes.instructions_display, recipes.ingredients_display, uploads.raw_data as upload_raw_data
    FROM recipes
    LEFT JOIN uploads ON recipes.uploaded_recipe_id = uploads.id
  `;
  try {
    const result = await pool.query(sql);
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
    const result = await pool.query('SELECT id, name FROM recipes ORDER BY name');
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

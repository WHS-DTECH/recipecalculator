
const express = require('express');
const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

const { Pool } = require('pg');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:password@host:port/db?sslmode=require';
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

// Load extracted ingredients utility
const { loadExtractedIngredients } = require('./public/load_extracted_ingredients');
// --- API: Load ExtractedIngredients file for a recipe ---
app.get('/api/extracted-ingredients/:id/load', (req, res) => {
  const recipeId = req.params.id;
  loadExtractedIngredients(recipeId, (err, data) => {
    if (err) {
      return res.status(404).json({ success: false, error: 'ExtractedIngredients file not found', details: err.message });
    }
    res.json({ success: true, recipeId, data });
  });
});

const { execFile } = require('child_process');
// --- Puppeteer Rendered HTML Extraction Endpoint ---
app.get('/api/extract-rendered-html', (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send('Missing url parameter');
  const scriptPath = path.join(__dirname, 'public', 'extractor_raw_puppeteer.js');
  execFile('node', [scriptPath, url], { timeout: 30000, maxBuffer: 5 * 1024 * 1024 }, (err, stdout, stderr) => {
    if (err) {
      console.error('[Puppeteer Extract Error]', err, stderr);
      return res.status(500).send('Failed to extract rendered HTML.');
    }
    res.type('text/html').send(stdout);
  });
});

// --- Sync All Recipes to Display Table ---
app.post('/api/recipes/sync-all-to-display', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM recipes');
    let count = 0;
    for (const recipe of result.rows) {
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
      await pool.query(upsertSql, [
        recipe.name,
        recipe.description,
        recipe.ingredients_display,
        recipe.serving_size,
        recipe.url,
        recipe.instructions,
        recipe.id
      ]);
      count++;
    }
    res.json({ success: true, count });
  } catch (err) {
    console.error('[SYNC ALL TO DISPLAY][ERROR]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});


// --- Stepwise Cleanup Progress State ---
let cleanupInstructionsProgress = { progress: 0, total: 0 };
let cleanupIngredientsProgress = { progress: 0, total: 0 };

// --- Stepwise Cleanup Instructions ---
app.post('/api/recipes/cleanup-instructions-stepwise', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, instructions FROM recipes');
    cleanupInstructionsProgress.total = result.rows.length;
    cleanupInstructionsProgress.progress = 0;
    for (const row of result.rows) {
      let cleaned = row.instructions;
      if (cleaned) {
        cleaned = cleaned
          .replace(/<\/p>/gi, ' ')
          .replace(/<p>/gi, ' ')
          .replace(/<br\s*\/?>/gi, ' ')
          .replace(/<[^>]+>/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        await pool.query('UPDATE recipes SET instructions = $1 WHERE id = $2', [cleaned, row.id]);
      }
      cleanupInstructionsProgress.progress++;
    }
    res.json({ success: true, updated: cleanupInstructionsProgress.total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/recipes/cleanup-instructions-progress', (req, res) => {
  res.json(cleanupInstructionsProgress);
});

// --- Stepwise Cleanup Ingredients ---
app.post('/api/recipes/cleanup-ingredients-stepwise', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, ingredients, extracted_ingredients FROM recipes');
    cleanupIngredientsProgress.total = result.rows.length;
    cleanupIngredientsProgress.progress = 0;
    for (const row of result.rows) {
      let cleaned = row.extracted_ingredients && row.extracted_ingredients.trim() ? row.extracted_ingredients : row.ingredients;
      console.log(`[CLEANUP][ROW] id=${row.id}, original to clean=`, cleaned);
      if (cleaned) {
        // Remove HTML tags
        cleaned = cleaned.replace(/<[^>]+>/g, '');
        // Remove bullet points (•, *, -, etc.) at line start
        cleaned = cleaned.replace(/^[\s]*[-•*\u2022\u25CF\u25A0]+[\s]*/gm, '');
        // Remove all brackets []
        cleaned = cleaned.replace(/[\[\]]/g, '');
        // Remove all double quotes
        cleaned = cleaned.replace(/"/g, '');
        // Remove ranking system like '5 Star', '4 Star', etc. (case-insensitive)
        cleaned = cleaned.replace(/([1-5]\s*Star)/gi, '');
        // Replace commas with <br>
        cleaned = cleaned.replace(/\s*,\s*/g, '<br>');
        // Split into lines, trim, remove empty, join with <br>
        cleaned = cleaned.split(/\r?\n|<br>/).map(line => line.trim()).filter(line => line.length > 0).join('<br>');
        cleaned = cleaned.trim();
        console.log(`[CLEANUP][ROW] id=${row.id}, cleaned ingredients=`, cleaned);
        const updateResult = await pool.query('UPDATE recipes SET ingredients_display = $1 WHERE id = $2 RETURNING ingredients_display', [cleaned, row.id]);
        console.log(`[CLEANUP][ROW] id=${row.id}, DB updated ingredients_display=`, updateResult.rows[0]?.ingredients_display);
      } else {
        console.log(`[CLEANUP][ROW] id=${row.id}, no ingredients to clean.`);
      }
      cleanupIngredientsProgress.progress++;
    }
    res.json({ success: true, updated: cleanupIngredientsProgress.total });
  } catch (err) {
    console.error('[CLEANUP][ERROR]', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/recipes/cleanup-ingredients-progress', (req, res) => {
  res.json(cleanupIngredientsProgress);
});


// --- Title Solution Endpoint (saves to DB) ---
app.post('/api/title-extractor/solution', async (req, res) => {
  const { recipeId, solution } = req.body;
  console.log('[DEBUG /api/title-extractor/solution] Called with:', { recipeId, solution });
  if (!recipeId || !solution) {
    console.log('[DEBUG /api/title-extractor/solution] Missing recipeId or solution');
    return res.status(400).json({ error: 'Recipe ID and solution are required.' });
  }
  try {
    // Save to the "title_extracted" column (create if not exists) or fallback to "name"
    // If you have a title_extracted column:
    // const result = await pool.query('UPDATE recipes SET title_extracted = $1 WHERE id = $2', [solution, recipeId]);
    // If not, fallback to updating the name:
    const result = await pool.query('UPDATE recipes SET name = $1 WHERE id = $2', [solution, recipeId]);
    if (result.rowCount === 0) {
      console.log('[DEBUG /api/title-extractor/solution] No recipe found for id:', recipeId);
      return res.status(404).json({ error: 'Recipe not found.' });
    }
    console.log('[DEBUG /api/title-extractor/solution] Successfully updated title for recipe id:', recipeId);
    res.json({ success: true });
  } catch (err) {
    console.error('[DEBUG /api/title-extractor/solution] Failed to save title solution:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// --- Upload Recipe by URL ---
app.post('/api/uploads', async (req, res) => {
  const { recipe_title, upload_type, source_url, uploaded_by, upload_date, raw_data } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO uploads (recipe_title, upload_type, source_url, uploaded_by, upload_date, raw_data) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [recipe_title, upload_type, source_url, uploaded_by, upload_date, raw_data]
    );
    res.json({ success: true, upload_id: result.rows[0].id });
  } catch (err) {
    console.error('[DEBUG /api/uploads] Failed to insert upload:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get all uploads (for recipe selector)
app.get('/api/uploads', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM uploads ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// --- Suggestions API ---
app.get('/api/suggestions', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM suggestions ORDER BY date DESC, id DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post('/api/suggestions', async (req, res) => {
  const { date, recipe_name, suggested_by, email, url, reason } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO suggestions (date, recipe_name, suggested_by, email, url, reason) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [date, recipe_name, suggested_by, email, url, reason]
    );
    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Cleanup Instructions API ---
app.post('/api/recipes/cleanup-instructions', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, instructions FROM recipes');
    let updated = 0;
    for (const row of result.rows) {
      if (!row.instructions) continue;
      // Remove <p>, </p>, <br>, <br/>, <br /> and all HTML tags
      let cleaned = row.instructions
        .replace(/<\/?p>/gi, ' ')
        .replace(/<br\s*\/?\s*>/gi, ' ')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ') // collapse whitespace
        .trim();
      await pool.query('UPDATE recipes SET instructions = $1 WHERE id = $2', [cleaned, row.id]);
      updated++;
    }
    res.json({ success: true, updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Set default port if not defined
const PORT = process.env.PORT || 4000;

// RawDataTXT HTML Preview Route (must come BEFORE express.static)
const path = require('path');
// const fs = require('fs'); // Already declared above

app.put('/api/uploads/:id/raw', async (req, res) => {
  const { id } = req.params;
  let { recipe_id, raw_data } = req.body;
  console.log('[DEBUG /api/uploads/:id/raw] Called with:', { id, recipe_id, raw_data_length: raw_data ? raw_data.length : undefined });
  // Fallback: if recipe_id is not provided, use id
  if (!recipe_id) {
    recipe_id = id;
    console.log('[DEBUG /api/uploads/:id/raw] recipe_id missing, falling back to id:', id);
  }
  if (!raw_data) {
    console.log('[DEBUG /api/uploads/:id/raw] Missing raw_data');
    return res.json({ success: false, error: 'Missing raw_data' });
  }
  const fs = require('fs');
  const rawDataDir = path.join(__dirname, 'public', 'RawDataTXT');
  // Ensure directory exists
  if (!fs.existsSync(rawDataDir)) {
    fs.mkdirSync(rawDataDir, { recursive: true });
  }
  // Always use recipe_id for file naming if possible
  const fileName = `${recipe_id}.txt`;
  const filePath = path.join(rawDataDir, fileName);
  console.log('[DEBUG /api/uploads/:id/raw] Attempting to write file to:', filePath);
  try {
    await pool.query('UPDATE uploads SET raw_data = $1 WHERE id = $2', [raw_data, id]);
  } catch (err) {
    console.log('[DEBUG /api/uploads/:id/raw] Failed to update uploads table:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to update uploads table', details: err.message });
  }
  // Save raw data to file
  fs.writeFile(filePath, raw_data, async (fileErr) => {
    if (fileErr) {
      console.log('[DEBUG /api/uploads/:id/raw] Failed to write raw data file:', fileErr.message);
      console.log('[DEBUG /api/uploads/:id/raw] Tried to write to:', filePath);
      return res.json({ success: true, file: false, fileError: fileErr.message, filePath });
    }
    console.log('[DEBUG /api/uploads/:id/raw] Successfully updated uploads table and wrote file for recipe_id:', recipe_id, 'id:', id);
    console.log('[DEBUG /api/uploads/:id/raw] File written to:', filePath);
    // Now split ingredient quantities (existing logic)
    let rows;
    try {
      const result = await pool.query('SELECT id, ingredient_name FROM ingredients_inventory WHERE recipe_id = $1', [recipe_id]);
      rows = result.rows;
    } catch (err) {
      console.log('[Split Quantity] DB error selecting:', err);
      return res.json({ success: false, error: err.message });
    }
    if (!rows.length) {
      // console.log('[Split Quantity] No ingredients found for recipe_id:', recipe_id);
      return res.json({ success: true, file: true, updated: 0, failed: 0, note: 'No ingredients found.' });
    }
    let done = 0, failed = 0;
    for (const row of rows) {
      let quantity = '', fooditem = '';
      console.log(`[Split Quantity] Processing row id=${row.id}, ingredient_name='${row.ingredient_name}'`);
      const match = row.ingredient_name.match(/^([\d\s\/.¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]+\s*(?:cup|cups|tbsp|tablespoon|tablespoons|tsp|teaspoon|teaspoons|g|gram|grams|kg|kilogram|kilograms|ml|l|litre|litres|liter|liters|oz|ounce|ounces|lb|pound|pounds|pinch|dash|clove|cloves|can|cans|slice|slices|stick|sticks|packet|packets|piece|pieces|egg|eggs|drop|drops|block|blocks|sheet|sheets|bunch|bunches|sprig|sprigs|head|heads|filet|filets|fillet|fillets|bag|bags|jar|jars|bottle|bottles|container|containers|box|boxes|bar|bars|roll|rolls|strip|strips|cm|mm|inch|inches|pinches|handful|handfuls|dozen|leaves|stalks|ribs|segments|cubes|sprinkles|splashes|litre|litres|millilitre|millilitres|quart|quarts|pint|pints|gallon|gallons)\b)\s*(.*)$/i);
      if (match) {
        quantity = match[1].trim();
        fooditem = match[2].trim();
        console.log(`[Split Quantity] Regex matched. quantity='${quantity}', fooditem='${fooditem}'`);
      } else {
        fooditem = row.ingredient_name.trim();
        console.log(`[Split Quantity] Regex did not match. fooditem='${fooditem}'`);
      }
      try {
        await pool.query('UPDATE ingredients_inventory SET quantity = $1, fooditem = $2 WHERE id = $3', [quantity, fooditem, row.id]);
        done++;
      } catch (err2) {
        failed++;
        console.log(`[Split Quantity] Failed to update row id=${row.id}:`, err2.message);
      }
    }
    // All updates attempted
    console.log(`[Split Quantity] Finished. Updated: ${done}, Failed: ${failed}`);
    res.json({ success: failed === 0, file: true, updated: done, failed });
  });
});

// --- Transfer Instructions Extracted to Instructions ---
app.post('/api/recipes/:id/transfer-instructions', (req, res) => {
  const { id } = req.params;
  db.get('SELECT instructions_extracted FROM recipes WHERE id = ?', [id], (err, row) => {
    if (err || !row) {
      return res.status(404).json({ success: false, error: 'Recipe not found.' });
    }
    db.run('UPDATE recipes SET instructions = ? WHERE id = ?', [row.instructions_extracted, id], function(err2) {
      if (err2) {
        return res.status(500).json({ success: false, error: err2.message });
      }
      res.json({ success: true });
    });
  });
});


// --- Ingredients Solution Endpoint (saves to DB) ---
app.post('/api/ingredients-extractor/solution', (req, res) => {
  const { recipeId, solution } = req.body;
  console.log('[DEBUG /api/ingredients-extractor/solution] Called with:', { recipeId, solution });
  if (!recipeId || !solution) {
    console.log('[DEBUG /api/ingredients-extractor/solution] Missing recipeId or solution');
    return res.status(400).json({ error: 'Recipe ID and solution are required.' });
  }
  // Use Postgres pool.query
  pool.query('UPDATE recipes SET extracted_ingredients = $1 WHERE id = $2', [solution, recipeId], (err, result) => {
    if (err) {
      console.error('[DEBUG /api/ingredients-extractor/solution] Failed to save ingredients solution:', err.message);
      return res.status(500).json({ error: err.message });
    }
    if (result.rowCount === 0) {
      console.log('[DEBUG /api/ingredients-extractor/solution] No recipe found for id:', recipeId);
      return res.status(404).json({ error: 'Recipe not found.' });
    }
    console.log('[DEBUG /api/ingredients-extractor/solution] Successfully updated ingredients for recipe id:', recipeId);
    res.json({ success: true });
  });
});


const fetch = require('node-fetch');
// Endpoint to fetch HTML from a URL (server-side, avoids CORS)
app.post('/api/fetch-html', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'Missing url' });
  // Set a timeout (in ms)
  const FETCH_TIMEOUT = 7000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!response.ok) {
      return res.status(500).json({
        error: 'This web address does not work with our system. Please try a different recipe website.'
      });
    }
    const html = await response.text();
    res.json({ html });
  } catch (err) {
    clearTimeout(timeout);
    let userMessage = 'This web address does not work with our system. Please try a different recipe website.';
    if (err.name === 'AbortError') {
      userMessage = 'This web address is taking too long to respond and may not work with our system. Please try a different recipe website.';
    }
    res.status(500).json({
      error: userMessage
    });
  }
});


// Delete an upload record by ID
app.delete('/api/uploads/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM uploads WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ success: false, error: 'Failed to delete upload record.' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ success: false, error: 'Upload record not found.' });
    }
    res.json({ success: true });
  });
});



// --- Recipe Search Endpoint ---
// Returns recipes matching a query (by name)
app.get('/api/search/recipes', (req, res) => {
  const q = (req.query.q || '').trim();
  let sql = 'SELECT id, name FROM recipes';
  let params = [];
  if (q) {
    sql += ' WHERE name LIKE ?';
    params = [`%${q}%`];
  }
  sql += ' ORDER BY name COLLATE NOCASE';
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ recipes: rows });
  });
});
// --- Staff Search Endpoint ---
// Returns staff/teachers matching a query (by name or code)
app.get('/api/search/staff', async (req, res) => {
  const q = (req.query.q || '').trim();
  let sql = 'SELECT DISTINCT "Teacher", "Teacher Name" as "TeacherName" FROM kamar_timetable';
  let params = [];
  if (q) {
    sql += ' WHERE "Teacher" ILIKE $1 OR "Teacher Name" ILIKE $2';
    params = [`%${q}%`, `%${q}%`];
  }
  sql += ' ORDER BY "TeacherName"';
  try {
    const result = await pool.query(sql, params);
    res.json({ staff: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Class Upload Endpoints ---

// POST /api/class-upload: Upload class CSV data
app.post('/api/class-upload', async (req, res) => {
  const { classes } = req.body;
  if (!Array.isArray(classes) || classes.length === 0) {
    return res.status(400).json({ success: false, error: 'No class data provided.' });
  }
  let inserted = 0;
  try {
    for (const row of classes) {
      if (row.length >= 9) {
        await pool.query(
          'INSERT INTO class_upload (ttcode, level, name, qualification, department, sub_department, teacher_in_charge, description, star) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
          [row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8]]
        );
        inserted++;
      }
    }
    res.json({ success: true, inserted });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/class_upload/all: Fetch all class records
app.get('/api/class_upload/all', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM class_upload');
    res.json({ classes: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch class upload data.' });
  }
});

// DELETE /api/class-upload/all: Delete all class records
app.delete('/api/class-upload/all', async (req, res) => {
  try {
    await pool.query('DELETE FROM class_upload');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to delete class records.' });
  }
});


// --- Timetable Table Fetch Endpoint ---
app.get('/api/timetable/all', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM kamar_timetable');
    res.json({ timetable: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch timetable data.' });
  }
});
    // ...existing code...
    // --- Instructions Solution Endpoint (saves to DB) ---
    app.post('/api/instructions-extractor/solution', async (req, res) => {
      const { recipeId, solution } = req.body;
      if (!recipeId || !solution) {
        return res.status(400).json({ error: 'Recipe ID and solution are required.' });
      }
      try {
        const result = await pool.query('UPDATE recipes SET instructions_extracted = $1, instructions = $2 WHERE id = $3', [solution, solution, recipeId]);
        if (result.rowCount === 0) {
          return res.status(404).json({ error: 'Recipe not found.' });
        }
        res.json({ success: true });
      } catch (err) {
        console.error('Failed to save instructions solution:', err.message);
        return res.status(500).json({ error: err.message });
      }
    });


    // --- Ingredients Inventory Endpoints ---




        // --- Sync Uploaded Recipes to Recipes Table ---
    app.post('/api/recipes/sync-from-uploads', async (req, res) => {
      try {
        const uploadsResult = await pool.query('SELECT * FROM uploads');
        const uploads = uploadsResult.rows;
        let inserted = 0;
        if (!uploads.length) return res.json({ success: true, inserted: 0 });
        for (const upload of uploads) {
          const recipeResult = await pool.query('SELECT * FROM recipes WHERE uploaded_recipe_id = $1', [upload.id]);
          if (recipeResult.rows.length === 0) {
            await pool.query('INSERT INTO recipes (uploaded_recipe_id, name, url) VALUES ($1, $2, $3)', [upload.id, upload.recipe_title, upload.source_url]);
            inserted++;
          }
        }
        res.json({ success: true, inserted });
      } catch (err) {
        console.error('[DEBUG /api/recipes/sync-from-uploads] Error:', err);
        res.status(500).json({ success: false, error: err.message });
      }
    });




    // POST: Sync ingredients_inventory from main ingredients table (with quantity)
    app.post('/api/ingredients-inventory/sync', (req, res) => {
      db.run('DELETE FROM ingredients_inventory', [], function(err) {
        if (err) return res.status(500).json({ success: false, error: err.message });
        db.all('SELECT * FROM ingredients', [], (err2, rows) => {
          if (err2) return res.status(500).json({ success: false, error: err2.message });
          if (!rows.length) return res.json({ success: true, inserted: 0 });
          let done = 0, inserted = 0;
          // Helper to convert unicode and vulgar fractions to float
          function parseFraction(str) {
            const vulgarMap = {
              '¼': 0.25, '½': 0.5, '¾': 0.75,
              '⅐': 1/7, '⅑': 1/9, '⅒': 0.1, '⅓': 1/3, '⅔': 2/3, '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8, '⅙': 1/6, '⅚': 5/6, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875
            };
            str = str.trim();
            // Replace vulgar fractions
            str = str.replace(/[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, m => ' ' + vulgarMap[m]);
            // Handle mixed numbers (e.g., 1 1/2)
            let parts = str.split(' ');
            let total = 0;
            for (let part of parts) {
              if (/^\d+$/.test(part)) total += parseInt(part);
              else if (/^\d+\/\d+$/.test(part)) {
                let [n, d] = part.split('/');
                total += parseInt(n) / parseInt(d);
              } else if (!isNaN(parseFloat(part))) {
                total += parseFloat(part);
              }
            }
            return total || null;
          }
          // Accept common units
          const units = [
            'cup', 'cups', 'tbsp', 'tablespoon', 'tablespoons', 'tsp', 'teaspoon', 'teaspoons',
            'g', 'gram', 'grams', 'kg', 'kilogram', 'kilograms', 'ml', 'l', 'litre', 'litres', 'liter', 'liters',
            'oz', 'ounce', 'ounces', 'lb', 'pound', 'pounds', 'pinch', 'dash', 'clove', 'cloves', 'can', 'cans', 'slice', 'slices', 'stick', 'sticks', 'packet', 'packets', 'piece', 'pieces', 'egg', 'eggs', 'drop', 'drops', 'block', 'blocks', 'sheet', 'sheets', 'bunch', 'bunches', 'sprig', 'sprigs', 'head', 'heads', 'filet', 'filets', 'fillet', 'fillets', 'bag', 'bags', 'jar', 'jars', 'bottle', 'bottles', 'container', 'containers', 'box', 'boxes', 'bar', 'bars', 'roll', 'rolls', 'strip', 'strips', 'cm', 'mm', 'inch', 'inches', 'pinches', 'handful', 'handfuls', 'dozen', 'sheet', 'sheets', 'leaf', 'leaves', 'stalk', 'stalks', 'rib', 'ribs', 'segment', 'segments', 'piece', 'pieces', 'cube', 'cubes', 'drop', 'drops', 'sprinkle', 'sprinkles', 'dash', 'dashes', 'splash', 'splashes', 'liter', 'liters', 'milliliter', 'millilitres', 'millilitre', 'millilitres', 'quart', 'quarts', 'pint', 'pints', 'gallon', 'gallons', 'ml', 'l', 'dl', 'cl', 'mg', 'mcg', 'µg', 'kg', 'g', 'lb', 'oz', 'cup', 'cups', 'tbsp', 'tsp', 'teaspoon', 'tablespoon', 'pinch', 'dash', 'drop', 'handful', 'stick', 'slice', 'piece', 'clove', 'can', 'bunch', 'sprig', 'head', 'filet', 'fillet', 'block', 'sheet', 'bag', 'jar', 'bottle', 'container', 'box', 'bar', 'roll', 'strip', 'cm', 'mm', 'inch', 'pinches', 'handfuls', 'dozen', 'leaves', 'stalks', 'ribs', 'segments', 'cubes', 'sprinkles', 'splashes', 'litre', 'litres', 'millilitre', 'millilitres', 'quart', 'quarts', 'pint', 'pints', 'gallon', 'gallons'
          ];
          const unitPattern = units.join('|');
          const regex = new RegExp(`^([\d\s\/\.¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]+)\s*(${unitPattern})\b\s*(.*)$`, 'i');
          rows.forEach(row => {
            let measure_qty = null, measure_unit = null;
            if (row.quantity) {
              const match = row.quantity.match(regex);
              if (match) {
                measure_qty = parseFraction(match[1]);
                measure_unit = match[2];
              }
            }
            db.run('INSERT INTO ingredients_inventory (ingredient_name, recipe_id, quantity, measure_qty, measure_unit) VALUES (?, ?, ?, ?, ?)', [row.name, row.recipe_id, row.quantity, measure_qty, measure_unit], function(err3) {
              done++;
              if (!err3) inserted++;
              if (done === rows.length) {
                res.json({ success: true, inserted });
              }
            });
          });
        });
      });
    });
    // GET all ingredients inventory
    app.get('/api/ingredients-inventory', async (req, res) => {
      try {
        const result = await pool.query('SELECT * FROM ingredients_inventory');
        res.json(result.rows);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // DELETE all ingredients inventory
    app.delete('/api/ingredients-inventory', (req, res) => {
      db.run('DELETE FROM ingredients_inventory', [], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
      });
    });

    // POST: Reformat/Parse all ingredients (parse quantity into measure_qty and measure_unit, and trim/lowercase name)
    app.post('/api/ingredients-inventory/reformat', (req, res) => {
      db.all('SELECT * FROM ingredients_inventory', [], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        let updates = 0;
        let done = 0;
        if (rows.length === 0) return res.json({ success: true });
        rows.forEach(row => {
          // Parse quantity into measure_qty and measure_unit
          let measure_qty = null, measure_unit = null;
          if (row.quantity) {
            const match = row.quantity.match(/([\d.]+)\s*([a-zA-Z]+)\s*(.*)/);
            if (match) {
              measure_qty = parseFloat(match[1]);
              measure_unit = match[2];
            }
          }
          db.run('UPDATE ingredients_inventory SET measure_qty = ?, measure_unit = ? WHERE id = ?', [measure_qty, measure_unit, row.id], function(err2) {
            done++;
            if (!err2) updates++;
            if (done === rows.length) {
              res.json({ success: true, updated: updates });
            }
          });
        });
      });
    });

    // Endpoint to extract raw HTML/text from a given URL
    app.post('/api/extract-raw', async (req, res) => {
      try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'No URL provided.' });

        const response = await fetch(url);
        if (!response.ok) {
          console.error('Failed to fetch URL:', url, 'Status:', response.status, response.statusText);
          return res.status(500).json({ error: 'Failed to fetch URL.', status: response.status, statusText: response.statusText });
        }

        const html = await response.text();
        res.json({ raw: html });
      } catch (err) {
        console.error('Error in /api/extract-raw:', err);
        res.status(500).json({ error: 'Failed to extract data from URL.', details: err.message });
      }
    });

    // Get a single upload by ID
    app.get('/api/uploads/:id', async (req, res) => {
      const { id } = req.params;
      try {
        const result = await pool.query('SELECT * FROM uploads WHERE id = $1', [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Upload not found.' });
        res.json(result.rows[0]);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });


// Update raw_data for an upload and split ingredient quantities
app.put('/api/uploads/:id/raw', (req, res) => {
  const { id } = req.params;
  const { recipe_id, raw_data } = req.body;
  // (Removed old db.run call, now using pool.query above)
  if (!fs.existsSync(rawDataDir)) {
    fs.mkdirSync(rawDataDir, { recursive: true });
  }
  const filePath = path.join(rawDataDir, `${id}.txt`);
  console.log('[DEBUG /api/uploads/:id/raw] Attempting to write file to:', filePath);
  db.run('UPDATE uploads SET raw_data = ? WHERE id = ?', [raw_data, id], function(err) {
    if (err) {
      console.log('[DEBUG /api/uploads/:id/raw] Failed to update uploads table:', err.message);
      return res.status(500).json({ success: false, error: 'Failed to update uploads table', details: err.message });
    }
    // Save raw data to file
    fs.writeFile(filePath, raw_data, (fileErr) => {
      if (fileErr) {
        console.log('[DEBUG /api/uploads/:id/raw] Failed to write raw data file:', fileErr.message);
        console.log('[DEBUG /api/uploads/:id/raw] Tried to write to:', filePath);
        return res.json({ success: true, file: false, fileError: fileErr.message, filePath });
      }
      console.log('[DEBUG /api/uploads/:id/raw] Successfully updated uploads table and wrote file for id:', id);
      console.log('[DEBUG /api/uploads/:id/raw] File written to:', filePath);
      // Now split ingredient quantities (existing logic)
      db.all('SELECT id, ingredient_name FROM ingredients_inventory WHERE recipe_id = ?', [recipe_id], (err, rows) => {
        if (err) {
          console.log('[Split Quantity] DB error selecting:', err);
          return res.json({ success: false, error: err.message });
        }
        if (!rows.length) {
          // console.log('[Split Quantity] No ingredients found for recipe_id:', recipe_id);
          return res.json({ success: true, file: true, updated: 0, failed: 0, note: 'No ingredients found.' });
        }
        let done = 0, failed = 0;
        rows.forEach(row => {
          let quantity = '', fooditem = '';
          console.log(`[Split Quantity] Processing row id=${row.id}, ingredient_name='${row.ingredient_name}'`);
          const match = row.ingredient_name.match(/^([\d\s\/\.¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]+\s*(?:cup|cups|tbsp|tablespoon|tablespoons|tsp|teaspoon|teaspoons|g|gram|grams|kg|kilogram|kilograms|ml|l|litre|litres|liter|liters|oz|ounce|ounces|lb|pound|pounds|pinch|dash|clove|cloves|can|cans|slice|slices|stick|sticks|packet|packets|piece|pieces|egg|eggs|drop|drops|block|blocks|sheet|sheets|bunch|bunches|sprig|sprigs|head|heads|filet|filets|fillet|fillets|bag|bags|jar|jars|bottle|bottles|container|containers|box|boxes|bar|bars|roll|rolls|strip|strips|cm|mm|inch|inches|pinches|handful|handfuls|dozen|leaves|stalks|ribs|segments|cubes|sprinkles|splashes|litre|litres|millilitre|millilitres|quart|quarts|pint|pints|gallon|gallons)\b)\s*(.*)$/i);
          if (match) {
            quantity = match[1].trim();
            fooditem = match[2].trim();
            console.log(`[Split Quantity] Regex matched. quantity='${quantity}', fooditem='${fooditem}'`);
          } else {
            fooditem = row.ingredient_name.trim();
            console.log(`[Split Quantity] Regex did not match. fooditem='${fooditem}'`);
          }
          db.run('UPDATE ingredients_inventory SET quantity = ?, fooditem = ? WHERE id = ?', [quantity, fooditem, row.id], function(err2) {
            if (err2) {
              failed++;
              console.log(`[Split Quantity] Failed to update row id=${row.id}:`, err2.message);
            } else {
              done++;
            }
            if (done + failed === rows.length) {
              // All updates attempted
              console.log(`[Split Quantity] Finished. Updated: ${done}, Failed: ${failed}`);
              res.json({ success: failed === 0, file: true, updated: done, failed });
            }
          });
        });
      });
    });
  });
});

    // --- Auto-parse and insert ingredients when recipe is loaded ---
    function parseIngredients(rawText) {
      let lines;
      try {
        lines = JSON.parse(rawText);
        if (!Array.isArray(lines)) throw new Error();
      } catch {
        lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      }
      // Helper to convert unicode and vulgar fractions to float
      function parseFraction(str) {
        const vulgarMap = {
          '¼': 0.25, '½': 0.5, '¾': 0.75,
          '⅐': 1/7, '⅑': 1/9, '⅒': 0.1, '⅓': 1/3, '⅔': 2/3, '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8, '⅙': 1/6, '⅚': 5/6, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875
        };
        str = str.trim();
        // Replace vulgar fractions
        str = str.replace(/[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, m => ' ' + vulgarMap[m]);
        // Handle mixed numbers (e.g., 1 1/2)
        let parts = str.split(' ');
        let total = 0;
        for (let part of parts) {
          if (/^\d+$/.test(part)) total += parseInt(part);
          else if (/^\d+\/\d+$/.test(part)) {
            let [n, d] = part.split('/');
            total += parseInt(n) / parseInt(d);
          } else if (!isNaN(parseFloat(part))) {
            total += parseFloat(part);
          }
        }
        return total || null;
      }

      // Accept common units
      const units = [
        'cup', 'cups', 'tbsp', 'tablespoon', 'tablespoons', 'tsp', 'teaspoon', 'teaspoons',
        'g', 'gram', 'grams', 'kg', 'kilogram', 'kilograms', 'ml', 'l', 'litre', 'litres', 'liter', 'liters',
        'oz', 'ounce', 'ounces', 'lb', 'pound', 'pounds', 'pinch', 'dash', 'clove', 'cloves', 'can', 'cans', 'slice', 'slices', 'stick', 'sticks', 'packet', 'packets', 'piece', 'pieces', 'egg', 'eggs', 'drop', 'drops', 'block', 'blocks', 'sheet', 'sheets', 'bunch', 'bunches', 'sprig', 'sprigs', 'head', 'heads', 'filet', 'filets', 'fillet', 'fillets', 'bag', 'bags', 'jar', 'jars', 'bottle', 'bottles', 'container', 'containers', 'box', 'boxes', 'bar', 'bars', 'roll', 'rolls', 'strip', 'strips', 'cm', 'mm', 'inch', 'inches', 'pinches', 'handful', 'handfuls', 'dozen', 'sheet', 'sheets', 'leaf', 'leaves', 'stalk', 'stalks', 'rib', 'ribs', 'segment', 'segments', 'piece', 'pieces', 'cube', 'cubes', 'drop', 'drops', 'sprinkle', 'sprinkles', 'dash', 'dashes', 'splash', 'splashes', 'liter', 'liters', 'milliliter', 'millilitres', 'millilitre', 'millilitres', 'quart', 'quarts', 'pint', 'pints', 'gallon', 'gallons', 'ml', 'l', 'dl', 'cl', 'mg', 'mcg', 'µg', 'kg', 'g', 'lb', 'oz', 'cup', 'cups', 'tbsp', 'tsp', 'teaspoon', 'tablespoon', 'pinch', 'dash', 'drop', 'handful', 'stick', 'slice', 'piece', 'clove', 'can', 'bunch', 'sprig', 'head', 'filet', 'fillet', 'block', 'sheet', 'bag', 'jar', 'bottle', 'container', 'box', 'bar', 'roll', 'strip', 'cm', 'mm', 'inch', 'pinches', 'handfuls', 'dozen', 'leaves', 'stalks', 'ribs', 'segments', 'cubes', 'sprinkles', 'splashes', 'litre', 'litres', 'millilitre', 'millilitres', 'quart', 'quarts', 'pint', 'pints', 'gallon', 'gallons'
      ];
      const unitPattern = units.join('|');
      const regex = new RegExp(`^([\d\s\/\.¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]+)\s*(${unitPattern})\b\s*(.*)$`, 'i');

      return lines.map(line => {
        const match = line.match(regex);
        if (match) {
          const qty = parseFraction(match[1]);
          return {
            quantity: match[1].trim(),
            unit: match[2].trim(),
            name: match[3].trim(),
            measure_qty: qty,
            measure_unit: match[2].trim()
          };
        } else {
          return { quantity: '', unit: '', name: line, measure_qty: null, measure_unit: null };
        }
      });
    }

    // When a recipe is loaded by ID, auto-parse and insert ingredients
    app.get('/api/recipes/:id', async (req, res) => {
      const { id } = req.params;
      try {
        const recipeResult = await pool.query('SELECT * FROM recipes WHERE id = $1', [id]);
        if (recipeResult.rows.length === 0) return res.status(404).json({ error: 'Recipe not found.' });
        const recipe = recipeResult.rows[0];
        let rawIngredients = recipe.ingredients;
        if (!rawIngredients) return res.json(recipe); // nothing to parse
        const parsed = parseIngredients(rawIngredients);
        await pool.query('DELETE FROM ingredients WHERE recipe_id = $1', [id]);
        if (parsed.length === 0) return res.json(recipe);
        // Insert new ones
        for (const ing of parsed) {
          await pool.query('INSERT INTO ingredients (recipe_id, name, quantity, unit) VALUES ($1, $2, $3, $4)', [id, ing.name, ing.quantity, ing.unit]);
        }
        res.json(recipe);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // ...all other route definitions (recipes, ingredients, classes, uploads, shopping lists, etc.) go here...

    // Example API endpoint
    app.get('/api/status', (req, res) => {
      res.json({ status: 'Backend is running', db: 'SQLite connected' });
    });

    // --- Recipes ---
    // Return all recipes in recipe_display table for frontend
    app.get('/api/recipes/display-table', async (req, res) => {
      const sql = `SELECT id, name, description, ingredients, serving_size, url, instructions, recipeid FROM recipe_display ORDER BY id DESC`;
      console.log('[DISPLAY_TABLE][HIT] /api/recipes/display-table endpoint called');
      console.log('[DISPLAY_TABLE][SQL]', sql);
      try {
        const result = await pool.query(sql);
        res.json(result.rows);
      } catch (err) {
        console.error('[DISPLAY_TABLE][ERROR]', err);
        if (err.stack) console.error('[DISPLAY_TABLE][STACK]', err.stack);
        res.status(500).json({ error: err.message, stack: err.stack });
      }
    });
    // Display recipe: copy to recipe_display table
    app.post('/api/recipes/:id/display', async (req, res) => {
      const { id } = req.params;
      try {
        // Fetch recipe by ID
        const recipeResult = await pool.query('SELECT * FROM recipes WHERE id = $1', [id]);
        if (recipeResult.rows.length === 0) return res.status(404).json({ error: 'Recipe not found.' });
        const recipe = recipeResult.rows[0];
        // Upsert into recipe_display table (update if exists, insert if not)
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
          RETURNING id`;
        const upsertResult = await pool.query(upsertSql, [
          recipe.name,
          recipe.description,
          recipe.ingredients_display, // ingredients = ingredients_display
          recipe.serving_size,
          recipe.url,
          recipe.instructions,
          recipe.id // recipeID
        ]);
        res.json({ success: true, display_id: upsertResult.rows[0].id });
      } catch (err) {
        console.error('[DISPLAY][ERROR]', err);
        res.status(500).json({ error: err.message });
      }
    });
    app.get('/api/recipes', async (req, res) => {
      // Return all main fields including uploaded_recipe_id for table display
      const sql = `
        SELECT id, uploaded_recipe_id, name, description, ingredients, serving_size, url,
        instructions, instructions_extracted, ingredients_display, extracted_ingredients, extracted_serving_size, extracted_instructions
        FROM recipes
        ORDER BY id DESC
      `;
      console.log('[DEBUG /api/recipes] SQL:', sql);
      try {
        const result = await pool.query(sql);
        console.log('[DEBUG /api/recipes] Result:', result.rows);
        res.json(result.rows);
      } catch (err) {
        console.error('[DEBUG /api/recipes] Error:', err);
        res.status(500).json({ error: err.message });
      }
    });

    app.post('/api/recipes', (req, res) => {
      const { name, description } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'Recipe name is required.' });
      }
      db.run('INSERT INTO recipes (name, description) VALUES (?, ?)', [name, description], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, name, description });
      });
    });

    // Update recipe
    app.put('/api/recipes/:id', (req, res) => {
      const { id } = req.params;
      const { name, description } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'Recipe name is required.' });
      }
      db.run('UPDATE recipes SET name = ?, description = ? WHERE id = ?', [name, description, id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Recipe not found.' });
        res.json({ id, name, description });
      });
    });

    // Delete recipe
    app.delete('/api/recipes/:id', (req, res) => {
      const { id } = req.params;
      db.run('DELETE FROM recipes WHERE id = ?', [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Recipe not found.' });
        res.json({ success: true });
      });
    });

    // --- Ingredients ---
    app.get('/api/ingredients', (req, res) => {
      db.all('SELECT * FROM ingredients', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
      });
    });

    app.post('/api/ingredients', (req, res) => {
  const { recipe_id, name, quantity, unit } = req.body;
  if (!recipe_id || !name) {
    return res.status(400).json({ error: 'Recipe ID and ingredient name are required.' });
  }
  db.run('INSERT INTO ingredients (recipe_id, name, quantity, unit) VALUES (?, ?, ?, ?)', [recipe_id, name, quantity, unit], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, recipe_id, name, quantity, unit });
  });
});

    // Update ingredient
    app.put('/api/ingredients/:id', (req, res) => {
      const { id } = req.params;
      const { recipe_id, name, quantity, unit } = req.body;
      if (!recipe_id || !name) {
        return res.status(400).json({ error: 'Recipe ID and ingredient name are required.' });
      }
      db.run('UPDATE ingredients SET recipe_id = ?, name = ?, quantity = ?, unit = ? WHERE id = ?', [recipe_id, name, quantity, unit, id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Ingredient not found.' });
        res.json({ id, recipe_id, name, quantity, unit });
      });
    });

    // Delete ingredient
    app.delete('/api/ingredients/:id', (req, res) => {
      const { id } = req.params;
      db.run('DELETE FROM ingredients WHERE id = ?', [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Ingredient not found.' });
        res.json({ success: true });
      });
    });

    // --- Classes ---
    app.get('/api/classes', (req, res) => {
      db.all('SELECT * FROM classes', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
      });
    });

    app.post('/api/classes', (req, res) => {
      const { name, description } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'Class name is required.' });
      }
      db.run('INSERT INTO classes (name, description) VALUES (?, ?)', [name, description], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, name, description });
      });
    });

    // Update class
    app.put('/api/classes/:id', (req, res) => {
      const { id } = req.params;
      const { name, description } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'Class name is required.' });
      }
      db.run('UPDATE classes SET name = ?, description = ? WHERE id = ?', [name, description, id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Class not found.' });
        res.json({ id, name, description });
      });
    });

    // Delete class
    app.delete('/api/classes/:id', (req, res) => {
      const { id } = req.params;
      db.run('DELETE FROM classes WHERE id = ?', [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Class not found.' });
        res.json({ success: true });
      });
    });

    // --- Shopping Lists ---
    app.get('/api/shopping-lists', (req, res) => {
      db.all('SELECT * FROM shopping_lists', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
      });
    });

    app.post('/api/shopping-lists', (req, res) => {
      const { name, recipe_ids } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'Shopping list name is required.' });
      }
      db.run('INSERT INTO shopping_lists (name, recipe_ids) VALUES (?, ?)', [name, recipe_ids], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, name, recipe_ids });
      });
    });

    // Update shopping list
    app.put('/api/shopping-lists/:id', (req, res) => {
      const { id } = req.params;
      const { name, recipe_ids } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'Shopping list name is required.' });
      }
      db.run('UPDATE shopping_lists SET name = ?, recipe_ids = ? WHERE id = ?', [name, recipe_ids, id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Shopping list not found.' });
        res.json({ id, name, recipe_ids });
      });
    });

    // Delete shopping list
    app.delete('/api/shopping-lists/:id', (req, res) => {
      const { id } = req.params;
      db.run('DELETE FROM shopping_lists WHERE id = ?', [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Shopping list not found.' });
        res.json({ success: true });
      });
    });

// --- Serving Size Solution Endpoint (saves to DB) ---
app.post('/api/serving-size/solution', (req, res) => {
  const { recipeId, solution } = req.body;
  if (!recipeId || !solution) {
    return res.status(400).json({ error: 'Recipe ID and solution are required.' });
  }
  pool.query('UPDATE recipes SET serving_size = $1 WHERE id = $2', [solution, recipeId])
    .then(result => {
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Recipe not found.' });
      }
      res.json({ success: true });
    })
    .catch(err => {
      console.error('Failed to save serving size solution:', err.message);
      return res.status(500).json({ error: err.message });
    });
});

// --- Uploads ---
app.put('/api/uploads/:id/raw', async (req, res) => {
  const { id } = req.params;
  const { recipe_id, raw_data } = req.body;
  console.log('[DEBUG /api/uploads/:id/raw] Called with:', { id, recipe_id, raw_data_length: raw_data ? raw_data.length : undefined });
  if (!recipe_id) {
    console.log('[DEBUG /api/uploads/:id/raw] Missing recipe_id');
    return res.json({ success: false, error: 'Missing recipe_id' });
  }
  if (!raw_data) {
    console.log('[DEBUG /api/uploads/:id/raw] Missing raw_data');
    return res.json({ success: false, error: 'Missing raw_data' });
  }
  const fs = require('fs');
  const rawDataDir = path.join(__dirname, 'public', 'RawDataTXT');
  // Ensure directory exists
  if (!fs.existsSync(rawDataDir)) {
    fs.mkdirSync(rawDataDir, { recursive: true });
  }
  const filePath = path.join(rawDataDir, `${id}.txt`);
  console.log('[DEBUG /api/uploads/:id/raw] Attempting to write file to:', filePath);
  try {
    await pool.query('UPDATE uploads SET raw_data = $1 WHERE id = $2', [raw_data, id]);
    // Save raw data to file
    fs.writeFile(filePath, raw_data, (fileErr) => {
      if (fileErr) {
        console.log('[DEBUG /api/uploads/:id/raw] Failed to write raw data file:', fileErr.message);
        console.log('[DEBUG /api/uploads/:id/raw] Tried to write to:', filePath);
        return res.status(500).json({ success: false, error: 'Failed to write raw data file', details: fileErr.message });
      }
      console.log('[DEBUG /api/uploads/:id/raw] Successfully updated uploads table and wrote file for id:', id);
      console.log('[DEBUG /api/uploads/:id/raw] File written to:', filePath);
      res.json({ success: true });
    });
  } catch (err) {
    console.log('[DEBUG /api/uploads/:id/raw] Failed to update uploads table:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to update uploads table', details: err.message });
  }
});

    // Start server only after DB is ready
    // =========================
    // Debug/Utility Endpoints
    // =========================
    // DEBUG: Dump all rows from ingredients_inventory
    app.get('/api/debug/ingredients-inventory', (req, res) => {
      db.all('SELECT * FROM ingredients_inventory', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
      });
    });


// =========================
// RawDataTXT HTML Preview Route
// =========================
const fs = require('fs');

// Serve raw HTML file as text/plain (no preview wrapper)
app.get('/RawDataTXT/:file', (req, res, next) => {
  const fileName = req.params.file;
  const filePath = path.join(__dirname, 'public', 'RawDataTXT', fileName);
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) return next(); // Pass to 404 handler if not found
    res.type('text/plain').send(data);
  });
});


// Serve static files from backend/public
app.use(express.static(path.join(__dirname, 'public')));

// 404 Handler (should be last middleware)
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});


// =========================
// Start Server
// =========================

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});




const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '../database.sqlite');
const db = new sqlite3.Database(dbPath);

// GET /api/recipes/display-dropdown - Get all recipes from recipe_display for dropdown
router.get('/display-dropdown', (req, res) => {
  db.all('SELECT recipeID as id, name FROM recipe_display ORDER BY name', [], (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ recipes: rows });
  });
});

// GET /api/recipes/display-table - Get all rows from recipe_display
router.get('/display-table', (req, res) => {
  db.all('SELECT * FROM recipe_display', [], (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json(rows);
  });
});


// POST /api/recipes/:id/display - Copy recipe to recipe_display table
router.post('/:id/display', async (req, res) => {
  const recipeId = req.params.id;
  db.get('SELECT * FROM recipes WHERE id = ?', [recipeId], (err, row) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    if (!row) return res.status(404).json({ success: false, error: 'Recipe not found' });
    // Insert into recipe_display (fields: name, description, ingredients, serving_size, url, instructions, recipeID)
    db.run(
      'INSERT INTO recipe_display (name, description, ingredients, serving_size, url, instructions, recipeID) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [row.name, row.description, row.Ingredients_display || row.ingredients, row.serving_size, row.url, row.instructions, row.id],
      function(err2) {
        if (err2) return res.status(500).json({ success: false, error: err2.message });
        return res.json({ success: true });
      }
    );
  });
});

// --- Stepwise Cleanup Ingredients API with Progress ---
let cleanupIngredientsProgress = { total: 0, current: 0, running: false };
router.post('/cleanup-ingredients-stepwise', async (req, res) => {
  if (cleanupIngredientsProgress.running) return res.status(429).json({ error: 'Cleanup already running' });
  console.log('[CLEANUP] Starting stepwise cleanup of ingredients...');
  cleanupIngredientsProgress.running = true;
  try {
    const rows = await new Promise((resolve, reject) => {
      db.all('SELECT id, ingredients FROM recipes', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    cleanupIngredientsProgress.total = rows.length;
    cleanupIngredientsProgress.current = 0;
    for (const row of rows) {
      let cleaned = row.ingredients;
      if (typeof cleaned === 'string') {
        cleaned = cleaned
          .replace(/<li>/gi, '')
          .replace(/<\/li>/gi, '\n')
          .replace(/<ul>|<\/ul>/gi, '')
          .replace(/<br\s*\/?\s*>/gi, '\n')
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
      await new Promise(resolve => db.run('UPDATE recipes SET Ingredients_display = ? WHERE id = ?', [cleaned, row.id], resolve));
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
    const rows = await new Promise((resolve, reject) => {
      db.all('SELECT id, instructions, instructions_extracted FROM recipes', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
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
              cleanedExtracted = arr.map(step => step.text).filter(Boolean).join(' ');
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
      if ((!row.instructions || row.instructions.trim() === '') && cleanedExtracted && cleanedExtracted.length > 0) {
        await new Promise(resolve => db.run('UPDATE recipes SET instructions = ? WHERE id = ?', [cleanedExtracted, row.id], resolve));
        console.log(`[CLEANUP] Recipe ID ${row.id}: Copied cleaned extracted_instructions to empty instructions.`);
      } else if (cleanedExtracted && cleanedExtracted.length > 0) {
        await new Promise(resolve => db.run('UPDATE recipes SET instructions = ? WHERE id = ?', [cleanedExtracted, row.id], resolve));
        console.log(`[CLEANUP] Recipe ID ${row.id}: Cleaned extracted_instructions and copied to instructions.`);
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
          await new Promise(resolve => db.run('UPDATE recipes SET instructions = ? WHERE id = ?', [cleaned, row.id], resolve));
          console.log(`[CLEANUP] Recipe ID ${row.id}: Cleaned and updated.`);
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
router.get('/recipes', (req, res) => {
  const sql = `
    SELECT recipes.*, uploads.raw_data as upload_raw_data
    FROM recipes
    LEFT JOIN uploads ON recipes.uploaded_recipe_id = uploads.id
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Create a new recipe
router.post('/recipes', (req, res) => {
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
router.put('/recipes/:id', (req, res) => {
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
router.delete('/recipes/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM recipes WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Recipe not found.' });
    res.json({ success: true });
  });
});


// Get recipe options for dropdown
router.get('/dropdown', (req, res) => {
  console.log('[DEBUG] /api/recipes/dropdown called');
  db.all('SELECT id, name FROM recipes ORDER BY name COLLATE NOCASE', [], (err, rows) => {
    if (err) {
      console.error('[DEBUG] Error fetching recipes:', err);
      res.status(500).json({ error: 'Failed to fetch recipes.' });
    } else {
      console.log('[DEBUG] Recipe rows:', rows);
      // Always return an array, even if empty
      res.json({ recipes: rows || [] });
    }
  });
});

// Get a single recipe by ID (for Recipe Details page)
router.get('/recipes/:id', (req, res) => {
  const { id } = req.params;
  db.get('SELECT *, CASE WHEN instructions IS NULL OR instructions = "" THEN instructions_extracted ELSE instructions END as instructions FROM recipes WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Failed to fetch recipe.' });
    if (!row) return res.status(404).json({ error: 'Recipe not found.' });
    res.json(row);
  });
});

module.exports = router;

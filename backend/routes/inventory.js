

// ================================
// Imports and Setup
// ================================
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:password@host:port/db?sslmode=require';
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

// POST /api/ingredients/inventory/sync
router.post('/sync', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, quantity FROM ingredients_inventory');
    let updated = 0;
    // Helper to convert unicode and vulgar fractions to float
    function parseFraction(str) {
      const vulgarMap = {
        '¼': 0.25, '½': 0.5, '¾': 0.75,
        '⅐': 1/7, '⅑': 1/9, '⅒': 0.1, '⅓': 1/3, '⅔': 2/3, '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8, '⅙': 1/6, '⅚': 5/6, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875
      };
      str = (str || '').trim();
      str = str.replace(/[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, m => ' ' + vulgarMap[m]);
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
    const units = [
      'cup', 'cups', 'tbsp', 'tablespoon', 'tablespoons', 'tsp', 'teaspoon', 'teaspoons',
      'g', 'gram', 'grams', 'kg', 'kilogram', 'kilograms', 'ml', 'l', 'litre', 'litres', 'liter', 'liters',
      'oz', 'ounce', 'ounces', 'lb', 'pound', 'pounds', 'pinch', 'dash', 'clove', 'cloves', 'can', 'cans', 'slice', 'slices', 'stick', 'sticks', 'packet', 'packets', 'piece', 'pieces', 'egg', 'eggs', 'drop', 'drops', 'block', 'blocks', 'sheet', 'sheets', 'bunch', 'bunches', 'sprig', 'sprigs', 'head', 'heads', 'filet', 'filets', 'fillet', 'fillets', 'bag', 'bags', 'jar', 'jars', 'bottle', 'bottles', 'container', 'containers', 'box', 'boxes', 'bar', 'bars', 'roll', 'rolls', 'strip', 'strips', 'cm', 'mm', 'inch', 'inches', 'pinches', 'handful', 'handfuls', 'dozen', 'sheet', 'sheets', 'leaf', 'leaves', 'stalk', 'stalks', 'rib', 'ribs', 'segment', 'segments', 'piece', 'pieces', 'cube', 'cubes', 'drop', 'drops', 'sprinkle', 'sprinkles', 'dash', 'dashes', 'splash', 'splashes', 'liter', 'liters', 'milliliter', 'millilitres', 'millilitre', 'millilitres', 'quart', 'quarts', 'pint', 'pints', 'gallon', 'gallons'
    ];
    const unitPattern = units.join('|');
    const regex = new RegExp(`^([\d\s\/.¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]+)\s*(${unitPattern})\b\s*(.*)$`, 'i');
    for (const row of rows) {
      let measure_qty = null, measure_unit = null;
      if (row.quantity) {
        const match = row.quantity.match(regex);
        if (match) {
          measure_qty = parseFraction(match[1]);
          measure_unit = match[2];
        }
      }
      await pool.query('UPDATE ingredients_inventory SET measure_qty = $1, measure_unit = $2 WHERE id = $3', [measure_qty, measure_unit, row.id]);
      updated++;
    }
    res.json({ success: true, updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
console.log('Inventory router loaded');


// Debug logging disabled
// router.use((req, res, next) => {
//   console.log('Inventory route hit:', req.method, req.originalUrl);
//   next();
// });

// GET /api/ingredients/inventory/all
router.get('/all', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM ingredients_inventory');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});



// POST /api/ingredients/inventory/assign-aisle
router.post('/assign-aisle', async (req, res) => {
  const { ingredient_id, aisle_category_id } = req.body;
  // console.log('[DEBUG] /assign-aisle called with:', { ingredient_id, aisle_category_id });
  if (!ingredient_id || !aisle_category_id) {
    // console.log('[DEBUG] Missing ingredient_id or aisle_category_id');
    return res.status(400).json({ success: false, error: 'Missing ingredient_id or aisle_category_id' });
  }
  try {
    const sql = 'UPDATE ingredients_inventory SET aisle_category_id = $1 WHERE id = $2';
    // console.log('[DEBUG] Executing SQL:', sql, [aisle_category_id, ingredient_id]);
    const result = await pool.query(sql, [aisle_category_id, ingredient_id]);
    // console.log('[DEBUG] Update result:', result);
    res.json({ success: true, updated: result.rowCount });
  } catch (err) {
    //console.error('[DEBUG] Error in /assign-aisle:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});


  // POST /api/ingredients/inventory/save-bulk
  // Updated: Use recipe_display for calculations if recipe_id is provided
  router.post('/save-bulk', async (req, res) => {
    const { recipe_id, ingredients } = req.body;
    if (recipe_id) {
      try {
        const result = await pool.query('SELECT * FROM recipe_display WHERE recipeid = $1', [recipe_id]);
        if (!result.rows.length) {
          return res.status(404).json({ success: false, error: 'Recipe not found in recipe_display.' });
        }
        const recipe = result.rows[0];
        let ingredientsText = recipe.ingredients || '';
        ingredientsText = ingredientsText.replace(/<br\s*\/?/gi, '\n');
        const lines = ingredientsText.split(/\r?\n/)
          .map(l => l.replace(/^>\s*/, '').trim())
          .filter(Boolean);
        if (!lines.length) {
          return res.status(400).json({ success: false, error: 'No ingredients found in recipe_display.' });
        }
        // Ensure numeric fields are null if empty
        const parsedIngredients = lines.map(line => ([
          line, // ingredient_name
          recipe_id, // recipe_id
          null, // quantity
          null, // measure_qty
          '', // measure_unit
          line, // fooditem
          '', // stripFoodItem
          null // aisle_category_id
        ]));
        const valuePlaceholders = parsedIngredients.map((_, i) => `($${i*8+1},$${i*8+2},$${i*8+3},$${i*8+4},$${i*8+5},$${i*8+6},$${i*8+7},$${i*8+8})`).join(',');
        const flatValues = parsedIngredients.flat();
        const columns = ['ingredient_name', 'recipe_id', 'quantity', 'measure_qty', 'measure_unit', 'fooditem', 'stripFoodItem', 'aisle_category_id'];
        const insertResult = await pool.query(`INSERT INTO ingredients_inventory (${columns.join(',')}) VALUES ${valuePlaceholders}`, flatValues);
        res.json({ success: true, inserted: insertResult.rowCount });
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
    } else if (Array.isArray(ingredients) && ingredients.length > 0) {
      // Fallback: legacy mode, insert provided ingredients array (Postgres)
      const columns = ['ingredient_name', 'recipe_id', 'quantity', 'measure_qty', 'measure_unit', 'fooditem', 'stripFoodItem', 'aisle_category_id'];
      const values = ingredients.map(ing => [
        ing.ingredient_name || '',
        ing.recipe_id || null,
        (ing.quantity === '' || ing.quantity === undefined) ? null : ing.quantity,
        (ing.measure_qty === '' || ing.measure_qty === undefined) ? null : ing.measure_qty,
        ing.measure_unit || '',
        ing.fooditem || '',
        ing.stripFoodItem || '',
        ing.aisle_category_id || null
      ]);
      const valuePlaceholders = values.map((_, i) => `($${i*8+1},$${i*8+2},$${i*8+3},$${i*8+4},$${i*8+5},$${i*8+6},$${i*8+7},$${i*8+8})`).join(',');
      const flatValues = values.flat();
      try {
        const result = await pool.query(`INSERT INTO ingredients_inventory (${columns.join(',')}) VALUES ${valuePlaceholders}`, flatValues);
        res.json({ success: true, inserted: result.rowCount });
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
    } else {
      return res.status(400).json({ success: false, error: 'No ingredients or recipe_id provided.' });
    }
  });

  // POST /api/ingredients/inventory/split-quantity
  router.post('/split-quantity', (req, res) => {
    const { id, splitQty } = req.body;
    if (!id || !splitQty) {
      return res.status(400).json({ success: false, error: 'Missing id or splitQty' });
    }
    // Implement your logic here. For now, just return success.
    res.json({ success: true, message: `Ingredient ${id} split by ${splitQty}` });
  });

  // PUT /api/ingredients/inventory/:id/extracted
  const fs = require('fs');
  router.put('/:id/extracted', (req, res) => {
    const id = req.params.id;
    const { ingredients_text } = req.body;
    if (!ingredients_text || !id) {
      return res.status(400).json({ success: false, error: 'Missing ingredients_text or id' });
    }
    const dir = require('path').join(__dirname, '../public/ExtractedIngredients');
    const filePath = require('path').join(dir, `${id}.txt`);
    // Ensure directory exists
    fs.mkdir(dir, { recursive: true }, (err) => {
      if (err) {
        return res.status(500).json({ success: false, error: 'Failed to create directory', details: err.message });
      }
      fs.writeFile(filePath, ingredients_text, 'utf8', (err2) => {
        if (err2) {
          return res.status(500).json({ success: false, error: 'Failed to write file', details: err2.message });
        }
        res.json({ success: true, file: `${id}.txt` });
      });
    });
  });


// DELETE /api/ingredients/inventory/:id
router.delete('/:id', async (req, res) => {
  const id = req.params.id;
  if (!id) return res.status(400).json({ success: false, error: 'Missing id' });
  try {
    const result = await pool.query('DELETE FROM ingredients_inventory WHERE id = $1', [id]);
    res.json({ success: true, deleted: result.rowCount });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/ingredients/inventory/all
router.delete('/all', async (req, res) => {
  try {
    console.log('[DELETE ALL] About to TRUNCATE ingredients_inventory');
    await pool.query('TRUNCATE TABLE ingredients_inventory RESTART IDENTITY CASCADE');
    console.log('[DELETE ALL] TRUNCATE successful');
    res.json({ success: true, message: 'All ingredients deleted and ID reset.' });
  } catch (err) {
    console.error('[ERROR] DELETE /api/ingredients/inventory/all:', err);
    res.status(500).json({ success: false, error: err.message, details: err.stack });
  }
});



// POST /api/ingredients/inventory/auto-assign-aisles (uses aisle_keywords)
router.post('/auto-assign-aisles', async (req, res) => {
  // This endpoint assigns aisle_category_id to ingredients in inventory based on aisle_keywords
  // Only assign if aisle_category_id is null or 0
  try {
    const { rows: ingredients } = await pool.query('SELECT id, stripFoodItem FROM ingredients_inventory WHERE aisle_category_id IS NULL OR aisle_category_id = 0');
    const { rows: keywords } = await pool.query('SELECT ak.keyword, ak.aisle_category_id FROM aisle_keywords ak');
    let updated = 0;
    const updates = [];
    for (const ing of ingredients) {
      const text = (ing.stripfooditem || '').toLowerCase().trim();
      let match = null;
      for (const k of keywords) {
        if (text.includes((k.keyword || '').toLowerCase())) {
          match = k.aisle_category_id;
          break;
        }
      }
      if (match) {
        updates.push(pool.query('UPDATE ingredients_inventory SET aisle_category_id = $1 WHERE id = $2', [match, ing.id]));
        updated++;
      }
    }
    await Promise.all(updates);
    res.json({ success: true, updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Catch-all logger for unmatched requests to this router (must be last)
router.use((req, res, next) => {
  console.log(`[INVENTORY ROUTER] Unmatched: ${req.method} ${req.originalUrl}`);
  next();
});

// ================================
// Export
// ================================
module.exports = router;

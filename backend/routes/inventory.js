  // DELETE /api/ingredients/inventory/:id
  router.delete('/:id', (req, res) => {
    const id = req.params.id;
    if (!id) return res.status(400).json({ success: false, error: 'Missing id' });
    db.run('DELETE FROM ingredients_inventory WHERE id = ?', [id], function(err) {
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true, deleted: this.changes });
    });
  });

  // ================================
  // Imports and Setup
  // ================================
  const express = require('express');
  const router = express.Router();
  const sqlite3 = require('sqlite3').verbose();
  const path = require('path');
  const dbPath = path.join(__dirname, '../database.sqlite');
  const db = new sqlite3.Database(dbPath);

  // ================================
  // Middleware
  // ================================
  // Debug: log all inventory route hits
  router.use((req, res, next) => {
    console.log('Inventory route hit:', req.method, req.originalUrl);
    next();
  });

  // ================================
  // Endpoints
  // ================================

  // GET /api/ingredients/inventory/all
  router.get('/all', (req, res) => {
    db.all('SELECT * FROM ingredients_inventory', [], (err, rows) => {
      if (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
      res.json({ success: true, data: rows });
    });
  });


  // POST /api/ingredients/inventory/assign-aisle
  router.post('/assign-aisle', (req, res) => {
    const { ingredient_id, aisle_category_id } = req.body;
    if (!ingredient_id || !aisle_category_id) {
      return res.status(400).json({ success: false, error: 'Missing ingredient_id or aisle_category_id' });
    }
    db.run('UPDATE ingredients_inventory SET aisle_category_id = ? WHERE id = ?', [aisle_category_id, ingredient_id], function(err) {
      if (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
      res.json({ success: true, updated: this.changes });
    });
  });


  // POST /api/ingredients/inventory/save-bulk
  // Updated: Use recipe_display for calculations if recipe_id is provided
  router.post('/save-bulk', async (req, res) => {
    const { recipe_id, ingredients } = req.body;
    // If recipe_id is provided, fetch from recipe_display (Postgres)
    if (recipe_id) {
      // Connect to Postgres for recipe_display
      const { Pool } = require('pg');
      require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
      const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:password@host:port/db?sslmode=require';
      const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
      try {
        const result = await pool.query('SELECT * FROM recipe_display WHERE recipeid = $1', [recipe_id]);
        if (!result.rows.length) {
          return res.status(404).json({ success: false, error: 'Recipe not found in recipe_display.' });
        }
        const recipe = result.rows[0];
        // Assume ingredients are stored as a string (one per line or <br> separated)
        let ingredientsText = recipe.ingredients || '';
        ingredientsText = ingredientsText.replace(/<br\s*\/?>/gi, '\n');
        const lines = ingredientsText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (!lines.length) {
          return res.status(400).json({ success: false, error: 'No ingredients found in recipe_display.' });
        }
        // Simple parse: treat each line as ingredient_name, assign recipe_id
        const parsedIngredients = lines.map(line => ({
          ingredient_name: line,
          recipe_id: recipe_id,
          quantity: '',
          measure_qty: '',
          measure_unit: '',
          fooditem: line,
          stripFoodItem: '',
          aisle_category_id: null
        }));
        const placeholders = '(?, ?, ?, ?, ?, ?, ?, ?)';
        const sql = `INSERT INTO ingredients_inventory (ingredient_name, recipe_id, quantity, measure_qty, measure_unit, fooditem, stripFoodItem, aisle_category_id) VALUES ${parsedIngredients.map(() => placeholders).join(',')}`;
        const values = parsedIngredients.flatMap(ing => [
          ing.ingredient_name || '',
          ing.recipe_id || null,
          ing.quantity || '',
          ing.measure_qty || '',
          ing.measure_unit || '',
          ing.fooditem || '',
          ing.stripFoodItem || '',
          ing.aisle_category_id || null
        ]);
        db.run(sql, values, function(err) {
          if (err) {
            return res.status(500).json({ success: false, error: err.message });
          }
          res.json({ success: true, inserted: this.changes });
        });
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
    } else if (Array.isArray(ingredients) && ingredients.length > 0) {
      // Fallback: legacy mode, insert provided ingredients array
      const placeholders = '(?, ?, ?, ?, ?, ?, ?, ?)';
      const sql = `INSERT INTO ingredients_inventory (ingredient_name, recipe_id, quantity, measure_qty, measure_unit, fooditem, stripFoodItem, aisle_category_id) VALUES ${ingredients.map(() => placeholders).join(',')}`;
      const values = ingredients.flatMap(ing => [
        ing.ingredient_name || '',
        ing.recipe_id || null,
        ing.quantity || '',
        ing.measure_qty || '',
        ing.measure_unit || '',
        ing.fooditem || '',
        ing.stripFoodItem || '',
        ing.aisle_category_id || null
      ]);
      db.run(sql, values, function(err) {
        if (err) {
          return res.status(500).json({ success: false, error: err.message });
        }
        res.json({ success: true, inserted: this.changes });
      });
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

  // DELETE /api/ingredients/inventory/all
  router.delete('/all', (req, res) => {
    db.run('DELETE FROM ingredients_inventory', [], function(err) {
      if (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
      res.json({ success: true, deleted: this.changes });
    });
  });



// POST /api/ingredients/inventory/auto-assign-aisles (uses aisle_keywords)
router.post('/auto-assign-aisles', (req, res) => {
  // This endpoint assigns aisle_category_id to ingredients in inventory based on aisle_keywords
  // Only assign if aisle_category_id is null or 0
  db.all('SELECT id, stripFoodItem FROM ingredients_inventory WHERE aisle_category_id IS NULL OR aisle_category_id = 0', [], (err, ingredients) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    db.all('SELECT ak.keyword, ak.aisle_category_id FROM aisle_keywords ak', [], (err2, keywords) => {
      if (err2) return res.status(500).json({ success: false, error: err2.message });
      let updated = 0;
      const updates = [];
      ingredients.forEach(ing => {
        const text = (ing.stripFoodItem || '').toLowerCase().trim();
        let match = null;
        console.log(`\n[DEBUG] Ingredient: id=${ing.id}, stripFoodItem='${ing.stripFoodItem}' (normalized='${text}')`);
        for (const k of keywords) {
          const kw = (k.keyword || '').toLowerCase().trim();
          console.log(`[DEBUG]   Comparing with keyword='${k.keyword}' (normalized='${kw}')`);
          if (kw && text.includes(kw)) {
            console.log(`[DEBUG]   --> MATCH FOUND: '${text}' includes '${kw}' (aisle_category_id=${k.aisle_category_id})`);
            match = k;
            break;
          }
        }
        if (!match) {
          console.log(`[DEBUG]   No match found for ingredient id=${ing.id}`);
        }
        if (match) {
          updates.push({ id: ing.id, aisle_category_id: match.aisle_category_id });
        }
      });
      if (updates.length === 0) {
        console.log('[DEBUG] No updates to perform.');
        return res.json({ success: true, updated: 0 });
      }
      // Run updates in parallel
      let completed = 0, errored = false;
      updates.forEach(u => {
        db.run('UPDATE ingredients_inventory SET aisle_category_id = ? WHERE id = ?', [u.aisle_category_id, u.id], function(err3) {
          if (err3 && !errored) {
            errored = true;
            return res.status(500).json({ success: false, error: err3.message });
          }
          updated++;
          completed++;
          if (completed === updates.length && !errored) {
            console.log(`[DEBUG] Updated ${updated} ingredients with aisle_category_id.`);
            res.json({ success: true, updated });
          }
        });
      });
    });
  });
});

  // ================================
  // Export
  // ================================
  module.exports = router;

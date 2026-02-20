const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '../database.sqlite');
const db = new sqlite3.Database(dbPath);

// GET /desired_servings_ingredients
router.get('/', (req, res) => {
  const booking_id = req.query.booking_id;
  let sql = 'SELECT * FROM desired_servings_ingredients';
  let params = [];
  if (booking_id) {
    sql += ' WHERE booking_id = ?';
    params.push(booking_id);
  }
  sql += ' ORDER BY created_at DESC, id DESC';
  db.all(sql, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
    db.all('SELECT id, name FROM aisle_category', [], (catErr, catRows) => {
      const catMap = {};
      if (!catErr && catRows) {
        catRows.forEach(c => { catMap[c.id] = c.name; });
      }
      const rowsWithStripped = rows.map(row => ({
        ...row,
        aisle_category_name: row.aisle_category_id ? catMap[row.aisle_category_id] || '' : ''
      }));
      res.json({ success: true, data: rowsWithStripped });
    });
  });
});

// POST /desired_servings_ingredients/save
router.post('/save', (req, res) => {

  let { booking_id, teacher, staff_id, class_name, class_date, class_size, groups, desired_servings, recipe_id, ingredients } = req.body;
  if (class_name && class_name.includes('|')) {
    const parts = class_name.split('|').map(s => s.trim());
    class_name = parts[0];
    if (parts[1] && parts[1].startsWith('[ID:')) {
      const match = parts[1].match(/\[ID: (\d+)\]/);
      if (match) recipe_id = match[1];
    }
    if (parts[2]) {
      class_date = class_date || parts[2];
    }
  }
  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    return res.status(400).json({ success: false, error: 'No ingredients provided.' });
  }

  const dbFieldsFull = [
    'booking_id', 'teacher', 'staff_id', 'class_name', 'class_date', 'class_size', 'groups', 'desired_servings', 'recipe_id',
    'ingredient_id', 'ingredient_name', 'measure_qty', 'measure_unit', 'fooditem', 'calculated_qty', 'stripFoodItem', 'aisle_category_id'
  ];
  const placeholders = dbFieldsFull.map(() => '?').join(',');
  const sql = `INSERT INTO desired_servings_ingredients (${dbFieldsFull.join(',')}) VALUES (${placeholders})`;

  let inserted = 0, failed = 0;
  const db2 = new sqlite3.Database(dbPath);

  // Helper functions
  function normalize(str) {
    return (str || '').toLowerCase().trim();
  }

  let brands = [];
  function stripFoodItemBackend(name) {
    let stripped = (name || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
    brands.forEach(brand => {
      const re = new RegExp('^' + brand.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&") + "('?s)?\\s+", 'i');
      stripped = stripped.replace(re, '');
    });
    return stripped.trim();
  }

  function doInsert(row, ing, usedId, matchType) {
    let stripFoodItemValue = '';
    let aisleCategoryIdValue = '';
    let rawName = '';
    if (row) {
      rawName = row.strip_fooditem || row.stripFoodItem || ing.stripFoodItem || ing.fooditem || ing.ingredient_name || '';
      aisleCategoryIdValue = row.aisle_category_id || ing.aisle_category_id || '';
    } else {
      rawName = ing.stripFoodItem || ing.fooditem || ing.ingredient_name || '';
      aisleCategoryIdValue = ing.aisle_category_id || '';
    }
    stripFoodItemValue = stripFoodItemBackend(rawName);
    const values = [
      booking_id, teacher, staff_id || null, class_name, class_date, class_size, groups, desired_servings, recipe_id || null,
      usedId || null,
      ing.ingredient_name || '',
      ing.measure_qty || '',
      ing.measure_unit || '',
      ing.fooditem || '',
      ing.calculated_qty || '',
      stripFoodItemValue,
      aisleCategoryIdValue
    ];
    db2.run(sql, values, function(err2) {
      if (err2) {
        failed++;
      } else {
        inserted++;
      }
      if (inserted + failed === ingredients.length) {
        db2.close();
        res.json({ success: failed === 0, inserted, failed });
      }
    });
  }

  // Main logic
  db2.all('SELECT brand_name FROM food_brands', [], (brandErr, brandRows) => {
    if (brandErr) {
      db2.close();
      return res.status(500).json({ success: false, error: brandErr.message });
    }
    brands = (brandRows || []).map(b => b.brand_name);

    db2.all('SELECT id, ingredient_name FROM ingredients_inventory', [], (errInv, invRows) => {
      if (errInv) {
        db2.close();
        return res.status(500).json({ success: false, error: errInv.message });
      }
      ingredients.forEach(ing => {
        if (ing.ingredient_id) {
          db2.get('SELECT id, stripFoodItem, aisle_category_id, ingredient_name, fooditem FROM ingredients_inventory WHERE id = ?', [ing.ingredient_id], (err, row) => {
            doInsert(row, ing, ing.ingredient_id, 'id');
          });
        } else {
          db2.get('SELECT id, stripFoodItem, aisle_category_id, ingredient_name, fooditem FROM ingredients_inventory WHERE lower(trim(ingredient_name)) = ? OR lower(trim(fooditem)) = ?', [normalize(ing.ingredient_name), normalize(ing.fooditem)], (err, row) => {
            if (row) {
              doInsert(row, ing, row.id, 'exact name/fooditem');
            } else {
              db2.all('SELECT id, stripFoodItem, aisle_category_id, ingredient_name, fooditem FROM ingredients_inventory', [], (errAll, allRows) => {
                let found = null;
                for (const r of allRows) {
                  if (normalize(r.ingredient_name).includes(normalize(ing.ingredient_name)) || normalize(r.fooditem).includes(normalize(ing.fooditem))) {
                    found = r;
                    break;
                  }
                }
                doInsert(found, ing, found ? found.id : null, 'partial name/fooditem');
              });
            }
          });
        }
      });
    });
  });
});
module.exports = router;
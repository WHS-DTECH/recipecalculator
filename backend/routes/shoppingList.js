// Shopping List endpoints as a separate router
const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '../database.sqlite');
const db = new sqlite3.Database(dbPath);

// Generate shopping list grouped by category for selected bookings
router.get('/by_category', function(req, res) {
  let bookingIds = req.query.booking_ids;
  if (!bookingIds) {
    return res.status(400).json({ success: false, error: 'No booking_ids provided.' });
  }
  if (typeof bookingIds === 'string') {
    bookingIds = bookingIds.split(',').map(id => id.trim());
  }
  const placeholders = bookingIds.map(() => '?').join(',');
  const sql = `SELECT ingredient_name, measure_qty, measure_unit, stripFoodItem, calculated_qty FROM desired_servings_ingredients WHERE booking_id IN (${placeholders})`;
  db.all(sql, bookingIds, (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
    // Load brands from food_brands table (sync for simplicity)
    const db2 = new sqlite3.Database(dbPath);
    db2.all('SELECT brand_name FROM food_brands', [], (brandErr, brandRows) => {
      const brands = (brandRows || []).map(b => b.brand_name);
      function stripFoodItemBackend(name) {
        let stripped = (name || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
        brands.forEach(brand => {
          const re = new RegExp('^' + brand.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&") + "('?s)?\\s+", 'i');
          stripped = stripped.replace(re, '');
        });
        return stripped.trim();
      }
      const categories = {
        'Produce': ['apple', 'cauliflower', 'pepper', 'carrot', 'lettuce', 'onion', 'potato', 'tomato', 'fruit', 'vegetable'],
        'Dairy': ['milk', 'cheese', 'butter', 'cream', 'yogurt'],
        'Pantry': ['flour', 'sugar', 'salt', 'baking', 'chocolate', 'oats', 'breadcrumbs', 'vanilla', 'spice', 'oil', 'vinegar', 'yeast', 'rice', 'pasta'],
        'Other': []
      };
      function categorize(item) {
        const name = (item.stripFoodItem || '').toLowerCase();
        for (const [cat, keywords] of Object.entries(categories)) {
          if (keywords.some(word => name.includes(word))) return cat;
        }
        return 'Other';
      }
      const combined = {};
      rows.forEach(row => {
        const cat = categorize(row);
        if (!combined[cat]) combined[cat] = {};
        // Strip parenthesis and brands for display
        const key = stripFoodItemBackend(row.stripFoodItem || '').trim();
        if (!key) return;
        if (!combined[cat][key]) {
          combined[cat][key] = { qty: 0, unit: row.measure_unit || '', display: key };
        }
        let addQty = parseFloat(row.calculated_qty) || parseFloat(row.measure_qty) || 0;
        if (!isNaN(addQty)) combined[cat][key].qty += addQty;
        if (row.measure_unit && !combined[cat][key].unit) combined[cat][key].unit = row.measure_unit;
      });
      const result = {};
      for (const cat of Object.keys(categories)) {
        result[cat] = Object.values(combined[cat] || {}).map(item => ({
          display: item.display,
          qty: item.qty,
          unit: item.unit
        }));
      }
      res.json({ success: true, data: result });
    });
  });
});

// Generate shopping list grouped by teacher for selected bookings
router.get('/by_teacher', (req, res) => {
  let bookingIds = req.query.booking_ids;
  if (!bookingIds) {
    return res.status(400).json({ success: false, error: 'No booking_ids provided.' });
  }
  if (typeof bookingIds === 'string') {
    bookingIds = bookingIds.split(',').map(id => id.trim());
  }
  const placeholders = bookingIds.map(() => '?').join(',');
  const sql = `SELECT staff_id, teacher, ingredient_name, measure_qty, measure_unit, fooditem, stripFoodItem, calculated_qty FROM desired_servings_ingredients WHERE booking_id IN (${placeholders})`;
  db.all(sql, bookingIds, (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
    const result = {};
    rows.forEach(row => {
      const key = row.staff_id ? `Staff ${row.staff_id} - ${row.teacher}` : row.teacher;
      if (!result[key]) result[key] = [];
      result[key].push({
        ingredient: row.ingredient_name,
        qty: row.measure_qty,
        unit: row.measure_unit,
        fooditem: row.fooditem,
        stripFoodItem: row.stripFoodItem,
        calculated_qty: row.calculated_qty,
        staff_id: row.staff_id
      });
    });
    res.json({ success: true, data: result });
  });
});

module.exports = router;

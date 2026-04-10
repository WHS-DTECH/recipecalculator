// Shopping List endpoints as a separate router
const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '../database.sqlite');
const db = new sqlite3.Database(dbPath);

function formatQty(value) {
  if (!Number.isFinite(value)) return '';
  if (Number.isInteger(value)) return value;
  return Math.round(value * 1000) / 1000;
}

function normalizeUnit(unit) {
  const u = String(unit || '').trim().toLowerCase();
  if (!u) return '';
  if (['cup', 'cups'].includes(u)) return 'cup';
  if (['tablespoons', 'tablespoon', 'tbsp', 'tbs', 'tblsp'].includes(u)) return 'tbsp';
  if (['teaspoons', 'teaspoon', 'tsp'].includes(u)) return 'tsp';
  if (['gram', 'grams', 'g'].includes(u)) return 'g';
  if (['kilogram', 'kilograms', 'kg'].includes(u)) return 'kg';
  if (['milliliter', 'milliliters', 'millilitre', 'millilitres', 'ml'].includes(u)) return 'ml';
  if (['liter', 'liters', 'litre', 'litres', 'l'].includes(u)) return 'l';
  return u;
}

function normalizeIngredientKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function toCanonicalQty(qtyValue, unitValue) {
  const qty = Number(qtyValue);
  if (!Number.isFinite(qty)) {
    return { qty: NaN, unit: normalizeUnit(unitValue), family: normalizeUnit(unitValue) };
  }

  const unit = normalizeUnit(unitValue);
  if (unit === 'tbsp') {
    return { qty: qty * 3, unit: 'tsp', family: 'spoon' };
  }
  if (unit === 'tsp') {
    return { qty, unit: 'tsp', family: 'spoon' };
  }

  return { qty, unit, family: unit };
}

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
  const sql = `
    SELECT
      dsi.ingredient_name,
      dsi.measure_qty,
      dsi.measure_unit,
      dsi.stripFoodItem,
      dsi.calculated_qty,
      COALESCE(ac.name, '') AS aisle_category_name
    FROM desired_servings_ingredients dsi
    LEFT JOIN aisle_category ac ON ac.id = dsi.aisle_category_id
    WHERE dsi.booking_id IN (${placeholders})
  `;
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
        if (String(row.aisle_category_name || '').trim().toLowerCase() === 'action') {
          return;
        }
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
        result[cat] = Object.values(combined[cat] || {})
          .map(item => ({
            display: item.display,
            qty: item.qty,
            unit: item.unit
          }))
          .sort((a, b) => String(a.display || '').localeCompare(String(b.display || ''), undefined, { sensitivity: 'base' }));
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
  const sql = `
    SELECT
      dsi.staff_id,
      dsi.teacher,
      dsi.ingredient_name,
      dsi.measure_qty,
      dsi.measure_unit,
      dsi.fooditem,
      dsi.stripFoodItem,
      dsi.calculated_qty,
      COALESCE(ac.name, '') AS aisle_category_name
    FROM desired_servings_ingredients dsi
    LEFT JOIN aisle_category ac ON ac.id = dsi.aisle_category_id
    WHERE dsi.booking_id IN (${placeholders})
  `;
  db.all(sql, bookingIds, (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
    const grouped = {};
    rows.forEach(row => {
      if (String(row.aisle_category_name || '').trim().toLowerCase() === 'action') {
        return;
      }
      const teacherKey = row.staff_id ? `Staff ${row.staff_id} - ${row.teacher}` : row.teacher;
      if (!grouped[teacherKey]) grouped[teacherKey] = {};

      const displayIngredient = (row.stripFoodItem || row.fooditem || row.ingredient_name || '').trim();
      if (!displayIngredient) return;

      const qtyCanonical = toCanonicalQty(row.measure_qty, row.measure_unit);
      const calcCanonical = toCanonicalQty(row.calculated_qty, row.measure_unit);
      const unitKey = qtyCanonical.family || normalizeUnit(row.measure_unit) || '';
      const itemKey = `${normalizeIngredientKey(displayIngredient)}||${unitKey}`;

      if (!grouped[teacherKey][itemKey]) {
        grouped[teacherKey][itemKey] = {
          ingredient: displayIngredient,
          qty: 0,
          unit: qtyCanonical.unit || row.measure_unit || '',
          fooditem: row.fooditem,
          stripFoodItem: row.stripFoodItem,
          calculated_qty: 0,
          staff_id: row.staff_id
        };
      }

      if (!Number.isNaN(qtyCanonical.qty)) grouped[teacherKey][itemKey].qty += qtyCanonical.qty;

      if (!Number.isNaN(calcCanonical.qty)) grouped[teacherKey][itemKey].calculated_qty += calcCanonical.qty;

      if (!grouped[teacherKey][itemKey].unit && (qtyCanonical.unit || row.measure_unit)) {
        grouped[teacherKey][itemKey].unit = qtyCanonical.unit || row.measure_unit;
      }
    });

    const result = {};
    Object.keys(grouped).forEach(teacherKey => {
      result[teacherKey] = Object.values(grouped[teacherKey]).sort((a, b) => {
        return String(a.ingredient || '').localeCompare(String(b.ingredient || ''));
      }).map(item => ({
        ...item,
        qty: formatQty(item.qty),
        calculated_qty: formatQty(item.calculated_qty)
      }));
    });

    res.json({ success: true, data: result });
  });
});

module.exports = router;

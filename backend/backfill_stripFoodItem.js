// Script to backfill and clean all stripFoodItem values in ingredients_inventory
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// Load brands from food_brands table
function getBrands(callback) {
  db.all('SELECT brand_name FROM food_brands', [], (err, rows) => {
    if (err) return callback(err);
    callback(null, rows.map(r => r.brand_name));
  });
}

function stripFoodItemBackend(name, brands) {
  let stripped = (name || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
  brands.forEach(brand => {
    const re = new RegExp('^' + brand.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&") + "('?s)?\\s+", 'i');
    stripped = stripped.replace(re, '');
  });
  return stripped.trim();
}

getBrands((err, brands) => {
  if (err) {
    console.error('Failed to load brands:', err);
    process.exit(1);
  }
  db.all('SELECT id, fooditem, ingredient_name FROM ingredients_inventory', [], (err, rows) => {
    if (err) {
      console.error('Failed to load ingredients_inventory:', err);
      process.exit(1);
    }
    let updated = 0;
    let toUpdate = rows.length;
    rows.forEach(row => {
      const raw = row.fooditem || row.ingredient_name || '';
      const cleaned = stripFoodItemBackend(raw, brands);
      db.run('UPDATE ingredients_inventory SET stripFoodItem = ? WHERE id = ?', [cleaned, row.id], function(err2) {
        if (err2) {
          console.error('Update failed for id', row.id, err2);
        } else {
          updated++;
        }
        toUpdate--;
        if (toUpdate === 0) {
          console.log('Backfill complete. Updated:', updated);
          db.close();
        }
      });
    });
  });
});

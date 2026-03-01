const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '../database.sqlite');
const db = new sqlite3.Database(dbPath);

// Get all food brands
router.get('/', (req, res) => {
  db.all('SELECT * FROM food_brands ORDER BY id', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Add a new food brand
router.post('/', (req, res) => {
  const { brand_name } = req.body;
  if (!brand_name) return res.status(400).json({ error: 'Brand name required' });
  db.run('INSERT INTO food_brands (brand_name) VALUES (?)', [brand_name], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, brand_name });
  });
});

// Edit a food brand
router.put('/:id', (req, res) => {
  const { brand_name } = req.body;
  const { id } = req.params;
  if (!brand_name) return res.status(400).json({ error: 'Brand name required' });
  db.run('UPDATE food_brands SET brand_name = ? WHERE id = ?', [brand_name, id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id, brand_name });
  });
});

// Delete a food brand
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM food_brands WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

module.exports = router;

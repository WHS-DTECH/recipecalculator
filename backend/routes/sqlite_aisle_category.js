const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '../database.sqlite');
const db = new sqlite3.Database(dbPath);

// Get all aisle categories
router.get('/', (req, res) => {
  db.all('SELECT * FROM aisle_category ORDER BY sort_order, id', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Add a new aisle category
router.post('/', (req, res) => {
  const { name, sort_order } = req.body;
  if (!name) return res.status(400).json({ error: 'Category name required' });
  db.run('INSERT INTO aisle_category (name, sort_order) VALUES (?, ?)', [name, sort_order || 0], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, name, sort_order });
  });
});

// Edit an aisle category
router.put('/:id', (req, res) => {
  const { name, sort_order } = req.body;
  const { id } = req.params;
  if (!name) return res.status(400).json({ error: 'Category name required' });
  db.run('UPDATE aisle_category SET name = ?, sort_order = ? WHERE id = ?', [name, sort_order || 0, id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id, name, sort_order });
  });
});

// Delete an aisle category
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM aisle_category WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

module.exports = router;

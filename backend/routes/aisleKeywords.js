// Aisle Keyword CRUD endpoints as a separate router
const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '../database.sqlite');
const db = new sqlite3.Database(dbPath);

// Add aisle keyword
router.post('/add', (req, res) => {
  const { aisle_category_id, keyword } = req.body;
  if (!aisle_category_id || !keyword) return res.json({ success: false, error: 'Missing data' });
  db.run('INSERT INTO aisle_keywords (aisle_category_id, keyword) VALUES (?, ?)', [aisle_category_id, keyword], function(err) {
    if (err) return res.json({ success: false, error: err.message });
    res.json({ success: true, id: this.lastID });
  });
});

// Edit aisle keyword
router.post('/edit', (req, res) => {
  const { id, keyword } = req.body;
  if (!id || !keyword) return res.json({ success: false, error: 'Missing data' });
  db.run('UPDATE aisle_keywords SET keyword = ? WHERE id = ?', [keyword, id], function(err) {
    if (err) return res.json({ success: false, error: err.message });
    res.json({ success: true });
  });
});

// Delete aisle keyword
router.post('/delete', (req, res) => {
  const { id } = req.body;
  if (!id) return res.json({ success: false, error: 'Missing id' });
  db.run('DELETE FROM aisle_keywords WHERE id = ?', [id], function(err) {
    if (err) return res.json({ success: false, error: err.message });
    res.json({ success: true });
  });
});

// API endpoint to get all aisle keywords with category names
router.get('/all', (req, res) => {
  const sql = `SELECT ak.id, ak.keyword, ac.name AS aisle_category FROM aisle_keywords ak LEFT JOIN aisle_category ac ON ak.aisle_category_id = ac.id ORDER BY ac.sort_order, ak.keyword`;
  db.all(sql, [], (err, rows) => {
    if (err) {
      return res.json({ success: false, error: err.message, keywords: [] });
    }
    res.json({ success: true, keywords: rows });
  });
});

module.exports = router;

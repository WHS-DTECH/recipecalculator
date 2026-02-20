const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '../database.sqlite');
const db = new sqlite3.Database(dbPath);

// Dropdown: Get all classes for dropdown, optionally filtered by staffCode
// Dropdown: Get all classes for dropdown (no staff filter, as table has no teacher_in_charge column)
router.get('/dropdown', (req, res) => {
  const staffCode = req.query.staffCode;
  let sql = 'SELECT * FROM class_upload';
  let params = [];
  if (staffCode) {
    sql += ' WHERE teacher_in_charge = ?';
    params.push(staffCode);
  }
  sql += ' ORDER BY name COLLATE NOCASE';
  console.log('[DEBUG] /api/classes/dropdown called, staffCode:', staffCode);
  console.log('[DEBUG] SQL:', sql);
  console.log('[DEBUG] Params:', params);
  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error('[DEBUG] Error fetching classes:', err);
      return res.status(500).json({ error: 'Failed to fetch classes.' });
    }
    console.log('[DEBUG] Classes rows:', rows);
    res.json({ classes: rows });
  });
});


// Endpoint: Get all classes (for Class Upload page)
router.get('/class_upload/all', (req, res) => {
  db.all('SELECT * FROM classes ORDER BY name COLLATE NOCASE', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Failed to fetch classes.' });
    res.json({ classes: rows });
  });
});

module.exports = router;

const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '../database.sqlite');
const db = new sqlite3.Database(dbPath);

// Dropdown: Get all staff for dropdown
router.get('/dropdown', (req, res) => {
  console.log('[DEBUG] /api/staff_upload/dropdown called');
  db.all('SELECT id, code, last_name, first_name FROM staff_upload ORDER BY last_name, first_name', [], (err, rows) => {
    if (err) {
      console.error('[DEBUG] Error fetching staff:', err);
      return res.status(500).json({ error: 'Failed to fetch staff list.' });
    }
    console.log('[DEBUG] Staff rows:', rows);
    res.json({ staff: rows });
  });
});

// Get all staff_upload rows
router.get('/all', (req, res) => {
  const db = req.app.locals.db;
  db.all('SELECT * FROM staff_upload', [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: 'Failed to fetch staff_upload data.' });
    } else {
      res.json({ staff: rows });
    }
  });
});

// Handle staff CSV upload
router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const staff = req.body.staff;
  if (!Array.isArray(staff) || staff.length === 0) {
    return res.json({ success: false, error: 'No staff data provided.' });
  }
  // Example: columns = [code, last_name, first_name, title, email_school]
  const stmt = db.prepare('INSERT INTO staff_upload (code, last_name, first_name, title, email_school) VALUES (?, ?, ?, ?, ?)');
  let inserted = 0;
  staff.forEach(row => {
    if (row.length >= 5) {
      stmt.run(row[0], row[1], row[2], row[3], row[4], err => {
        if (!err) inserted++;
      });
    }
  });
  stmt.finalize(() => {
    res.json({ success: true, inserted });
  });
});

module.exports = router;

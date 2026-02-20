
const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '../database.sqlite');
const db = new sqlite3.Database(dbPath);

// Update a booking by ID
router.put('/:id', (req, res) => {
  const { staff_id, staff_name, class_name, booking_date, period, recipe, recipe_id, class_size } = req.body;
  db.run(
    'UPDATE bookings SET staff_id = ?, staff_name = ?, class_name = ?, booking_date = ?, period = ?, recipe = ?, recipe_id = ?, class_size = ? WHERE id = ?',
    [staff_id, staff_name, class_name, booking_date, period, recipe, recipe_id, class_size, req.params.id],
    function(err) {
      if (err) {
        res.status(500).json({ error: 'Failed to update booking.' });
      } else {
        res.json({ success: true });
      }
    }
  );
});

// Delete a booking by ID
router.delete('/:id', (req, res) => {
  db.run('DELETE FROM bookings WHERE id = ?', [req.params.id], function(err) {
    if (err) {
      res.status(500).json({ error: 'Failed to delete booking.' });
    } else {
      res.json({ success: true });
    }
  });
});

// Create a new booking
router.post('/', (req, res) => {
  const { staff_id, staff_name, class_name, booking_date, period, recipe, recipe_id, class_size } = req.body;
  db.run(
    'INSERT INTO bookings (staff_id, staff_name, class_name, booking_date, period, recipe, recipe_id, class_size) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [staff_id, staff_name, class_name, booking_date, period, recipe, recipe_id, class_size],
    function(err) {
      if (err) {
        res.status(500).json({ error: 'Failed to create booking.' });
      } else {
        res.json({ success: true, booking_id: this.lastID });
      }
    }
  );
});

// Get all bookings
router.get('/all', (req, res) => {
  db.all('SELECT * FROM bookings ORDER BY booking_date DESC, period', [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: 'Failed to fetch bookings.' });
    } else {
      res.json({ bookings: rows });
    }
  });
});

module.exports = router;

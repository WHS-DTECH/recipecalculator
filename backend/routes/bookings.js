const express = require('express');
const router = express.Router();
const pool = require('../db');

// Update a booking by ID
router.put('/:id', async (req, res) => {
  const { staff_id, staff_name, class_name, booking_date, period, recipe, recipe_id, class_size } = req.body;
  try {
    await pool.query(
      'UPDATE bookings SET staff_id=$1, staff_name=$2, class_name=$3, booking_date=$4, period=$5, recipe=$6, recipe_id=$7, class_size=$8 WHERE id=$9',
      [staff_id, staff_name, class_name, booking_date, period, recipe, recipe_id, class_size, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update booking.' });
  }
});

// Delete a booking by ID
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM bookings WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete booking.' });
  }
});

// Create a new booking
router.post('/', async (req, res) => {
  const { staff_id, staff_name, class_name, booking_date, period, recipe, recipe_id, class_size } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO bookings (staff_id, staff_name, class_name, booking_date, period, recipe, recipe_id, class_size) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
      [staff_id, staff_name, class_name, booking_date, period, recipe, recipe_id, class_size]
    );
    res.json({ success: true, booking_id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create booking.' });
  }
});

// Get all bookings
router.get('/all', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM bookings ORDER BY booking_date DESC, period');
    res.json({ bookings: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch bookings.' });
  }
});

module.exports = router;

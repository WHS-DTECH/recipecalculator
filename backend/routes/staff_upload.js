const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const PG_CONNECTION_STRING = process.env.PG_CONNECTION_STRING || 'postgresql://neondb_owner:password@host:port/db?sslmode=require';
const pool = new Pool({ connectionString: PG_CONNECTION_STRING, ssl: { rejectUnauthorized: false } });

// Dropdown: Get all staff for dropdown
router.get('/dropdown', async (req, res) => {
  console.log('[DEBUG] /api/staff_upload/dropdown called');
  try {
    const result = await pool.query('SELECT id, code, last_name, first_name FROM staff_upload ORDER BY last_name, first_name');
    console.log('[DEBUG] Staff rows:', result.rows);
    res.json({ staff: result.rows });
  } catch (err) {
    console.error('[DEBUG] Error fetching staff:', err);
    res.status(500).json({ error: 'Failed to fetch staff list.' });
  }
});

// Get all staff_upload rows
router.get('/all', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM staff_upload');
    res.json({ staff: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch staff_upload data.' });
  }
});

// Handle staff CSV upload
router.post('/', async (req, res) => {
  const staff = req.body.staff;
  if (!Array.isArray(staff) || staff.length === 0) {
    return res.json({ success: false, error: 'No staff data provided.' });
  }
  let inserted = 0;
  try {
    for (const row of staff) {
      if (row.length >= 5) {
        await pool.query(
          'INSERT INTO staff_upload (code, last_name, first_name, title, email_school) VALUES ($1, $2, $3, $4, $5)',
          [row[0], row[1], row[2], row[3], row[4]]
        );
        inserted++;
      }
    }
    res.json({ success: true, inserted });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;

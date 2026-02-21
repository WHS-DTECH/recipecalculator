// POST /api/upload_timetable: Upload timetable CSV data
// This endpoint was missing after migration. Re-implementing for Neon/Postgres.
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const PG_CONNECTION_STRING = process.env.PG_CONNECTION_STRING || 'postgresql://neondb_owner:password@host:port/db?sslmode=require';
const pool = new Pool({ connectionString: PG_CONNECTION_STRING, ssl: { rejectUnauthorized: false } });

// POST /api/upload_timetable
router.post('/', async (req, res) => {
  const { timetable } = req.body;
  if (!Array.isArray(timetable) || timetable.length === 0) {
    return res.status(400).json({ success: false, error: 'No timetable data provided.' });
  }
  // Define columns as in the old code
  const dbColumns = [
    "Teacher", "Teacher Name", "Room", "Day", "Period", "Class", "Subject", "Level", "Code", "TT_Code",
    "D1_P1_1","D1_P1_2","D1_P2","D1_I","D1_P3","D1_P4","D1_L","D1_P5","D1_blank_1","D1_blank_2",
    "D2_P1_1","D2_P1_2","D2_P2","D2_I","D2_P3","D2_P4","D2_L","D2_P5","D2_blank_1","D2_blank_2",
    "D3_P1_1","D3_P1_2","D3_P2","D3_I","D3_P3","D3_P4","D3_L","D3_P5","D3_blank_1","D3_blank_2",
    "D4_P1_1","D4_P1_2","D4_P2","D4_I","D4_P3","D4_P4","D4_L","D4_P5","D4_blank_1","D4_blank_2",
    "D5_P1_1","D5_P1_2","D5_P2","D5_I","D5_P3","D5_P4","D5_L","D5_P5","D5_blank_1","D5_blank_2"
  ];
  const placeholders = dbColumns.map((_, i) => `$${i+1}`).join(',');
  const insertSQL = `INSERT INTO kamar_timetable (${dbColumns.join(',')}) VALUES (${placeholders})`;
  let inserted = 0, failed = 0;
  for (const row of timetable) {
    const values = row.slice(0, dbColumns.length);
    while (values.length < dbColumns.length) values.push("");
    try {
      await pool.query(insertSQL, values);
      inserted++;
    } catch (e) {
      failed++;
    }
  }
  res.json({ success: true, inserted, failed });
});

module.exports = router;

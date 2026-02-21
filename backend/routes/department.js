const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const PG_CONNECTION_STRING = process.env.PG_CONNECTION_STRING || 'postgresql://neondb_owner:password@host:port/db?sslmode=require';
const pool = new Pool({ connectionString: PG_CONNECTION_STRING, ssl: { rejectUnauthorized: false } });

// Assign department to staff
router.post('/assign', async (req, res) => {
  const { staffId, department } = req.body;
  console.log('DEBUGGING /assign called:', { staffId, department });
  if (!staffId || !department) {
    console.log('DEBUGGING: Missing staffId or department');
    return res.status(400).json({ success: false, error: 'Missing staffId or department.' });
  }
  try {
    const staffResult = await pool.query('SELECT last_name, first_name, email_school FROM staff_upload WHERE id = $1', [staffId]);
    if (staffResult.rows.length === 0) {
      console.log('DEBUGGING: Staff not found');
      return res.status(404).json({ success: false, error: 'Staff not found.' });
    }
    const staffRow = staffResult.rows[0];
    const staffName = `${staffRow.last_name}, ${staffRow.first_name}`;
    const staffEmail = staffRow.email_school || null;
    console.log('DEBUGGING: staffName and staffEmail', { staffName, staffEmail });
    const depResult = await pool.query('SELECT * FROM department WHERE Staff_Name = $1', [staffName]);
    if (depResult.rows.length > 0) {
      const depRow = depResult.rows[0];
      console.log('DEBUGGING: Department row exists, updating', depRow);
      await pool.query('UPDATE department SET department = $1, staff_email = $2 WHERE ID = $3', [department, staffEmail, depRow.id]);
      res.json({ success: true });
    } else {
      console.log('DEBUGGING: No department row, inserting new');
      await pool.query('INSERT INTO department (Staff_Name, staff_email, department) VALUES ($1, $2, $3)', [staffName, staffEmail, department]);
      res.json({ success: true });
    }
  } catch (err) {
    console.log('DEBUGGING: Failed to assign/update department', err);
    res.status(500).json({ success: false, error: 'Failed to assign/update department.' });
  }
});

// Department endpoints
router.get('/all', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM department');
    res.json({ department: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch department data.' });
  }
});

router.post('/load-from-timetable', (req, res) => {
  const db = req.app.locals.db;
  db.all('SELECT DISTINCT [Teacher Name] as Staff_Name FROM kamar_timetable WHERE [Teacher Name] IS NOT NULL AND [Teacher Name] != ""', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    let inserted = 0, updated = 0;
    const processNext = (i) => {
      if (i >= rows.length) return res.json({ inserted, updated });
      const staffName = rows[i].Staff_Name;
      db.get('SELECT email FROM staff WHERE name = ?', [staffName], (err2, staffRow) => {
        const staffEmail = staffRow && staffRow.email ? staffRow.email : null;
        db.get('SELECT * FROM department WHERE Staff_Name = ?', [staffName], (err3, depRow) => {
          if (depRow) {
            if (!depRow.staff_email && staffEmail) {
              db.run('UPDATE department SET staff_email = ? WHERE ID = ?', [staffEmail, depRow.ID], () => {
                updated++;
                processNext(i+1);
              });
            } else {
              processNext(i+1);
            }
          } else {
            db.run('INSERT INTO department (Staff_Name, staff_email) VALUES (?, ?)', [staffName, staffEmail], (err4) => {
              if (!err4) inserted++;
              processNext(i+1);
            });
          }
        });
      });
    };
    processNext(0);
  });
});

module.exports = router;

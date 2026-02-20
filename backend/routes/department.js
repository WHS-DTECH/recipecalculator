const express = require('express');
const router = express.Router();
// Assign department to staff
router.post('/assign', (req, res) => {
  const db = req.app.locals.db;
  const { staffId, department } = req.body;
  console.log('DEBUGGING /assign called:', { staffId, department });
  if (!staffId || !department) {
    console.log('DEBUGGING: Missing staffId or department');
    return res.status(400).json({ success: false, error: 'Missing staffId or department.' });
  }
  db.get('SELECT last_name, first_name, email_school FROM staff_upload WHERE id = ?', [staffId], (err, staffRow) => {
    if (err || !staffRow) {
      console.log('DEBUGGING: Staff not found or DB error', { err, staffRow });
      return res.status(404).json({ success: false, error: 'Staff not found.' });
    }
    const staffName = `${staffRow.last_name}, ${staffRow.first_name}`;
    const staffEmail = staffRow.email_school || null;
    console.log('DEBUGGING: staffName and staffEmail', { staffName, staffEmail });
    db.get('SELECT * FROM department WHERE Staff_Name = ?', [staffName], (err2, depRow) => {
      if (err2) {
        console.log('DEBUGGING: Error querying department table', err2);
        return res.status(500).json({ success: false, error: 'DB error on department lookup.' });
      }
      if (depRow) {
        console.log('DEBUGGING: Department row exists, updating', depRow);
        db.run('UPDATE department SET department = ?, staff_email = ? WHERE ID = ?', [department, staffEmail, depRow.ID], function(err3) {
          if (err3) {
            console.log('DEBUGGING: Failed to update department', err3);
            return res.status(500).json({ success: false, error: 'Failed to update department.' });
          }
          res.json({ success: true });
        });
      } else {
        console.log('DEBUGGING: No department row, inserting new');
        db.run('INSERT INTO department (Staff_Name, staff_email, department) VALUES (?, ?, ?)', [staffName, staffEmail, department], function(err4) {
          if (err4) {
            console.log('DEBUGGING: Failed to assign department', err4);
            return res.status(500).json({ success: false, error: 'Failed to assign department.' });
          }
          res.json({ success: true });
        });
      }
    });
  });
});

// Department endpoints
router.get('/all', (req, res) => {
  const db = req.app.locals.db;
  db.all('SELECT * FROM department', [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: 'Failed to fetch department data.' });
    } else {
      res.json({ department: rows });
    }
  });
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

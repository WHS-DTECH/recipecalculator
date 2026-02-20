// Script to insert specific staff names into the department table if not already present
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to connect to SQLite database:', err.message);
    process.exit(1);
  } else {
    // Ensure First_Name and Last_Name columns exist
    db.all("PRAGMA table_info(department);", (err, columns) => {
      if (!err) {
        const hasFirst = columns.some(col => col.name === 'First_Name');
        const hasLast = columns.some(col => col.name === 'Last_Name');
        let alterCount = 0;
        const finishAlters = () => {
          // Now insert names
          const staffNames = [
            'Diplock, Maryke',
            'Holly McKee',
            'Adrienne Reeves',
            'Janet Webster',
            'Vanessa Pringle'
          ];
          let completed = 0;
          staffNames.forEach(name => {
            let last = '', first = '';
            if (name.includes(',')) {
              [last, first] = name.split(',').map(s => s.trim());
            } else {
              const parts = name.trim().split(' ');
              first = parts.pop();
              last = parts.join(' ');
            }
            db.get('SELECT * FROM department WHERE First_Name = ? AND Last_Name = ?', [first, last], (err, row) => {
              if (err) {
                console.error('Error checking department:', err.message);
              } else if (!row) {
                db.run('INSERT INTO department (Staff_Name, First_Name, Last_Name) VALUES (?, ?, ?)', [name, first, last], (err2) => {
                  if (err2) {
                    console.error('Error inserting into department:', err2.message);
                  } else {
                    console.log('Inserted:', first, last);
                  }
                  if (++completed === staffNames.length) db.close();
                });
              } else {
                console.log('Already exists:', first, last);
                if (++completed === staffNames.length) db.close();
              }
            });
          });
        };
        if (!hasFirst) {
          db.run('ALTER TABLE department ADD COLUMN First_Name TEXT;', () => { if (++alterCount === (hasFirst ? 0 : 1) + (hasLast ? 0 : 1)) finishAlters(); });
        }
        if (!hasLast) {
          db.run('ALTER TABLE department ADD COLUMN Last_Name TEXT;', () => { if (++alterCount === (hasFirst ? 0 : 1) + (hasLast ? 0 : 1)) finishAlters(); });
        }
        if (hasFirst && hasLast) finishAlters();
      }
    });
  }
});

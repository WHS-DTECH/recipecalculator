// Script to force-create the department table in database.sqlite
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to connect to SQLite database:', err.message);
    process.exit(1);
  } else {
    db.run(`CREATE TABLE IF NOT EXISTS department (
      ID INTEGER PRIMARY KEY AUTOINCREMENT,
      Staff_Name TEXT,
      Classes TEXT,
      staff_email TEXT
    );`, (err) => {
      if (err) {
        console.error('Failed to create department table:', err.message);
      } else {
        console.log('Department table created or already exists.');
      }
      db.close();
    });
  }
});

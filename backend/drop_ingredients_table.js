// Run this script with: node drop_ingredients_table.js
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database.sqlite');

db.serialize(() => {
  db.run('DROP TABLE IF EXISTS ingredients;', function(err) {
    if (err) {
      console.error('Failed to drop ingredients table:', err.message);
    } else {
      console.log('ingredients table dropped successfully.');
    }
    db.close();
  });
});

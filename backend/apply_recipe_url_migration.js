const fs = require('fs');
const path = require('path');
const pool = require('./db');

async function runMigration() {
  try {
    const sqlFile = path.join(__dirname, 'add_recipe_url_to_bookings.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');
    
    console.log('Running migration: add_recipe_url_to_bookings');
    await pool.query(sql);
    console.log('✓ Migration completed successfully');
    process.exit(0);
  } catch (err) {
    console.error('✗ Migration failed:', err.message);
    process.exit(1);
  }
}

runMigration();

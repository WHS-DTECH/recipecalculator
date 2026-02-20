-- Run this script in your backend directory to apply the migration
-- Usage: node apply_migration.js desired_servings_ingredients.sql

const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'recipe_database.db');
const migrationFile = process.argv[2];

if (!migrationFile) {
  console.error('Usage: node apply_migration.js <migration.sql>');
  process.exit(1);
}

const sql = fs.readFileSync(path.join(__dirname, migrationFile), 'utf8');
const db = new sqlite3.Database(dbPath);

db.exec(sql, (err) => {
  if (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } else {
    console.log('Migration applied successfully.');
    process.exit(0);
  }
});

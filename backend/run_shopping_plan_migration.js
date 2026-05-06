// run_shopping_plan_migration.js
// Applies the teacher-first shopping plan tables to the Neon Postgres database.
// Usage: node backend/run_shopping_plan_migration.js
//
// Run ONCE after deploying. Safe to re-run — all statements use IF NOT EXISTS.

const fs = require('fs');
const path = require('path');
const pool = require('./db');

async function runMigration() {
  const sqlFile = path.join(__dirname, 'shopping_plan_migration.sql');
  const sql = fs.readFileSync(sqlFile, 'utf8');

  console.log('Running migration: shopping_plan tables...');
  try {
    await pool.query(sql);
    console.log('✓ shopping_plan          created (or already exists)');
    console.log('✓ shopping_plan_classes  created (or already exists)');
    console.log('✓ shopping_plan_items    created (or already exists)');
    console.log('✓ shopping_plan_item_audit created (or already exists)');
    console.log('✓ All indexes created (or already exist)');
    console.log('\nMigration completed successfully.');
  } catch (err) {
    console.error('✗ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();

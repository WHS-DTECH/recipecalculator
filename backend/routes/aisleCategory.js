console.log("aisleCategory.js router loaded");

// Aisle Category CRUD endpoints using Postgres
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:password@host:port/db?sslmode=require';
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

// Get all aisle categories
router.get('/', async (req, res) => {
  console.log("GET /api/aisle_category called");
  try {
    const result = await pool.query('SELECT * FROM aisle_category ORDER BY sort_order, id');
    console.log("aisle_category query result:", result.rows);
    res.json({ success: true, categories: result.rows });
  } catch (err) {
    console.error('AisleCategory GET error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Add a new aisle category
router.post('/', async (req, res) => {
  const { name, sort_order } = req.body;
  if (!name) return res.status(400).json({ error: 'Category name required' });
  try {
    const result = await pool.query('INSERT INTO aisle_category (name, sort_order) VALUES ($1, $2) RETURNING id', [name, sort_order || 0]);
    res.json({ id: result.rows[0].id, name, sort_order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Edit an aisle category
router.put('/:id', async (req, res) => {
  const { name, sort_order } = req.body;
  const { id } = req.params;
  if (!name) return res.status(400).json({ error: 'Category name required' });
  try {
    await pool.query('UPDATE aisle_category SET name = $1, sort_order = $2 WHERE id = $3', [name, sort_order || 0, id]);
    res.json({ id, name, sort_order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete an aisle category
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM aisle_category WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

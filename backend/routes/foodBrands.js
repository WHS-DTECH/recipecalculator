// Food Brands CRUD endpoints as a separate router
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const PG_CONNECTION_STRING = process.env.PG_CONNECTION_STRING || 'postgresql://neondb_owner:password@host:port/db?sslmode=require';
const pool = new Pool({ connectionString: PG_CONNECTION_STRING, ssl: { rejectUnauthorized: false } });

// Get all food brands
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM food_brands ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add a new food brand
router.post('/', async (req, res) => {
  const { brand_name } = req.body;
  if (!brand_name) return res.status(400).json({ error: 'Brand name required' });
  try {
    const result = await pool.query('INSERT INTO food_brands (brand_name) VALUES ($1) RETURNING id', [brand_name]);
    res.json({ id: result.rows[0].id, brand_name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Edit a food brand
router.put('/:id', async (req, res) => {
  const { brand_name } = req.body;
  const { id } = req.params;
  if (!brand_name) return res.status(400).json({ error: 'Brand name required' });
  try {
    await pool.query('UPDATE food_brands SET brand_name = $1 WHERE id = $2', [brand_name, id]);
    res.json({ id, brand_name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a food brand
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM food_brands WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

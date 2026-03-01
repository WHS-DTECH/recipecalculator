// Food Brands CRUD endpoints as a separate router
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:password@host:port/db?sslmode=require';
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

// Get all food brands
router.get('/', async (req, res) => {
  console.log("GET /api/food_brands called");
  try {
    const result = await pool.query('SELECT * FROM food_brands ORDER BY id');
    console.log("food_brands query result:", result.rows);
    res.json({ success: true, brands: result.rows });
  } catch (err) {
    console.error('FoodBrands GET error:', err);
    res.status(500).json({ success: false, error: err.message });
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
    console.error('FoodBrands POST error:', err);
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

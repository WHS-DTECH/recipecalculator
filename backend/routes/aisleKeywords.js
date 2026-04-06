// Aisle Keyword CRUD endpoints as a separate router
const express = require('express');
const router = express.Router();
const pool = require('../db');

// Add aisle keyword
router.post('/add', async (req, res) => {
  const { aisle_category_id, keyword } = req.body;
  const cleanedKeyword = String(keyword || '').trim();
  if (!aisle_category_id || !cleanedKeyword) return res.json({ success: false, error: 'Missing data' });

  try {
    const result = await pool.query(
      'INSERT INTO aisle_keywords (aisle_category_id, keyword) VALUES ($1, $2) RETURNING id',
      [aisle_category_id, cleanedKeyword]
    );
    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Edit aisle keyword
router.post('/edit', async (req, res) => {
  const { id, keyword } = req.body;
  const cleanedKeyword = String(keyword || '').trim();
  if (!id || !cleanedKeyword) return res.json({ success: false, error: 'Missing data' });

  try {
    await pool.query('UPDATE aisle_keywords SET keyword = $1 WHERE id = $2', [cleanedKeyword, id]);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Delete aisle keyword
router.post('/delete', async (req, res) => {
  const { id } = req.body;
  if (!id) return res.json({ success: false, error: 'Missing id' });

  try {
    await pool.query('DELETE FROM aisle_keywords WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// API endpoint to get all aisle keywords with category names
router.get('/all', async (req, res) => {
  const sql = `
    SELECT ak.id, ak.keyword, ac.name AS aisle_category
    FROM aisle_keywords ak
    LEFT JOIN aisle_category ac ON ak.aisle_category_id = ac.id
    ORDER BY COALESCE(ac.sort_order, 9999), ak.keyword
  `;
  try {
    const result = await pool.query(sql);
    res.json({ success: true, keywords: result.rows });
  } catch (err) {
    res.json({ success: false, error: err.message, keywords: [] });
  }
});

module.exports = router;

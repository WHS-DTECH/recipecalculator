const express = require('express');
const router = express.Router();
const pool = require('../../db');
const fs = require('fs');
const path = require('path');

// POST /api/uploads
router.post('/', async (req, res) => {
  const { recipe_title, upload_type, source_url, uploaded_by, upload_date, raw_data } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO uploads (recipe_title, upload_type, source_url, uploaded_by, upload_date, raw_data) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [recipe_title, upload_type, source_url, uploaded_by, upload_date, raw_data]
    );
    res.json({ success: true, upload_id: result.rows[0].id });
  } catch (err) {
    console.error('[DEBUG /api/uploads] Failed to insert upload:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/uploads
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM uploads ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/uploads/:id/raw
router.put('/:id/raw', async (req, res) => {
  const { id } = req.params;
  const { recipe_id, raw_data } = req.body;
  const rawDataDir = path.join(__dirname, '../../public/RawDataTXT');
  if (!fs.existsSync(rawDataDir)) {
    fs.mkdirSync(rawDataDir, { recursive: true });
  }
  const filePath = path.join(rawDataDir, `${id}.txt`);
  try {
    await pool.query('UPDATE uploads SET raw_data = $1 WHERE id = $2', [raw_data, id]);
    fs.writeFile(filePath, raw_data, (fileErr) => {
      if (fileErr) {
        return res.status(500).json({ success: false, error: 'Failed to write raw data file', details: fileErr.message });
      }
      res.json({ success: true });
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to update uploads table', details: err.message });
  }
});

// DELETE /api/uploads/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM uploads WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Upload record not found.' });
    }
    res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to delete upload record.' });
  }
});

// GET /api/uploads/:id
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM uploads WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Upload not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

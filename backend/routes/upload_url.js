const express = require('express');
const router = express.Router();
const pool = require('../db');

// POST /api/recipes/upload-url
// Receives { url } and inserts into uploads table
router.post('/upload-url', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== 'string' || !url.trim()) {
      return res.status(400).json({ success: false, error: 'Missing or invalid URL.' });
    }
    // Insert into uploads table
    const uploadType = 'url';
    const uploadedBy = 'user@example.com';
    const uploadDate = new Date();
    // Recipe title is the URL
    const recipeTitle = url;
    const sourceUrl = url;
    // Insert and return the new upload record
    const insertQuery = `
      INSERT INTO uploads (recipe_title, upload_type, source_url, uploaded_by, upload_date)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, recipe_title, upload_type, source_url, uploaded_by, upload_date;
    `;
    const result = await pool.query(insertQuery, [recipeTitle, uploadType, sourceUrl, uploadedBy, uploadDate]);
    const upload = result.rows[0];
    res.json({ success: true, upload });
  } catch (err) {
    console.error('Error uploading recipe URL:', err);
    res.status(500).json({ success: false, error: 'Server error.' });
  }
});

module.exports = router;

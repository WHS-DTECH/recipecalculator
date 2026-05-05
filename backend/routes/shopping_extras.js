const express = require('express');
const router = express.Router();
const pool = require('../db');
const requireAdmin = require('../middleware/requireAdmin');

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shopping_extras (
      id SERIAL PRIMARY KEY,
      is_standing BOOLEAN NOT NULL DEFAULT FALSE,
      week_date DATE,
      category TEXT NOT NULL DEFAULT 'Other',
      item_text TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_by_email TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

// GET /api/shopping-extras?week_date=YYYY-MM-DD
router.get('/', async (req, res) => {
  try {
    await ensureTable();
    const weekDate = String(req.query.week_date || '').trim() || null;
    const result = await pool.query(
      `SELECT id, is_standing, week_date::text, category, item_text, sort_order
       FROM shopping_extras
       WHERE is_standing = TRUE
          OR ($1::text IS NOT NULL AND week_date = $1::date)
       ORDER BY is_standing DESC, sort_order, id`,
      [weekDate]
    );
    const standing = result.rows.filter((r) => r.is_standing);
    const week = result.rows.filter((r) => !r.is_standing);
    res.json({ success: true, standing, week });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/shopping-extras/save
// body: { scope: 'standing'|'week', week_date?: 'YYYY-MM-DD', rows: [{category, item_text}] }
router.post('/save', requireAdmin, async (req, res) => {
  try {
    await ensureTable();
    const scope = String(req.body.scope || 'week');
    const isStanding = scope === 'standing';
    const weekDate = isStanding ? null : (String(req.body.week_date || '').trim() || null);
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const createdBy = req.authUserEmail || null;

    if (!isStanding && !weekDate) {
      return res.status(400).json({ success: false, error: 'week_date is required for week scope.' });
    }

    await pool.query('BEGIN');
    if (isStanding) {
      await pool.query('DELETE FROM shopping_extras WHERE is_standing = TRUE');
    } else {
      await pool.query(
        'DELETE FROM shopping_extras WHERE is_standing = FALSE AND week_date = $1::date',
        [weekDate]
      );
    }

    for (let i = 0; i < rows.length; i++) {
      const category = String(rows[i].category || 'Other').trim() || 'Other';
      const item_text = String(rows[i].item_text || '').trim();
      if (!item_text) continue;
      await pool.query(
        `INSERT INTO shopping_extras (is_standing, week_date, category, item_text, sort_order, created_by_email)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [isStanding, isStanding ? null : weekDate, category, item_text, i, createdBy]
      );
    }
    await pool.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await pool.query('ROLLBACK').catch(() => {});
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/shopping-extras/:id  (removes a single saved row)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await ensureTable();
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid id.' });
    }
    await pool.query('DELETE FROM shopping_extras WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

// Aisle Keyword CRUD endpoints as a separate router
const express = require('express');
const router = express.Router();
const pool = require('../db');

let masterKeywordSchemaReady = false;
let masterKeywordSeedReady = false;

async function ensureMasterKeywordSchema() {
  if (masterKeywordSchemaReady) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS aisle_master_keywords (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      aisle_category_id INTEGER REFERENCES aisle_category(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS aisle_master_keyword_members (
      id SERIAL PRIMARY KEY,
      master_keyword_id INTEGER NOT NULL REFERENCES aisle_master_keywords(id) ON DELETE CASCADE,
      keyword TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(
    'CREATE UNIQUE INDEX IF NOT EXISTS aisle_master_keyword_members_unique_idx ON aisle_master_keyword_members(master_keyword_id, lower(keyword))'
  );

  masterKeywordSchemaReady = true;
}

async function ensureAisleCategory(categoryName) {
  const clean = String(categoryName || '').trim();
  if (!clean) return null;

  const existing = await pool.query('SELECT id FROM aisle_category WHERE lower(name) = lower($1) LIMIT 1', [clean]);
  if (existing.rows.length) return existing.rows[0].id;

  const inserted = await pool.query(
    `INSERT INTO aisle_category (name, sort_order)
     VALUES ($1, COALESCE((SELECT MAX(sort_order) + 1 FROM aisle_category), 1))
     RETURNING id`,
    [clean]
  );
  return inserted.rows[0].id;
}

async function ensureMasterKeyword(masterName, aisleCategoryId, memberKeywords) {
  const cleanMaster = String(masterName || '').trim();
  if (!cleanMaster || !aisleCategoryId) return;

  const upsertMaster = await pool.query(
    `INSERT INTO aisle_master_keywords (name, aisle_category_id)
     VALUES ($1, $2)
     ON CONFLICT (name)
     DO UPDATE SET aisle_category_id = EXCLUDED.aisle_category_id, updated_at = NOW()
     RETURNING id`,
    [cleanMaster, aisleCategoryId]
  );
  const masterId = upsertMaster.rows[0].id;

  for (const keyword of memberKeywords) {
    const cleanKeyword = String(keyword || '').trim();
    if (!cleanKeyword) continue;

    await pool.query(
      `INSERT INTO aisle_master_keyword_members (master_keyword_id, keyword)
       VALUES ($1, $2)
       ON CONFLICT (master_keyword_id, lower(keyword))
       DO UPDATE SET updated_at = NOW()`,
      [masterId, cleanKeyword]
    );

    // Keep existing behavior intact: ensure concrete aisle_keywords rows continue to drive matching.
    const existingKeyword = await pool.query(
      'SELECT id, aisle_category_id FROM aisle_keywords WHERE lower(keyword) = lower($1) LIMIT 1',
      [cleanKeyword]
    );

    if (existingKeyword.rows.length) {
      const row = existingKeyword.rows[0];
      if (String(row.aisle_category_id) !== String(aisleCategoryId)) {
        await pool.query('UPDATE aisle_keywords SET aisle_category_id = $1 WHERE id = $2', [aisleCategoryId, row.id]);
      }
    } else {
      await pool.query('INSERT INTO aisle_keywords (aisle_category_id, keyword) VALUES ($1, $2)', [aisleCategoryId, cleanKeyword]);
    }
  }
}

async function ensureMasterKeywordSeedData() {
  if (masterKeywordSeedReady) return;
  await ensureMasterKeywordSchema();
  const meatCategoryId = await ensureAisleCategory('Meat');

  await ensureMasterKeyword('Meat', meatCategoryId, [
    'Meat',
    'Beef',
    'Lamb',
    'Pork',
    'Chicken',
    'Turkey',
    'Venison',
    'Bacon',
    'Ham',
    'Mince',
    'Sausage',
    'Sausages'
  ]);

  masterKeywordSeedReady = true;
}

// Add aisle keyword
router.post('/add', async (req, res) => {
  const { aisle_category_id, keyword } = req.body;
  const cleanedKeyword = String(keyword || '').trim();
  if (!aisle_category_id || !cleanedKeyword) return res.json({ success: false, error: 'Missing data' });

  try {
    await ensureMasterKeywordSeedData();
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
    await ensureMasterKeywordSeedData();
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
    await ensureMasterKeywordSeedData();
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
    await ensureMasterKeywordSeedData();
    const result = await pool.query(sql);
    res.json({ success: true, keywords: result.rows });
  } catch (err) {
    res.json({ success: false, error: err.message, keywords: [] });
  }
});

// Optional management endpoint for upcoming master keywords.
router.get('/masters', async (req, res) => {
  try {
    await ensureMasterKeywordSeedData();
    const result = await pool.query(
      `SELECT mk.id, mk.name, mk.aisle_category_id, ac.name AS aisle_category,
              COALESCE(
                json_agg(mkm.keyword ORDER BY mkm.keyword) FILTER (WHERE mkm.keyword IS NOT NULL),
                '[]'::json
              ) AS members
         FROM aisle_master_keywords mk
         LEFT JOIN aisle_category ac ON ac.id = mk.aisle_category_id
         LEFT JOIN aisle_master_keyword_members mkm ON mkm.master_keyword_id = mk.id
        GROUP BY mk.id, mk.name, mk.aisle_category_id, ac.name
        ORDER BY mk.name`
    );
    return res.json({ success: true, masters: result.rows });
  } catch (err) {
    return res.json({ success: false, error: err.message, masters: [] });
  }
});

module.exports = router;

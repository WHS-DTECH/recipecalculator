const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAdmin } = require('../middleware/requireAdmin');

let schemaReady = false;
let plannerUploadSchemaReady = false;

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

async function ensureSchema() {
  if (schemaReady) return;
  await pool.query("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS recipe_url TEXT DEFAULT ''");
  await pool.query("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS planner_stream TEXT DEFAULT 'Middle'");
  await pool.query("UPDATE bookings SET planner_stream='Middle' WHERE planner_stream IS NULL OR planner_stream=''");
  schemaReady = true;
}

async function ensurePlannerUploadSchema() {
  if (plannerUploadSchemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS planner_upload_history (
      id SERIAL PRIMARY KEY,
      file_name TEXT,
      uploaded_by_email TEXT,
      uploaded_by_name TEXT,
      uploaded_by_staff_code TEXT,
      planner_stream TEXT,
      bookings_saved INTEGER DEFAULT 0,
      uploaded_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  plannerUploadSchemaReady = true;
}

function getLegacyClassNamesForStream(stream) {
  const normalized = String(stream || '').trim().toLowerCase();
  if (normalized === 'middle') return ['MFOOD'];
  if (normalized === 'junior') return ['JFOOD'];
  if (normalized === 'senior') return ['HOSP', '11HOSP', '12HOSP', '13HOSP', '100HOSP', '200HOSP', '300HOSP'];
  return [];
}

function inferPlannerStreamFromCode(code) {
  const value = String(code || '').trim().toUpperCase();
  if (!value) return 'Other';
  if (value.includes('JFOOD')) return 'Junior';
  if (value.includes('HOSP')) return 'Senior';
  if (value.includes('MFOOD')) return 'Middle';
  return 'Other';
}

function toIsoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseIsoDate(value) {
  const match = /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());
  if (!match) return null;
  const parsed = new Date(`${String(value).trim()}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function weekMondayIso(isoDate) {
  const parsed = parseIsoDate(isoDate);
  if (!parsed) return '';
  const day = parsed.getDay();
  const diff = (day + 6) % 7;
  parsed.setDate(parsed.getDate() - diff);
  return toIsoDate(parsed);
}

function normalizeClassToken(value) {
  return String(value || '').trim().toUpperCase();
}

function inferStreamFromClassToken(classToken) {
  const value = normalizeClassToken(classToken);
  if (!value) return '';
  if (value.includes('HOSP')) return 'Senior';
  if (value.includes('JFOOD')) return 'Junior';
  if (value.includes('MFOOD') || value.includes('FOOD')) return 'Middle';
  return '';
}

function buildTeacherName(staffRow, fallbackCode) {
  if (!staffRow) return fallbackCode || '';
  const first = String(staffRow.first_name || '').trim();
  const last = String(staffRow.last_name || '').trim();
  const code = String(staffRow.code || fallbackCode || '').trim();
  const joined = [last, first].filter(Boolean).join(', ');
  if (joined && code) return `${joined} (${code})`;
  return joined || code;
}

function splitClasses(rawValues) {
  const seen = new Set();
  const out = [];
  for (const raw of rawValues || []) {
    const parts = String(raw || '')
      .split(/[;|]/g)
      .map((v) => String(v || '').trim())
      .filter(Boolean);
    for (const item of parts) {
      const key = normalizeClassToken(item);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

// Update a booking by ID
router.put('/:id', async (req, res) => {
  const { staff_id, staff_name, class_name, booking_date, period, recipe, recipe_url, recipe_id, class_size, planner_stream } = req.body;
  try {
    await ensureSchema();
    await pool.query(
      "UPDATE bookings SET staff_id=$1, staff_name=$2, class_name=$3, booking_date=$4, period=$5, recipe=$6, recipe_url=$7, recipe_id=$8, class_size=$9, planner_stream=COALESCE($10, planner_stream, 'Middle') WHERE id=$11",
      [staff_id, staff_name, class_name, booking_date, period, recipe, recipe_url, recipe_id, class_size, planner_stream || null, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to update booking:', err.message);
    res.status(500).json({ error: 'Failed to update booking.' });
  }
});

// DELETE /api/bookings/clear-planners - Clear planner bookings (admin function)
// Optional query params: stream=Middle|Junior|Senior|All, className=<TT code>
router.delete('/clear-planners', async (req, res) => {
  try {
    await ensureSchema();
    const requestedStream = String(req.query.stream || 'All').trim();
    const normalized = requestedStream.toLowerCase();
    const requestedClassName = String(req.query.className || '').trim().toUpperCase();

    let result;
    let scopeLabel = 'all planners';

    if (requestedClassName) {
      const params = [requestedClassName];
      let sql = `DELETE FROM bookings WHERE period = 'Planner' AND upper(trim(coalesce(class_name, ''))) = $1`;

      if (normalized && normalized !== 'all') {
        const streamLabel = normalized.charAt(0).toUpperCase() + normalized.slice(1);
        const legacyClassNames = getLegacyClassNamesForStream(streamLabel);
        params.push(streamLabel, legacyClassNames);
        sql += `
          AND (
            lower(coalesce(planner_stream, '')) = lower($2)
            OR upper(trim(coalesce(class_name, ''))) = ANY($3::text[])
          )`;
        scopeLabel = `${streamLabel} planner for class ${requestedClassName}`;
      } else {
        scopeLabel = `planner entries for class ${requestedClassName}`;
      }

      result = await pool.query(sql, params);
    } else if (normalized === 'all' || !normalized) {
      result = await pool.query("DELETE FROM bookings WHERE period = 'Planner'");
    } else if (normalized === 'middle' || normalized === 'junior' || normalized === 'senior') {
      const streamLabel = normalized.charAt(0).toUpperCase() + normalized.slice(1);
      scopeLabel = `${streamLabel} planner`;
      const legacyClassNames = getLegacyClassNamesForStream(streamLabel);

      result = await pool.query(
        `DELETE FROM bookings
         WHERE period = 'Planner'
           AND (
             lower(coalesce(planner_stream, '')) = lower($1)
             OR upper(coalesce(class_name, '')) = ANY($2::text[])
           )`,
        [streamLabel, legacyClassNames]
      );
    } else {
      return res.status(400).json({ error: 'Invalid stream. Use All, Middle, Junior, or Senior.' });
    }

    const deletedCount = result.rowCount || 0;
    console.log(`[ADMIN] Cleared ${deletedCount} ${scopeLabel} booking(s)`);
    res.json({
      success: true,
      message: `Deleted ${deletedCount} ${scopeLabel} booking(s).`,
      deleted: deletedCount,
      stream: requestedStream
    });
  } catch (err) {
    console.error('Failed to clear planner bookings:', err.message);
    res.status(500).json({ error: 'Failed to clear planner bookings.' });
  }
});

// Delete a booking by ID
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM bookings WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete booking.' });
  }
});

// Create a new booking
router.post('/', async (req, res) => {
  const { staff_id, staff_name, class_name, booking_date, period, recipe, recipe_url, recipe_id, class_size, planner_stream } = req.body;
  try {
    await ensureSchema();
    const result = await pool.query(
      "INSERT INTO bookings (staff_id, staff_name, class_name, booking_date, period, recipe, recipe_url, recipe_id, class_size, planner_stream) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id",
      [staff_id, staff_name, class_name, booking_date, period, recipe, recipe_url, recipe_id, class_size, planner_stream || 'Middle']
    );
    res.json({ success: true, booking_id: result.rows[0].id });
  } catch (err) {
    console.error('Failed to create booking:', err.message);
    res.status(500).json({ error: 'Failed to create booking.' });
  }
});

// Batch create bookings (used by Upload Planners page)
router.post('/batch', async (req, res) => {
  const items = req.body && Array.isArray(req.body.bookings) ? req.body.bookings : null;
  const meta = req.body && req.body.meta ? req.body.meta : {};
  if (!items || !items.length) {
    return res.status(400).json({ error: 'bookings array is required.' });
  }
  try {
    await ensureSchema();
    await ensurePlannerUploadSchema();
    const ids = [];
    for (const b of items) {
      const { staff_id, staff_name, class_name, booking_date, period, recipe, recipe_url, recipe_id, class_size, planner_stream } = b;
      const result = await pool.query(
        "INSERT INTO bookings (staff_id, staff_name, class_name, booking_date, period, recipe, recipe_url, recipe_id, class_size, planner_stream) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id",
        [staff_id, staff_name, class_name, booking_date, period, recipe, recipe_url, recipe_id, class_size, planner_stream || 'Middle']
      );
      ids.push(result.rows[0].id);
    }

    // Record this batch upload for planner file explorer/history UI.
    let uploaderEmail = normalizeEmail(req.authUserEmail || meta.uploaded_by_email || '');
    const uploaderName = String(meta.uploaded_by_name || '').trim();
    const fileName = String(meta.file_name || '').trim();
    const stream = String(meta.planner_stream || (items[0] && items[0].planner_stream) || 'Middle').trim() || 'Middle';
    let uploaderStaffCode = '';

    if (!uploaderEmail && items[0] && items[0].staff_id) {
      uploaderStaffCode = String(items[0].staff_id || '').trim();
    }

    if (uploaderEmail) {
      const staffResult = await pool.query(
        `SELECT trim(coalesce(code, '')) AS code
         FROM staff_upload
         WHERE lower(trim(email_school)) = lower(trim($1))
         LIMIT 1`,
        [uploaderEmail]
      );
      uploaderStaffCode = String((staffResult.rows[0] && staffResult.rows[0].code) || '').trim();
    }

    await pool.query(
      `INSERT INTO planner_upload_history
       (file_name, uploaded_by_email, uploaded_by_name, uploaded_by_staff_code, planner_stream, bookings_saved)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        fileName,
        uploaderEmail || null,
        uploaderName || null,
        uploaderStaffCode || null,
        stream,
        ids.length
      ]
    );

    res.json({ success: true, saved: ids.length, ids });
  } catch (err) {
    console.error('Failed to batch create bookings:', err.message);
    res.status(500).json({ error: 'Failed to save bookings.' });
  }
});

// GET /api/bookings/planner-upload-history
// Optional query params: email=<uploader email>, limit=<n>
router.get('/planner-upload-history', async (req, res) => {
  try {
    await ensurePlannerUploadSchema();
    const email = normalizeEmail(req.query.email || '');
    const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 200));

    let sql = `
      SELECT id, file_name, uploaded_by_email, uploaded_by_name,
             uploaded_by_staff_code, planner_stream, bookings_saved, uploaded_at
      FROM planner_upload_history`;
    const params = [];

    if (email) {
      params.push(email);
      sql += ` WHERE lower(trim(coalesce(uploaded_by_email, ''))) = lower(trim($1))`;
    }

    params.push(limit);
    sql += ` ORDER BY uploaded_at DESC, id DESC LIMIT $${params.length}`;

    const result = await pool.query(sql, params);
    res.json({ success: true, uploads: result.rows });
  } catch (err) {
    console.error('Failed to fetch planner upload history:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch planner upload history.' });
  }
});

// GET /api/bookings/planner-class-options - current Upload Subjects TT codes ranked by usage
router.get('/planner-class-options', async (req, res) => {
  try {
    await ensureSchema();
    const result = await pool.query(
      `SELECT
         upper(trim(cu.code)) AS class_code,
         trim(coalesce(cu.class_name, '')) AS class_name,
         trim(coalesce(cu.year_level, '')) AS year_level,
         trim(coalesce(cu.year, '')) AS qualification,
         trim(coalesce(cu.department, '')) AS department,
         count(b.id)::int AS usage_count
       FROM class_upload cu
       LEFT JOIN bookings b
         ON upper(trim(coalesce(b.class_name, ''))) = upper(trim(coalesce(cu.code, '')))
       WHERE coalesce(cu.status, 'Current') = 'Current'
         AND trim(coalesce(cu.code, '')) <> ''
       GROUP BY cu.code, cu.class_name, cu.year_level, cu.year, cu.department
       ORDER BY count(b.id) DESC, upper(trim(cu.code)) ASC`
    );

    const classes = result.rows.map((row) => ({
      code: row.class_code,
      name: row.class_name,
      yearLevel: row.year_level,
      qualification: row.qualification,
      department: row.department,
      usageCount: row.usage_count || 0,
      stream: inferPlannerStreamFromCode(row.class_code)
    }));

    res.json({ success: true, classes });
  } catch (err) {
    console.error('Failed to fetch planner class options:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch planner class options.' });
  }
});

// GET /api/bookings/admin/resave-candidates
// Admin-only audit endpoint to find bookings that likely need re-save after SQLite->Postgres migration.
router.get('/admin/resave-candidates', requireAdmin, async (req, res) => {
  try {
    await ensureSchema();

    const startDate = parseIsoDate(req.query.startDate) ? String(req.query.startDate).trim() : '';
    const endDate = parseIsoDate(req.query.endDate) ? String(req.query.endDate).trim() : '';
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(1000, Math.floor(limitRaw))) : 300;

    const params = [];
    const where = ["trim(coalesce(b.recipe, '')) <> ''"];
    if (startDate) {
      params.push(startDate);
      where.push(`b.booking_date >= $${params.length}`);
    }
    if (endDate) {
      params.push(endDate);
      where.push(`b.booking_date <= $${params.length}`);
    }

    params.push(limit);
    const sql = `
      WITH inv AS (
        SELECT recipe_id::text AS recipe_id_text, COUNT(*)::int AS inventory_rows
        FROM ingredients_inventory
        GROUP BY recipe_id::text
      ),
      browse AS (
        SELECT id, lower(trim(name)) AS normalized_name
        FROM recipes
      )
      SELECT
        b.id AS booking_id,
        b.booking_date,
        b.period,
        b.staff_name,
        b.class_name,
        b.recipe,
        b.recipe_id,
        COUNT(dsi.id)::int AS ingredient_rows,
        COUNT(*) FILTER (
          WHERE coalesce(dsi.recipe_id::text, '') = coalesce(b.recipe_id::text, '')
        )::int AS rows_for_current_recipe,
        COALESCE(inv.inventory_rows, 0)::int AS inventory_rows,
        CASE
          WHEN EXISTS (SELECT 1 FROM browse br WHERE br.id = b.recipe_id) THEN 'id'
          WHEN EXISTS (
            SELECT 1
            FROM browse br
            WHERE br.normalized_name = lower(trim(coalesce(b.recipe, '')))
          ) THEN 'name'
          ELSE 'none'
        END AS browse_match_type
      FROM bookings b
      LEFT JOIN desired_servings_ingredients dsi
        ON dsi.booking_id = b.id
      LEFT JOIN inv
        ON inv.recipe_id_text = coalesce(b.recipe_id::text, '')
      WHERE ${where.join(' AND ')}
      GROUP BY b.id, b.booking_date, b.period, b.staff_name, b.class_name, b.recipe, b.recipe_id, inv.inventory_rows
      HAVING COUNT(dsi.id) = 0
         OR COUNT(*) FILTER (
              WHERE coalesce(dsi.recipe_id::text, '') = coalesce(b.recipe_id::text, '')
            ) = 0
      ORDER BY b.booking_date ASC, b.period ASC, b.staff_name ASC, b.class_name ASC
      LIMIT $${params.length}`;

    const result = await pool.query(sql, params);
    const candidates = result.rows.map((row) => ({
      booking_id: row.booking_id,
      booking_date: row.booking_date,
      period: row.period,
      staff_name: row.staff_name,
      class_name: row.class_name,
      recipe: row.recipe,
      recipe_id: row.recipe_id,
      ingredient_rows: row.ingredient_rows,
      rows_for_current_recipe: row.rows_for_current_recipe,
      reason: Number(row.ingredient_rows) === 0
        ? 'missing_desired_servings_rows'
        : 'ingredients_linked_to_other_recipe_only',
      inventory_rows: Number(row.inventory_rows) || 0,
      inventory_status: Number(row.inventory_rows) > 0
        ? 'recipe_has_inventory'
        : 'recipe_missing_inventory',
      browse_match_type: row.browse_match_type || 'none',
      browse_status: (row.browse_match_type && row.browse_match_type !== 'none')
        ? 'recipe_in_browse_list'
        : 'recipe_missing_from_browse_list'
    }));

    const withInventory = candidates.filter((r) => r.inventory_status === 'recipe_has_inventory').length;
    const missingInventory = candidates.filter((r) => r.inventory_status === 'recipe_missing_inventory').length;
    const inBrowseList = candidates.filter((r) => r.browse_status === 'recipe_in_browse_list').length;
    const missingBrowseList = candidates.filter((r) => r.browse_status === 'recipe_missing_from_browse_list').length;

    res.json({
      success: true,
      filters: { startDate: startDate || null, endDate: endDate || null, limit },
      count: candidates.length,
      comparison: {
        recipe_has_inventory: withInventory,
        recipe_missing_inventory: missingInventory,
        recipe_in_browse_list: inBrowseList,
        recipe_missing_from_browse_list: missingBrowseList
      },
      candidates
    });
  } catch (err) {
    console.error('Failed to fetch re-save candidates:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch re-save candidates.' });
  }
});

// POST /api/bookings/prefill-from-planner
// Admin-only utility: creates class bookings for Food/HOSP double periods from planner recipes.
// Body (optional): { startDate, endDate, dryRun }
router.post('/prefill-from-planner', requireAdmin, async (req, res) => {
  try {
    await ensureSchema();

    const body = req.body || {};
    const dryRun = body.dryRun === true || String(body.dryRun || '').toLowerCase() === 'true';

    const startDateObj = parseIsoDate(body.startDate) || new Date();
    const yearEnd = new Date(startDateObj.getFullYear(), 11, 31);
    const endDateObj = parseIsoDate(body.endDate) || yearEnd;

    if (startDateObj > endDateObj) {
      return res.status(400).json({ success: false, error: 'startDate must be before endDate.' });
    }

    const startDate = toIsoDate(startDateObj);
    const endDate = toIsoDate(endDateObj);

    const plannerResult = await pool.query(
      `SELECT id, booking_date, class_name, planner_stream, recipe, recipe_url, recipe_id
       FROM bookings
       WHERE period = 'Planner'
         AND booking_date >= $1
         AND booking_date <= $2
         AND trim(coalesce(recipe, '')) <> ''
       ORDER BY booking_date ASC, id ASC`,
      [startDate, endDate]
    );

    const plannerByDateAndStream = new Map();
    for (const row of plannerResult.rows) {
      const stream = String(row.planner_stream || inferStreamFromClassToken(row.class_name) || inferPlannerStreamFromCode(row.class_name) || '').trim();
      if (!stream || stream === 'Other') continue;
      const date = String(row.booking_date || '').slice(0, 10);
      const key = `${date}|${stream}`;
      if (!plannerByDateAndStream.has(key)) {
        plannerByDateAndStream.set(key, row);
      }
    }

    if (!plannerByDateAndStream.size) {
      return res.json({
        success: true,
        dryRun,
        summary: {
          startDate,
          endDate,
          plannerRecipesFound: 0,
          candidates: 0,
          inserted: 0,
          skippedExisting: 0,
          skippedNoPlanner: 0,
          skippedNonFood: 0,
          skippedNotDouble: 0
        }
      });
    }

    const staffResult = await pool.query(
      `SELECT id, code, first_name, last_name
       FROM staff_upload`
    );
    const staffByCode = new Map();
    for (const s of staffResult.rows) {
      const key = normalizeClassToken(s.code);
      if (key) staffByCode.set(key, s);
    }

    const timetableResult = await pool.query(
      `SELECT "Teacher", "D1_P1_1", "D1_P1_2", "D1_P2", "D1_P3", "D1_P4", "D1_P5",
              "D2_P1_1", "D2_P1_2", "D2_P2", "D2_P3", "D2_P4", "D2_P5",
              "D3_P1_1", "D3_P1_2", "D3_P2", "D3_P3", "D3_P4", "D3_P5",
              "D4_P1_1", "D4_P1_2", "D4_P2", "D4_P3", "D4_P4", "D4_P5",
              "D5_P1_1", "D5_P1_2", "D5_P2", "D5_P3", "D5_P4", "D5_P5"
       FROM kamar_timetable
       WHERE coalesce(status, 'Current') = 'Current'`
    );

    const existingResult = await pool.query(
      `SELECT booking_date, period, class_name
       FROM bookings
       WHERE booking_date >= $1
         AND booking_date <= $2
         AND period IN ('1','2','3','4','5')`,
      [startDate, endDate]
    );
    const existingSlots = new Set(
      existingResult.rows.map((r) => `${String(r.booking_date || '').slice(0, 10)}|${String(r.period || '').trim()}|${normalizeClassToken(r.class_name)}`)
    );

    const inserts = [];
    const stats = {
      plannerRecipesFound: plannerByDateAndStream.size,
      candidates: 0,
      inserted: 0,
      skippedExisting: 0,
      skippedNoPlanner: 0,
      skippedNonFood: 0,
      skippedNotDouble: 0
    };

    const cursor = new Date(startDateObj);
    cursor.setHours(0, 0, 0, 0);

    while (cursor <= endDateObj) {
      const day = cursor.getDay();
      if (day >= 1 && day <= 5) {
        const dayPrefix = `D${day}`;
        const dateIso = toIsoDate(cursor);

        for (const row of timetableResult.rows) {
          const teacherCode = normalizeClassToken(row.Teacher);
          if (!teacherCode) continue;

          const periodClasses = {
            1: splitClasses([row[`${dayPrefix}_P1_1`], row[`${dayPrefix}_P1_2`]]),
            2: splitClasses([row[`${dayPrefix}_P2`]]),
            3: splitClasses([row[`${dayPrefix}_P3`]]),
            4: splitClasses([row[`${dayPrefix}_P4`]]),
            5: splitClasses([row[`${dayPrefix}_P5`]])
          };

          const classPeriodMap = new Map();
          for (const [period, classes] of Object.entries(periodClasses)) {
            for (const cls of classes) {
              const key = normalizeClassToken(cls);
              if (!key) continue;
              const arr = classPeriodMap.get(key) || [];
              arr.push(Number(period));
              classPeriodMap.set(key, arr);
            }
          }

          for (const [classTokenKey, periods] of classPeriodMap.entries()) {
            if (periods.length < 2) {
              stats.skippedNotDouble += periods.length;
              continue;
            }

            const stream = inferStreamFromClassToken(classTokenKey);
            if (!stream) {
              stats.skippedNonFood += periods.length;
              continue;
            }

            const plannerKey = `${dateIso}|${stream}`;
            const weekKey = `${weekMondayIso(dateIso)}|${stream}`;
            const planner = plannerByDateAndStream.get(plannerKey) || plannerByDateAndStream.get(weekKey);
            if (!planner) {
              stats.skippedNoPlanner += periods.length;
              continue;
            }

            const staffRow = staffByCode.get(teacherCode);
            const staffId = staffRow ? String(staffRow.id || '') : '';
            const staffName = buildTeacherName(staffRow, teacherCode);

            for (const period of periods) {
              stats.candidates += 1;
              const slotKey = `${dateIso}|${period}|${classTokenKey}`;
              if (existingSlots.has(slotKey)) {
                stats.skippedExisting += 1;
                continue;
              }

              const booking = {
                staff_id: staffId,
                staff_name: staffName,
                class_name: classTokenKey,
                booking_date: dateIso,
                period: String(period),
                recipe: planner.recipe,
                recipe_url: planner.recipe_url || '',
                recipe_id: planner.recipe_id || null,
                class_size: null,
                planner_stream: stream
              };
              inserts.push(booking);
              existingSlots.add(slotKey);
            }
          }
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    if (!dryRun && inserts.length) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const b of inserts) {
          await client.query(
            `INSERT INTO bookings
             (staff_id, staff_name, class_name, booking_date, period, recipe, recipe_url, recipe_id, class_size, planner_stream)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [
              b.staff_id,
              b.staff_name,
              b.class_name,
              b.booking_date,
              b.period,
              b.recipe,
              b.recipe_url,
              b.recipe_id,
              b.class_size,
              b.planner_stream
            ]
          );
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    stats.inserted = inserts.length;
    return res.json({
      success: true,
      dryRun,
      summary: {
        startDate,
        endDate,
        ...stats
      },
      preview: inserts.slice(0, 25)
    });
  } catch (err) {
    console.error('Failed to prefill bookings from planner:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to prefill bookings from planner.' });
  }
});

// Get all bookings — optional ?start=YYYY-MM-DD&end=YYYY-MM-DD to filter by date range
router.get('/all', async (req, res) => {
  try {
    await ensureSchema();
    const { start, end } = req.query;
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if ((start && !dateRe.test(start)) || (end && !dateRe.test(end))) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
    }
    let query = 'SELECT * FROM bookings';
    const params = [];
    if (start && end) {
      query += ' WHERE booking_date >= $1 AND booking_date <= $2';
      params.push(start, end);
    } else if (start) {
      query += ' WHERE booking_date >= $1';
      params.push(start);
    } else if (end) {
      query += ' WHERE booking_date <= $1';
      params.push(end);
    }
    query += ' ORDER BY booking_date DESC, period';
    const result = await pool.query(query, params);
    res.json({ bookings: result.rows });
  } catch (err) {
    console.error('Failed to fetch bookings:', err.message);
    res.status(500).json({ error: 'Failed to fetch bookings.' });
  }
});

// iCal feed — only bookings with a teacher allocated
// Subscribe URL: /api/bookings/ical
router.get('/ical', async (req, res) => {
  // NZ school period start/end times (local, NZST/NZDT handled via UTC offset below)
  const PERIOD_TIMES = {
    1: { start: '08:55', end: '09:55' },
    2: { start: '10:00', end: '11:00' },
    3: { start: '11:05', end: '12:05' },
    4: { start: '12:55', end: '13:55' },
    5: { start: '14:00', end: '15:00' }
  };
  const TIMEZONE = 'Pacific/Auckland';

  function escIcal(str) {
    return String(str == null ? '' : str)
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\n/g, '\\n');
  }

  function foldLine(line) {
    // RFC 5545: lines must be folded at 75 octets
    const out = [];
    let remaining = line;
    while (remaining.length > 75) {
      out.push(remaining.slice(0, 75));
      remaining = ' ' + remaining.slice(75);
    }
    out.push(remaining);
    return out.join('\r\n');
  }

  function toIcalDt(dateStr, timeStr) {
    // dateStr = YYYY-MM-DD, timeStr = HH:MM
    // Return a TZID datetime string
    const d = dateStr.replace(/-/g, '');
    const t = timeStr.replace(':', '') + '00';
    return `${d}T${t}`;
  }

  try {
    const result = await pool.query(
      `SELECT * FROM bookings
       ORDER BY booking_date, period`
    );

    const bookings = result.rows;
    const now = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//RecipeCalculator//BookingSchedule//EN',
      `X-WR-CALNAME:Food Room Booking Schedule`,
      'X-WR-TIMEZONE:Pacific/Auckland',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VTIMEZONE',
      'TZID:Pacific/Auckland',
      'BEGIN:STANDARD',
      'DTSTART:19700405T030000',
      'RRULE:FREQ=YEARLY;BYDAY=1SU;BYMONTH=4',
      'TZOFFSETFROM:+1300',
      'TZOFFSETTO:+1200',
      'TZNAME:NZST',
      'END:STANDARD',
      'BEGIN:DAYLIGHT',
      'DTSTART:19700927T020000',
      'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=9',
      'TZOFFSETFROM:+1200',
      'TZOFFSETTO:+1300',
      'TZNAME:NZDT',
      'END:DAYLIGHT',
      'END:VTIMEZONE'
    ];

    // Deduplicate by date + recipe so multiple period bookings for the same recipe
    // on the same day appear as a single all-day event in Google Calendar.
    const seen = new Set();
    for (const b of bookings) {
      const recipe = String(b.recipe || '').trim();
      const stream = String(b.planner_stream || 'Middle').trim();
      const key = `${b.booking_date}|${recipe}|${b.class_name || ''}|${stream}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // Full-day event: DTEND is the following day (RFC 5545 §3.6.1)
      const startDate = String(b.booking_date || '').replace(/-/g, '');
      const nextDay = new Date(b.booking_date);
      nextDay.setDate(nextDay.getDate() + 1);
      const endDate = nextDay.toISOString().slice(0, 10).replace(/-/g, '');

      const summary = [recipe, b.class_name].filter(Boolean).join(' \u2013 ');
      const description = [
        recipe ? `Recipe: ${recipe}` : '',
        stream ? `Planner stream: ${stream}` : '',
        b.class_name ? `Class: ${b.class_name}` : '',
        b.staff_name ? `Teacher: ${b.staff_name}` : '',
        b.class_size ? `Class size: ${b.class_size}` : ''
      ].filter(Boolean).join('\\n');

      lines.push('BEGIN:VEVENT');
      lines.push(foldLine(`UID:planner-${startDate}-${encodeURIComponent(recipe)}-${encodeURIComponent(b.class_name || '')}@recipecalculator`));
      lines.push(`DTSTAMP:${now}`);
      lines.push(`DTSTART;VALUE=DATE:${startDate}`);
      lines.push(`DTEND;VALUE=DATE:${endDate}`);
      lines.push(foldLine(`SUMMARY:${escIcal(summary || 'Year Planner')}`));
      lines.push(foldLine(`DESCRIPTION:${escIcal(description)}`));
      lines.push('END:VEVENT');
    }

    lines.push('END:VCALENDAR');

    const body = lines.join('\r\n');
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="booking_schedule.ics"');
    res.send(body);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate iCal feed.' });
  }
});

module.exports = router;

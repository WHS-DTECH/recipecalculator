const express = require('express');
const router = express.Router();
const pool = require('../db');

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

// Get all bookings
router.get('/all', async (req, res) => {
  try {
    await ensureSchema();
    const result = await pool.query('SELECT * FROM bookings ORDER BY booking_date DESC, period');
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

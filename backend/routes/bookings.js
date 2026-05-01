const express = require('express');
const router = express.Router();
const pool = require('../db');

let schemaReady = false;
async function ensureSchema() {
  if (schemaReady) return;
  await pool.query("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS recipe_url TEXT DEFAULT ''");
  await pool.query("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS planner_stream TEXT DEFAULT 'Middle'");
  await pool.query("UPDATE bookings SET planner_stream='Middle' WHERE planner_stream IS NULL OR planner_stream=''");
  schemaReady = true;
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

// Batch create bookings (used by recipe_calendar_upload page)
router.post('/batch', async (req, res) => {
  const items = req.body && Array.isArray(req.body.bookings) ? req.body.bookings : null;
  if (!items || !items.length) {
    return res.status(400).json({ error: 'bookings array is required.' });
  }
  try {
    await ensureSchema();
    const ids = [];
    for (const b of items) {
      const { staff_id, staff_name, class_name, booking_date, period, recipe, recipe_url, recipe_id, class_size, planner_stream } = b;
      const result = await pool.query(
        "INSERT INTO bookings (staff_id, staff_name, class_name, booking_date, period, recipe, recipe_url, recipe_id, class_size, planner_stream) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id",
        [staff_id, staff_name, class_name, booking_date, period, recipe, recipe_url, recipe_id, class_size, planner_stream || 'Middle']
      );
      ids.push(result.rows[0].id);
    }
    res.json({ success: true, saved: ids.length, ids });
  } catch (err) {
    console.error('Failed to batch create bookings:', err.message);
    res.status(500).json({ error: 'Failed to save bookings.' });
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

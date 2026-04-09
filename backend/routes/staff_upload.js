const express = require('express');
const router = express.Router();
const pool = require('../db');

async function ensureStaffSchema() {
  await pool.query("ALTER TABLE staff_upload ADD COLUMN IF NOT EXISTS primary_role TEXT DEFAULT 'staff'");
  await pool.query("UPDATE staff_upload SET primary_role = 'staff' WHERE primary_role IS NULL OR trim(primary_role) = ''");
}

function normalizeHeader(value) {
  return (value || '').toString().trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getIndexByAliases(headers, aliases) {
  const normalizedHeaders = (headers || []).map(normalizeHeader);
  for (const alias of aliases) {
    const idx = normalizedHeaders.indexOf(normalizeHeader(alias));
    if (idx >= 0) return idx;
  }
  return -1;
}

// Dropdown: Get all staff for dropdown
router.get('/dropdown', async (req, res) => {
  console.log('[DEBUG] /api/staff_upload/dropdown called');
  try {
    await ensureStaffSchema();
    const result = await pool.query("SELECT id, code, last_name, first_name FROM staff_upload WHERE COALESCE(status, 'Current') = 'Current' ORDER BY last_name, first_name");
    console.log('[DEBUG] Staff rows:', result.rows);
    res.json({ staff: result.rows });
  } catch (err) {
    console.error('[DEBUG] Error fetching staff:', err);
    res.status(500).json({ error: 'Failed to fetch staff list.' });
  }
});

// Get all staff_upload rows
router.get('/all', async (req, res) => {
  try {
    await ensureStaffSchema();
    const result = await pool.query('SELECT * FROM staff_upload');
    res.json({ staff: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch staff_upload data.' });
  }
});

// Handle staff CSV upload
router.post('/', async (req, res) => {
  await ensureStaffSchema();
  const staff = req.body.staff;
  const headers = Array.isArray(req.body.headers) ? req.body.headers : [];
  if (!Array.isArray(staff) || staff.length === 0) {
    return res.json({ success: false, error: 'No staff data provided.' });
  }

  const codeIdx = getIndexByAliases(headers, ['code', 'staff_code', 'staff code']);
  const lastNameIdx = getIndexByAliases(headers, ['last_name', 'last name', 'surname', 'family_name']);
  const firstNameIdx = getIndexByAliases(headers, ['first_name', 'first name', 'given_name', 'forename']);
  const titleIdx = getIndexByAliases(headers, ['title']);
  const emailIdx = getIndexByAliases(headers, ['email_school', 'email school', 'email', 'school_email', 'email_address', 'email address']);

  // If headers are missing or unrecognized, keep legacy positional mapping.
  const useHeaderMapping = headers.length > 0 && emailIdx >= 0;

  // Keep only rows with email_school and deduplicate by normalized email.
  const byEmail = new Map();
  let skippedNoEmail = 0;
  for (const row of staff) {
    if (!Array.isArray(row)) continue;
    const code = (useHeaderMapping && codeIdx >= 0 ? row[codeIdx] : row[0] || '').toString().trim();
    const lastName = (useHeaderMapping && lastNameIdx >= 0 ? row[lastNameIdx] : row[1] || '').toString().trim();
    const firstName = (useHeaderMapping && firstNameIdx >= 0 ? row[firstNameIdx] : row[2] || '').toString().trim();
    const title = (useHeaderMapping && titleIdx >= 0 ? row[titleIdx] : row[3] || '').toString().trim();
    const email = (useHeaderMapping && emailIdx >= 0 ? row[emailIdx] : row[4] || '').toString().trim();
    if (!email) {
      skippedNoEmail++;
      continue;
    }
    byEmail.set(email.toLowerCase(), {
      code,
      lastName,
      firstName,
      title,
      email
    });
  }

  const dedupedRows = Array.from(byEmail.values());
  const duplicateEmailsInUpload = Math.max(0, staff.length - skippedNoEmail - dedupedRows.length);

  if (dedupedRows.length === 0) {
    return res.json({ success: false, error: 'No valid staff rows with email_school were found.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Reset all to Not Current first; listed rows below are set back to Current.
    await client.query("UPDATE staff_upload SET status = 'Not Current'");

    let inserted = 0;
    let updated = 0;

    for (const row of dedupedRows) {
      const updateResult = await client.query(
        `UPDATE staff_upload
         SET code = $1, last_name = $2, first_name = $3, title = $4, email_school = $5, status = 'Current', primary_role = 'staff'
         WHERE lower(trim(email_school)) = lower(trim($5))`,
        [row.code, row.lastName, row.firstName, row.title, row.email]
      );

      if (updateResult.rowCount > 0) {
        updated += updateResult.rowCount;
      } else {
        await client.query(
          'INSERT INTO staff_upload (code, last_name, first_name, title, email_school, status, primary_role) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [row.code, row.lastName, row.firstName, row.title, row.email, 'Current', 'staff']
        );
        inserted++;
      }
    }

    const inactiveResult = await client.query("SELECT COUNT(*)::int AS count FROM staff_upload WHERE status = 'Not Current'");
    const markedNotCurrent = inactiveResult.rows[0]?.count || 0;

    await client.query('COMMIT');
    res.json({
      success: true,
      inserted,
      updated,
      marked_not_current: markedNotCurrent,
      skipped_no_email: skippedNoEmail,
      duplicate_emails_in_upload: duplicateEmailsInUpload,
      processed: dedupedRows.length
    });
  } catch (err) {
    await client.query('ROLLBACK');
    // Auto-recover from PK sequence mismatch and retry once.
    if (err.code === '23505' && err.constraint === 'staff_upload_pkey') {
      try {
        await pool.query(`SELECT setval(pg_get_serial_sequence('staff_upload','id'), COALESCE((SELECT MAX(id) FROM staff_upload), 0))`);
        return res.json({ success: false, error: 'Sequence was out of sync and has been reset. Please upload again.' });
      } catch (_) {}
    }
    res.json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const pool = require('../db');

const TIMETABLE_COLUMNS = [
  'Teacher', 'Teacher_Name', 'Form_Class',
  'D1_P1_1', 'D1_P1_2', 'D1_P2', 'D1_I', 'D1_P3', 'D1_P4', 'D1_L', 'D1_P5', 'D1_blank_1', 'D1_blank_2',
  'D2_P1_1', 'D2_P1_2', 'D2_P2', 'D2_I', 'D2_P3', 'D2_P4', 'D2_L', 'D2_P5', 'D2_blank_1', 'D2_blank_2',
  'D3_P1_1', 'D3_P1_2', 'D3_P2', 'D3_I', 'D3_P3', 'D3_P4', 'D3_L', 'D3_P5', 'D3_blank_1', 'D3_blank_2',
  'D4_P1_1', 'D4_P1_2', 'D4_P2', 'D4_I', 'D4_P3', 'D4_P4', 'D4_L', 'D4_P5', 'D4_blank_1', 'D4_blank_2',
  'D5_P1_1', 'D5_P1_2', 'D5_P2', 'D5_I', 'D5_P3', 'D5_P4', 'D5_L', 'D5_P5', 'D5_blank_1', 'D5_blank_2'
];

function normalizeHeader(value) {
  return (value || '').toString().trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function buildHeaderIndexMap(headers) {
  const normalizedHeaders = (headers || []).map(normalizeHeader);
  const indexMap = {};
  for (const col of TIMETABLE_COLUMNS) {
    const idx = normalizedHeaders.indexOf(normalizeHeader(col));
    if (idx >= 0) indexMap[col] = idx;
  }
  return indexMap;
}

// POST /api/upload_timetable
router.post('/', async (req, res) => {
  const { timetable, headers = [] } = req.body;
  if (!Array.isArray(timetable) || timetable.length === 0) {
    return res.status(400).json({ success: false, error: 'No timetable data provided.' });
  }

  const headerIndex = buildHeaderIndexMap(headers);
  const useHeaderMapping = Array.isArray(headers) && headers.length > 0 && headerIndex.Teacher !== undefined;

  const byTeacher = new Map();
  let skippedNoTeacher = 0;
  for (const row of timetable) {
    if (!Array.isArray(row)) continue;
    const mapped = {};
    for (let i = 0; i < TIMETABLE_COLUMNS.length; i++) {
      const col = TIMETABLE_COLUMNS[i];
      const idx = useHeaderMapping && headerIndex[col] !== undefined ? headerIndex[col] : i;
      mapped[col] = (row[idx] || '').toString().trim();
    }
    if (!mapped.Teacher) {
      skippedNoTeacher++;
      continue;
    }
    byTeacher.set(mapped.Teacher.toUpperCase(), mapped);
  }

  const rows = Array.from(byTeacher.values());
  const duplicateTeachersInUpload = Math.max(0, timetable.length - skippedNoTeacher - rows.length);
  if (rows.length === 0) {
    return res.status(400).json({ success: false, error: 'No valid rows with Teacher were found.' });
  }

  const quotedColumns = TIMETABLE_COLUMNS.map(c => `"${c}"`);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query("ALTER TABLE kamar_timetable ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Current'");
    await client.query("UPDATE kamar_timetable SET status = 'Current' WHERE status IS NULL");

    await client.query("UPDATE kamar_timetable SET status = 'Not Current'");

    let inserted = 0;
    let updated = 0;
    const setClause = TIMETABLE_COLUMNS.filter(c => c !== 'Teacher').map((c, i) => `"${c}" = $${i + 1}`).join(', ');
    const updateSql = `UPDATE kamar_timetable SET ${setClause}, status = 'Current' WHERE upper(trim("Teacher")) = upper(trim($${TIMETABLE_COLUMNS.length}))`;
    const insertSql = `INSERT INTO kamar_timetable (${quotedColumns.join(', ')}, status) VALUES (${TIMETABLE_COLUMNS.map((_, i) => `$${i + 1}`).join(', ')}, 'Current')`;

    for (const row of rows) {
      const updateValues = TIMETABLE_COLUMNS.filter(c => c !== 'Teacher').map(c => row[c]);
      updateValues.push(row.Teacher);
      const updateResult = await client.query(updateSql, updateValues);
      if (updateResult.rowCount > 0) {
        updated += updateResult.rowCount;
      } else {
        const insertValues = TIMETABLE_COLUMNS.map(c => row[c]);
        await client.query(insertSql, insertValues);
        inserted++;
      }
    }

    const inactiveResult = await client.query("SELECT COUNT(*)::int AS count FROM kamar_timetable WHERE status = 'Not Current'");
    const markedNotCurrent = inactiveResult.rows[0]?.count || 0;

    await client.query('COMMIT');
    return res.json({
      success: true,
      inserted,
      updated,
      marked_not_current: markedNotCurrent,
      skipped_no_teacher: skippedNoTeacher,
      duplicate_teachers_in_upload: duplicateTeachersInUpload,
      processed: rows.length
    });
  } catch (err) {
    await client.query('ROLLBACK');
    return res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;

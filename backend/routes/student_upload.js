const express = require('express');
const router = express.Router();
const pool = require('../db');

const STUDENT_COLUMNS = [
  'student_name', 'id_number', 'form_class', 'year_level',
  'mon_p1_1', 'mon_p1_2', 'mon_p2', 'mon_i', 'mon_p3', 'mon_p4', 'mon_l', 'mon_p5',
  'tue_p1_1', 'tue_p1_2', 'tue_p2', 'tue_i', 'tue_p3', 'tue_p4', 'tue_l', 'tue_p5',
  'wed_p1_1', 'wed_p1_2', 'wed_p2', 'wed_i', 'wed_p3', 'wed_p4', 'wed_l', 'wed_p5',
  'thu_p1_1', 'thu_p1_2', 'thu_p2', 'thu_i', 'thu_p3', 'thu_p4', 'thu_l', 'thu_p5',
  'fri_p1_1', 'fri_p1_2', 'fri_p2', 'fri_i', 'fri_p3', 'fri_p4', 'fri_l', 'fri_p5'
];

const PERIOD_COLUMNS = STUDENT_COLUMNS.slice(4);

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_timetable (
      id SERIAL PRIMARY KEY,
      student_name TEXT,
      id_number TEXT,
      form_class TEXT,
      year_level TEXT,
      mon_p1_1 TEXT,
      mon_p1_2 TEXT,
      mon_p2 TEXT,
      mon_i TEXT,
      mon_p3 TEXT,
      mon_p4 TEXT,
      mon_l TEXT,
      mon_p5 TEXT,
      tue_p1_1 TEXT,
      tue_p1_2 TEXT,
      tue_p2 TEXT,
      tue_i TEXT,
      tue_p3 TEXT,
      tue_p4 TEXT,
      tue_l TEXT,
      tue_p5 TEXT,
      wed_p1_1 TEXT,
      wed_p1_2 TEXT,
      wed_p2 TEXT,
      wed_i TEXT,
      wed_p3 TEXT,
      wed_p4 TEXT,
      wed_l TEXT,
      wed_p5 TEXT,
      thu_p1_1 TEXT,
      thu_p1_2 TEXT,
      thu_p2 TEXT,
      thu_i TEXT,
      thu_p3 TEXT,
      thu_p4 TEXT,
      thu_l TEXT,
      thu_p5 TEXT,
      fri_p1_1 TEXT,
      fri_p1_2 TEXT,
      fri_p2 TEXT,
      fri_i TEXT,
      fri_p3 TEXT,
      fri_p4 TEXT,
      fri_l TEXT,
      fri_p5 TEXT,
      status TEXT DEFAULT 'Current'
    )
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS student_timetable_id_number_unique_idx
    ON student_timetable (lower(trim(id_number)))
    WHERE id_number IS NOT NULL AND trim(id_number) <> ''
  `);

  await pool.query("ALTER TABLE student_timetable ADD COLUMN IF NOT EXISTS primary_role TEXT DEFAULT 'student'");
  await pool.query("UPDATE student_timetable SET primary_role = 'student' WHERE primary_role IS NULL OR trim(primary_role) = ''");
}

function normalizeCsvHeader(value) {
  return (value || '').toString().trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getIndexByAliases(headers, aliases) {
  const normalizedHeaders = (headers || []).map(normalizeCsvHeader);
  for (const alias of aliases) {
    const idx = normalizedHeaders.indexOf(normalizeCsvHeader(alias));
    if (idx >= 0) return idx;
  }
  return -1;
}

function mapRowToRecord(row, headers) {
  const hasHeaders = Array.isArray(headers) && headers.length > 0;

  // Prefer header mapping for core fields, fallback to positional for Kamar exports.
  const idxStudentName = hasHeaders ? getIndexByAliases(headers, ['Student Name', 'student_name']) : 0;
  const idxIdNumber = hasHeaders ? getIndexByAliases(headers, ['ID Number', 'id_number']) : 1;
  const idxFormClass = hasHeaders ? getIndexByAliases(headers, ['Form Class', 'form_class']) : 2;
  const idxYearLevel = hasHeaders ? getIndexByAliases(headers, ['Year Level', 'year_level']) : 3;

  const record = {
    student_name: (row[idxStudentName >= 0 ? idxStudentName : 0] || '').toString().trim(),
    id_number: (row[idxIdNumber >= 0 ? idxIdNumber : 1] || '').toString().trim(),
    form_class: (row[idxFormClass >= 0 ? idxFormClass : 2] || '').toString().trim(),
    year_level: (row[idxYearLevel >= 0 ? idxYearLevel : 3] || '').toString().trim()
  };

  // Timetable periods are positionally stable in Kamar export.
  const start = 4;
  for (let i = 0; i < 40; i++) {
    record[STUDENT_COLUMNS[start + i]] = (row[start + i] || '').toString().trim();
  }

  return record;
}

router.get('/all', async (req, res) => {
  try {
    await ensureSchema();
    const result = await pool.query('SELECT * FROM student_timetable ORDER BY student_name, id_number');
    res.json({ students: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch student timetable data.' });
  }
});

router.get('/by-class/:ttcode', async (req, res) => {
  const ttcode = (req.params.ttcode || '').trim();
  if (!ttcode) return res.json({ students: [] });

  try {
    await ensureSchema();
    const whereClause = PERIOD_COLUMNS.map((col, i) => `upper(COALESCE(${col}, '')) LIKE '%' || upper($${i + 1}) || '%'`).join(' OR ');
    const values = PERIOD_COLUMNS.map(() => ttcode);

    const result = await pool.query(
      `SELECT id, student_name, id_number, form_class, year_level
       FROM student_timetable
       WHERE COALESCE(status, 'Current') = 'Current'
         AND (${whereClause})
       ORDER BY student_name, id_number`,
      values
    );
    res.json({ students: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch students for class.' });
  }
});

router.post('/', async (req, res) => {
  const { students, headers = [] } = req.body;
  if (!Array.isArray(students) || students.length === 0) {
    return res.status(400).json({ success: false, error: 'No student data provided.' });
  }

  try {
    await ensureSchema();
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }

  const byIdNumber = new Map();
  let skippedNoId = 0;
  for (const row of students) {
    if (!Array.isArray(row)) continue;
    const mapped = mapRowToRecord(row, headers);
    if (!mapped.id_number) {
      skippedNoId++;
      continue;
    }
    byIdNumber.set(mapped.id_number.toLowerCase(), mapped);
  }

  const dedupedRows = Array.from(byIdNumber.values());
  const duplicateIdsInUpload = Math.max(0, students.length - skippedNoId - dedupedRows.length);
  if (dedupedRows.length === 0) {
    return res.status(400).json({ success: false, error: 'No valid rows with ID Number were found.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("UPDATE student_timetable SET status = 'Not Current'");

    let inserted = 0;
    let updated = 0;

    const updateSql = `
      UPDATE student_timetable
      SET student_name = $1,
          form_class = $2,
          year_level = $3,
          mon_p1_1 = $4,
          mon_p1_2 = $5,
          mon_p2 = $6,
          mon_i = $7,
          mon_p3 = $8,
          mon_p4 = $9,
          mon_l = $10,
          mon_p5 = $11,
          tue_p1_1 = $12,
          tue_p1_2 = $13,
          tue_p2 = $14,
          tue_i = $15,
          tue_p3 = $16,
          tue_p4 = $17,
          tue_l = $18,
          tue_p5 = $19,
          wed_p1_1 = $20,
          wed_p1_2 = $21,
          wed_p2 = $22,
          wed_i = $23,
          wed_p3 = $24,
          wed_p4 = $25,
          wed_l = $26,
          wed_p5 = $27,
          thu_p1_1 = $28,
          thu_p1_2 = $29,
          thu_p2 = $30,
          thu_i = $31,
          thu_p3 = $32,
          thu_p4 = $33,
          thu_l = $34,
          thu_p5 = $35,
          fri_p1_1 = $36,
          fri_p1_2 = $37,
          fri_p2 = $38,
          fri_i = $39,
          fri_p3 = $40,
          fri_p4 = $41,
          fri_l = $42,
          fri_p5 = $43,
          status = 'Current',
          primary_role = 'student'
      WHERE lower(trim(id_number)) = lower(trim($44))
    `;

    const insertSql = `
      INSERT INTO student_timetable (
        student_name, id_number, form_class, year_level,
        mon_p1_1, mon_p1_2, mon_p2, mon_i, mon_p3, mon_p4, mon_l, mon_p5,
        tue_p1_1, tue_p1_2, tue_p2, tue_i, tue_p3, tue_p4, tue_l, tue_p5,
        wed_p1_1, wed_p1_2, wed_p2, wed_i, wed_p3, wed_p4, wed_l, wed_p5,
        thu_p1_1, thu_p1_2, thu_p2, thu_i, thu_p3, thu_p4, thu_l, thu_p5,
        fri_p1_1, fri_p1_2, fri_p2, fri_i, fri_p3, fri_p4, fri_l, fri_p5,
        status, primary_role
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8, $9, $10, $11, $12,
        $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24, $25, $26, $27, $28,
        $29, $30, $31, $32, $33, $34, $35, $36,
        $37, $38, $39, $40, $41, $42, $43, $44,
        'Current', 'student'
      )
    `;

    for (const row of dedupedRows) {
      const values = [
        row.student_name,
        row.form_class,
        row.year_level,
        row.mon_p1_1,
        row.mon_p1_2,
        row.mon_p2,
        row.mon_i,
        row.mon_p3,
        row.mon_p4,
        row.mon_l,
        row.mon_p5,
        row.tue_p1_1,
        row.tue_p1_2,
        row.tue_p2,
        row.tue_i,
        row.tue_p3,
        row.tue_p4,
        row.tue_l,
        row.tue_p5,
        row.wed_p1_1,
        row.wed_p1_2,
        row.wed_p2,
        row.wed_i,
        row.wed_p3,
        row.wed_p4,
        row.wed_l,
        row.wed_p5,
        row.thu_p1_1,
        row.thu_p1_2,
        row.thu_p2,
        row.thu_i,
        row.thu_p3,
        row.thu_p4,
        row.thu_l,
        row.thu_p5,
        row.fri_p1_1,
        row.fri_p1_2,
        row.fri_p2,
        row.fri_i,
        row.fri_p3,
        row.fri_p4,
        row.fri_l,
        row.fri_p5,
        row.id_number
      ];

      const updateResult = await client.query(updateSql, values);
      if (updateResult.rowCount > 0) {
        updated += updateResult.rowCount;
      } else {
        await client.query(insertSql, [
          row.student_name,
          row.id_number,
          row.form_class,
          row.year_level,
          row.mon_p1_1,
          row.mon_p1_2,
          row.mon_p2,
          row.mon_i,
          row.mon_p3,
          row.mon_p4,
          row.mon_l,
          row.mon_p5,
          row.tue_p1_1,
          row.tue_p1_2,
          row.tue_p2,
          row.tue_i,
          row.tue_p3,
          row.tue_p4,
          row.tue_l,
          row.tue_p5,
          row.wed_p1_1,
          row.wed_p1_2,
          row.wed_p2,
          row.wed_i,
          row.wed_p3,
          row.wed_p4,
          row.wed_l,
          row.wed_p5,
          row.thu_p1_1,
          row.thu_p1_2,
          row.thu_p2,
          row.thu_i,
          row.thu_p3,
          row.thu_p4,
          row.thu_l,
          row.thu_p5,
          row.fri_p1_1,
          row.fri_p1_2,
          row.fri_p2,
          row.fri_i,
          row.fri_p3,
          row.fri_p4,
          row.fri_l,
          row.fri_p5
        ]);
        inserted++;
      }
    }

    const inactiveResult = await client.query("SELECT COUNT(*)::int AS count FROM student_timetable WHERE status = 'Not Current'");
    const markedNotCurrent = inactiveResult.rows[0]?.count || 0;

    await client.query('COMMIT');
    res.json({
      success: true,
      inserted,
      updated,
      marked_not_current: markedNotCurrent,
      skipped_no_id_number: skippedNoId,
      duplicate_id_numbers_in_upload: duplicateIdsInUpload,
      processed: dedupedRows.length
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const pool = require('../db');

const DEFAULT_ROLE_OPTIONS = [
  'admin',
  'teacher',
  'technician',
  'student',
  'public_access'
];

const WEEKDAY_MAP = [
  { day: 'Monday', key: 'D1' },
  { day: 'Tuesday', key: 'D2' },
  { day: 'Wednesday', key: 'D3' },
  { day: 'Thursday', key: 'D4' },
  { day: 'Friday', key: 'D5' }
];

const STUDENT_WEEK_MAP = [
  { day: 'Monday', key: 'mon' },
  { day: 'Tuesday', key: 'tue' },
  { day: 'Wednesday', key: 'wed' },
  { day: 'Thursday', key: 'thu' },
  { day: 'Friday', key: 'fri' }
];

function buildWeeklyTimetable(row) {
  if (!row) return [];
  return WEEKDAY_MAP.map(({ day, key }) => {
    const p1 = [row[`${key}_P1_1`], row[`${key}_P1_2`]].map(v => (v || '').toString().trim()).filter(Boolean);
    const p2 = (row[`${key}_P2`] || '').toString().trim();
    const p3 = (row[`${key}_P3`] || '').toString().trim();
    const p4 = (row[`${key}_P4`] || '').toString().trim();
    const p5 = (row[`${key}_P5`] || '').toString().trim();
    return {
      day,
      periods: {
        P1: p1,
        P2: p2 ? [p2] : [],
        P3: p3 ? [p3] : [],
        P4: p4 ? [p4] : [],
        P5: p5 ? [p5] : []
      }
    };
  });
}

function buildStudentWeeklyTimetable(row) {
  if (!row) return [];
  return STUDENT_WEEK_MAP.map(({ day, key }) => {
    const p1 = [row[`${key}_p1_1`], row[`${key}_p1_2`]].map(v => (v || '').toString().trim()).filter(Boolean);
    const p2 = (row[`${key}_p2`] || '').toString().trim();
    const p3 = (row[`${key}_p3`] || '').toString().trim();
    const p4 = (row[`${key}_p4`] || '').toString().trim();
    const p5 = (row[`${key}_p5`] || '').toString().trim();
    return {
      day,
      periods: {
        P1: p1,
        P2: p2 ? [p2] : [],
        P3: p3 ? [p3] : [],
        P4: p4 ? [p4] : [],
        P5: p5 ? [p5] : []
      }
    };
  });
}

function normalizeUserType(userType) {
  return String(userType || 'staff').trim().toLowerCase() === 'student' ? 'student' : 'staff';
}

const schemaReady = (async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_additional_roles (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL,
        user_type TEXT DEFAULT 'staff',
        role_name VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (email, role_name)
      )
    `);
    await pool.query("ALTER TABLE user_additional_roles ADD COLUMN IF NOT EXISTS user_type TEXT DEFAULT 'staff'");
    await pool.query("UPDATE user_additional_roles SET user_type = 'staff' WHERE user_type IS NULL OR trim(user_type) = ''");

    await pool.query("ALTER TABLE staff_upload ADD COLUMN IF NOT EXISTS primary_role TEXT DEFAULT 'staff'");
    await pool.query("UPDATE staff_upload SET primary_role = 'staff' WHERE primary_role IS NULL OR trim(primary_role) = ''");

    await pool.query("ALTER TABLE student_timetable ADD COLUMN IF NOT EXISTS primary_role TEXT DEFAULT 'student'");
    await pool.query("UPDATE student_timetable SET primary_role = 'student' WHERE primary_role IS NULL OR trim(primary_role) = ''");

    console.log('[USER ROLES] Schema ready');
  } catch (err) {
    console.error('[USER ROLES] Schema initialization error:', err);
    throw err;
  }
})();

router.get('/options', async (req, res) => {
  try {
    await schemaReady;
    const userType = normalizeUserType(req.query.userType);

    let users = [];
    if (userType === 'student') {
      const studentResult = await pool.query(`
        SELECT id_number, student_name
        FROM (
          SELECT DISTINCT id_number, student_name
          FROM student_timetable
          WHERE COALESCE(status, 'Current') = 'Current'
            AND id_number IS NOT NULL
            AND trim(id_number) <> ''
        ) students
        ORDER BY lower(COALESCE(student_name, '')), lower(id_number)
      `);
      users = studentResult.rows.map(r => ({
        value: r.id_number,
        label: `${(r.student_name || '').trim() || 'Student'} (${r.id_number})`
      }));
    } else {
      const usersResult = await pool.query(`
        SELECT email
        FROM (
          SELECT DISTINCT email_school AS email
          FROM staff_upload
          WHERE COALESCE(status, 'Current') = 'Current'
            AND email_school IS NOT NULL
            AND trim(email_school) <> ''
        ) users
        ORDER BY lower(email), email
      `);
      users = usersResult.rows.map(r => ({ value: r.email, label: r.email }));
    }

    let roles = [];
    try {
      const rolesResult = await pool.query(`
        SELECT role_name
        FROM role_permissions
        ORDER BY CASE
          WHEN role_name = 'admin' THEN 1
          WHEN role_name = 'teacher' THEN 2
          WHEN role_name = 'technician' THEN 3
          WHEN role_name = 'student' THEN 4
          WHEN role_name = 'public_access' THEN 5
          ELSE 99
        END
      `);
      roles = rolesResult.rows;
    } catch (roleErr) {
      console.warn('[USER ROLES] role_permissions unavailable, using defaults:', roleErr.message);
    }

    if (!roles.length) {
      roles = DEFAULT_ROLE_OPTIONS.map(role_name => ({ role_name }));
    }

    res.json({
      success: true,
      userType,
      users,
      roles
    });
  } catch (err) {
    console.error('[USER ROLES] Error fetching options:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/all', async (req, res) => {
  try {
    await schemaReady;

    const result = await pool.query(`
      SELECT email, user_type, role_name
      FROM user_additional_roles
      ORDER BY user_type, email, role_name
    `);

    const studentNames = new Map();
    const studentResult = await pool.query(`
      SELECT DISTINCT id_number, student_name
      FROM student_timetable
      WHERE COALESCE(status, 'Current') = 'Current'
        AND id_number IS NOT NULL
        AND trim(id_number) <> ''
    `);
    studentResult.rows.forEach(r => {
      studentNames.set(String(r.id_number || '').trim().toLowerCase(), r.student_name || 'Student');
    });

    const byUser = new Map();
    for (const row of result.rows) {
      const userType = normalizeUserType(row.user_type);
      const identifier = String(row.email || '').trim();
      const key = `${userType}:${identifier.toLowerCase()}`;
      if (!byUser.has(key)) {
        let label = identifier;
        if (userType === 'student') {
          const name = studentNames.get(identifier.toLowerCase()) || 'Student';
          label = `${name} (${identifier})`;
        }
        byUser.set(key, {
          user_type: userType,
          user_identifier: identifier,
          user_label: label,
          roles: []
        });
      }
      byUser.get(key).roles.push(row.role_name);
    }

    const users = Array.from(byUser.values());
    res.json({ success: true, users });
  } catch (err) {
    console.error('[USER ROLES] Error fetching assignments:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/profile', async (req, res) => {
  const userType = normalizeUserType(req.query.userType);
  const identifier = String(req.query.identifier || req.query.email || '').trim();
  if (!identifier) {
    return res.status(400).json({ success: false, error: 'User identifier is required.' });
  }

  try {
    await schemaReady;

    if (userType === 'student') {
      const studentResult = await pool.query(
        `SELECT id_number, student_name, form_class, year_level, status,
                mon_p1_1, mon_p1_2, mon_p2, mon_p3, mon_p4, mon_p5,
                tue_p1_1, tue_p1_2, tue_p2, tue_p3, tue_p4, tue_p5,
                wed_p1_1, wed_p1_2, wed_p2, wed_p3, wed_p4, wed_p5,
                thu_p1_1, thu_p1_2, thu_p2, thu_p3, thu_p4, thu_p5,
                fri_p1_1, fri_p1_2, fri_p2, fri_p3, fri_p4, fri_p5
         FROM student_timetable
         WHERE lower(trim(id_number)) = lower(trim($1))
         LIMIT 1`,
        [identifier]
      );

      if (!studentResult.rows.length) {
        return res.json({
          success: true,
          userType,
          identifier,
          isStudent: false,
          message: 'No student profile found for this ID.'
        });
      }

      const student = studentResult.rows[0];
      return res.json({
        success: true,
        userType,
        identifier,
        isStudent: true,
        student: {
          id_number: student.id_number || '',
          student_name: student.student_name || '',
          form_class: student.form_class || '',
          year_level: student.year_level || '',
          status: student.status || 'Current'
        },
        timetable: {
          week: buildStudentWeeklyTimetable(student)
        }
      });
    }

    const email = identifier.toLowerCase();

    const staffResult = await pool.query(
      `SELECT id, code, first_name, last_name, title, email_school, status
       FROM staff_upload
       WHERE lower(trim(email_school)) = lower(trim($1))
       LIMIT 1`,
      [email]
    );

    if (!staffResult.rows.length) {
      return res.json({
        success: true,
        email,
        isStaff: false,
        message: 'No staff profile found for this email.'
      });
    }

    const staff = staffResult.rows[0];

    let department = null;
    if (staff.code) {
      const depByCode = await pool.query(
        `SELECT department, departments_comma, classes, staff_name
         FROM department
         WHERE lower(trim(code)) = lower(trim($1))
         LIMIT 1`,
        [staff.code]
      );
      if (depByCode.rows.length) {
        department = depByCode.rows[0];
      }
    }

    if (!department) {
      const depByName = await pool.query(
        `SELECT department, departments_comma, classes, staff_name
         FROM department
         WHERE lower(trim(last_name)) = lower(trim($1))
           AND lower(trim(first_name)) = lower(trim($2))
         LIMIT 1`,
        [staff.last_name || '', staff.first_name || '']
      );
      if (depByName.rows.length) {
        department = depByName.rows[0];
      }
    }

    const teacherCode = (staff.code || '').trim();
    const teacherNameGuess = `${(staff.last_name || '').trim()}, ${(staff.first_name || '').trim()}`.trim();
    const timetableResult = await pool.query(
      `SELECT *
       FROM kamar_timetable
       WHERE COALESCE(status, 'Current') = 'Current'
         AND (
           (trim($1) <> '' AND upper(trim("Teacher")) = upper(trim($1)))
           OR lower(trim("Teacher_Name")) = lower(trim($2))
         )
       LIMIT 1`,
      [teacherCode, teacherNameGuess]
    );

    const timetableRow = timetableResult.rows[0] || null;

    res.json({
      success: true,
      email,
      isStaff: true,
      staff: {
        code: staff.code || '',
        first_name: staff.first_name || '',
        last_name: staff.last_name || '',
        title: staff.title || '',
        email_school: staff.email_school || '',
        status: staff.status || 'Current'
      },
      department: department
        ? {
            primary: department.department || '',
            all: department.departments_comma || '',
            classes: department.classes || '',
            staff_name: department.staff_name || ''
          }
        : null,
      timetable: timetableRow
        ? {
            teacher_code: timetableRow.Teacher || teacherCode,
            teacher_name: timetableRow.Teacher_Name || teacherNameGuess,
            form_class: timetableRow.Form_Class || '',
            week: buildWeeklyTimetable(timetableRow)
          }
        : null
    });
  } catch (err) {
    console.error('[USER ROLES] Error fetching profile:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/add', async (req, res) => {
  const userType = normalizeUserType(req.body.user_type);
  const userIdentifier = (req.body.user_identifier || req.body.email || '').trim();
  const roleName = (req.body.role_name || '').trim().toLowerCase();

  if (!userIdentifier || !roleName) {
    return res.status(400).json({ success: false, error: 'User identifier and role_name are required.' });
  }

  try {
    await schemaReady;

    // Accept known defaults even if role_permissions has not been seeded yet.
    let isValidRole = DEFAULT_ROLE_OPTIONS.includes(roleName);
    if (!isValidRole) {
      const validRole = await pool.query('SELECT 1 FROM role_permissions WHERE role_name = $1 LIMIT 1', [roleName]);
      isValidRole = validRole.rowCount > 0;
    }

    if (!isValidRole) {
      return res.status(400).json({ success: false, error: 'Invalid role name.' });
    }

    if (userType === 'student') {
      const studentExists = await pool.query(
        `SELECT 1 FROM student_timetable
         WHERE COALESCE(status, 'Current') = 'Current'
           AND lower(trim(id_number)) = lower(trim($1))
         LIMIT 1`,
        [userIdentifier]
      );
      if (studentExists.rowCount === 0) {
        return res.status(400).json({ success: false, error: 'Student ID was not found.' });
      }
    } else {
      const staffExists = await pool.query(
        `SELECT 1 FROM staff_upload
         WHERE COALESCE(status, 'Current') = 'Current'
           AND lower(trim(email_school)) = lower(trim($1))
         LIMIT 1`,
        [userIdentifier]
      );
      if (staffExists.rowCount === 0) {
        return res.status(400).json({ success: false, error: 'Staff email was not found.' });
      }
    }

    const insertResult = await pool.query(`
      INSERT INTO user_additional_roles (email, user_type, role_name)
      VALUES ($1, $2, $3)
      ON CONFLICT (email, role_name) DO NOTHING
      RETURNING id
    `, [userIdentifier.toLowerCase(), userType, roleName]);

    if (insertResult.rowCount === 0) {
      return res.json({ success: true, message: `${userIdentifier} already has role ${roleName}`, alreadyExists: true });
    }

    res.json({ success: true, message: `Added role ${roleName} to ${userIdentifier}` });
  } catch (err) {
    console.error('[USER ROLES] Error adding assignment:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:userType/:identifier', async (req, res) => {
  const userType = normalizeUserType(req.params.userType);
  const identifier = decodeURIComponent(req.params.identifier || '').trim().toLowerCase();

  if (!identifier) {
    return res.status(400).json({ success: false, error: 'User identifier is required.' });
  }

  try {
    await schemaReady;
    await pool.query('DELETE FROM user_additional_roles WHERE user_type = $1 AND lower(trim(email)) = lower(trim($2))', [userType, identifier]);
    res.json({ success: true, message: `Removed additional roles for ${identifier}` });
  } catch (err) {
    console.error('[USER ROLES] Error deleting assignments:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:email', async (req, res) => {
  const email = decodeURIComponent(req.params.email || '').trim().toLowerCase();

  if (!email) {
    return res.status(400).json({ success: false, error: 'Email is required.' });
  }

  try {
    await schemaReady;
    await pool.query('DELETE FROM user_additional_roles WHERE email = $1', [email]);
    res.json({ success: true, message: `Removed additional roles for ${email}` });
  } catch (err) {
    console.error('[USER ROLES] Error deleting assignments:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
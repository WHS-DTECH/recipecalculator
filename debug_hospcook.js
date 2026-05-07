const pool = require('./backend/db.js');

(async () => {
  try {
    // Check if HOSPCOOK student data exists
    console.log('=== HOSPCOOK in student_timetable ===');
    let res = await pool.query(`
      SELECT DISTINCT mon_p1_1, mon_p1_2, mon_p2, mon_p3, tue_p1_1, tue_p1_2, tue_p2, tue_p3
      FROM student_timetable 
      WHERE status='Current' 
      AND (mon_p1_1 LIKE $1 OR mon_p1_2 LIKE $1 OR mon_p2 LIKE $1 OR mon_p3 LIKE $1 
           OR tue_p1_1 LIKE $1 OR tue_p1_2 LIKE $1 OR tue_p2 LIKE $1 OR tue_p3 LIKE $1)
      LIMIT 5
    `, ['%HOSP%']);
    console.log('Found rows:', res.rows.length);
    if (res.rows.length) console.log(res.rows[0]);

    // Check HOSPCOOK bookings status
    console.log('\n=== HOSPCOOK bookings ===');
    res = await pool.query(`
      SELECT COUNT(*) as total, SUM(CASE WHEN class_size IS NULL THEN 1 ELSE 0 END) as null_count
      FROM bookings 
      WHERE class_name LIKE $1
    `, ['%HOSP%']);
    console.log('Total:', res.rows[0].total, '| Null class_size:', res.rows[0].null_count);

    // Check a sample HOSPCOOK booking
    console.log('\n=== Sample HOSPCOOK bookings ===');
    res = await pool.query(`
      SELECT class_name, teacher_name, booking_date, class_size, id FROM bookings 
      WHERE class_name LIKE $1 
      LIMIT 3
    `, ['%HOSP%']);
    res.rows.forEach(r => console.log(r));

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    await pool.end();
    process.exit(1);
  }
})();

const db = require('../backend/db');
(async () => {
  try {
    const sql = "SELECT id, class_name, booking_date, recipe, recipe_url, planner_stream, source_document_title FROM bookings WHERE period='Planner' AND lower(class_name)=lower('13HOSP') AND lower(recipe) LIKE lower('%korean%') ORDER BY booking_date DESC, id DESC";
    const r = await db.query(sql);
    console.log(JSON.stringify(r.rows, null, 2));
  } catch (e) {
    console.error(e.message);
  } finally {
    process.exit(0);
  }
})();


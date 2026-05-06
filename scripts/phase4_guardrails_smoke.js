const pool = require('../backend/db');

const BASE_URL = process.env.PHASE4_BASE_URL || 'http://127.0.0.1:5055';
const ADMIN_EMAIL = process.env.PHASE4_ADMIN_EMAIL || 'test.admin@local';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function nextFridayIso() {
  const d = new Date();
  const day = d.getUTCDay();
  const add = day <= 5 ? 5 - day : 12 - day;
  d.setUTCDate(d.getUTCDate() + add);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dayStr = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dayStr}`;
}

async function api(path, options = {}) {
  const headers = {
    'x-user-email': ADMIN_EMAIL,
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {})
  };

  const resp = await fetch(`${BASE_URL}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const payload = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, payload };
}

(async function run() {
  const temp = {
    recipeIds: [],
    bookingIds: [],
    planIds: []
  };

  try {
    const stamp = Date.now();

    // Seed minimal recipes and bookings + desired_servings rows for deterministic guardrail tests.
    const r1 = await pool.query(
      `INSERT INTO recipes (name, description, ingredients, serving_size, url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [`Phase4 Smoke Recipe A ${stamp}`, 'phase4 smoke', 'sugar', null, 'https://example.com/a']
    );
    const r2 = await pool.query(
      `INSERT INTO recipes (name, description, ingredients, serving_size, url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [`Phase4 Smoke Recipe B ${stamp}`, 'phase4 smoke', 'sugar', 8, 'https://example.com/b']
    );

    const recipeIdA = Number(r1.rows[0].id);
    const recipeIdB = Number(r2.rows[0].id);
    temp.recipeIds.push(recipeIdA, recipeIdB);

    const friday = nextFridayIso();

    const b1 = await pool.query(
      `INSERT INTO bookings (staff_name, class_name, booking_date, period, recipe, recipe_id, class_size, planner_stream)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id`,
      ['Phase4 Teacher', `PH4-A-${stamp}`, friday, 'P1', 'Phase4 Smoke Recipe A', recipeIdA, 20, 'Middle']
    );
    const b2 = await pool.query(
      `INSERT INTO bookings (staff_name, class_name, booking_date, period, recipe, recipe_id, class_size, planner_stream)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id`,
      ['Phase4 Teacher', `PH4-B-${stamp}`, friday, 'P2', 'Phase4 Smoke Recipe B', recipeIdB, 20, 'Middle']
    );

    const bookingId1 = Number(b1.rows[0].id);
    const bookingId2 = Number(b2.rows[0].id);
    temp.bookingIds.push(bookingId1, bookingId2);

    await pool.query(
      `INSERT INTO desired_servings_ingredients (booking_id, ingredient_name, fooditem, stripfooditem, measure_qty, measure_unit, calculated_qty)
       VALUES
       ($1, 'Sugar', 'Sugar', 'Sugar', 1, 'tbsp', 1),
       ($2, 'Sugar', 'Sugar', 'Sugar', 2, 'tsp', 2),
       ($1, 'Flour', 'Flour', 'Flour', 1, 'kg', 1),
       ($2, 'Flour', 'Flour', 'Flour', 500, 'g', 500)`,
      [bookingId1, bookingId2]
    );

    // 1) Generate draft and verify canonical conversions merged totals.
    const create = await api('/api/shopping-plan/create', {
      method: 'POST',
      body: {
        week_ending: friday,
        booking_ids: [bookingId1, bookingId2],
        notes: 'Phase4 smoke'
      }
    });
    assert(create.ok && create.payload.plan && create.payload.plan.id, 'Failed to create shopping plan');

    const planId = Number(create.payload.plan.id);
    temp.planIds.push(planId);

    const gen = await api(`/api/shopping-plan/${planId}/generate-draft`, { method: 'POST' });
    assert(gen.ok, `Generate draft failed: ${JSON.stringify(gen.payload)}`);

    const getPlan = await api(`/api/shopping-plan/${planId}`);
    assert(getPlan.ok, 'Failed to fetch generated plan');

    const items = Array.isArray(getPlan.payload.items) ? getPlan.payload.items : [];
    const sugar = items.find((i) => String(i.item_name || '').toLowerCase() === 'sugar');
    const flour = items.find((i) => String(i.item_name || '').toLowerCase() === 'flour');

    assert(sugar, 'Sugar row missing after generation');
    assert(flour, 'Flour row missing after generation');
    assert(String(sugar.base_unit || '').toLowerCase() === 'tsp', `Expected sugar base_unit=tsp, got ${sugar.base_unit}`);
    assert(Math.abs(Number(sugar.calculated_qty) - 5) < 0.0001, `Expected sugar calculated_qty=5, got ${sugar.calculated_qty}`);
    assert(String(flour.base_unit || '').toLowerCase() === 'g', `Expected flour base_unit=g, got ${flour.base_unit}`);
    assert(Math.abs(Number(flour.calculated_qty) - 1500) < 0.0001, `Expected flour calculated_qty=1500, got ${flour.calculated_qty}`);

    const warnings = Array.isArray(getPlan.payload.warnings) ? getPlan.payload.warnings.join(' | ') : '';
    assert(/missing or zero serving size/i.test(warnings), 'Expected missing-yield warning for recipe with null serving_size');

    // 2) Add incompatible units and confirm finalize blocker.
    const addIncompatible = await api(`/api/shopping-plan/${planId}/items`, {
      method: 'PUT',
      body: {
        adds: [
          { category: 'Dairy', item_name: 'Milk Guardrail', base_unit: 'ml', teacher_qty: 100, notes: 'compat smoke' },
          { category: 'Dairy', item_name: 'Milk Guardrail', base_unit: 'g', teacher_qty: 100, notes: 'compat smoke' }
        ]
      }
    });
    assert(addIncompatible.ok, 'Failed to add incompatible rows');

    const finalizeBlocked = await api(`/api/shopping-plan/${planId}/finalize`, { method: 'POST', body: {} });
    assert(!finalizeBlocked.ok && finalizeBlocked.status === 422, 'Finalize should be blocked for incompatible units');

    const blockedErrors = Array.isArray(finalizeBlocked.payload.errors) ? finalizeBlocked.payload.errors.join(' | ') : '';
    assert(/incompatible units/i.test(blockedErrors), 'Expected incompatible units error in finalize blocker response');

    // Remove incompatible rows.
    const withBadRows = await api(`/api/shopping-plan/${planId}`);
    assert(withBadRows.ok, 'Failed to reload plan with bad rows');

    const badIds = (withBadRows.payload.items || [])
      .filter((i) => String(i.item_name || '').toLowerCase() === 'milk guardrail')
      .map((i) => Number(i.id))
      .filter(Number.isInteger);

    assert(badIds.length >= 2, 'Expected two incompatible rows to delete');

    const removeBad = await api(`/api/shopping-plan/${planId}/items`, {
      method: 'PUT',
      body: { deletes: badIds }
    });
    assert(removeBad.ok, 'Failed to delete incompatible rows');

    // 3) Finalize no buffer, reopen, finalize with buffer, compare technician outputs.
    const finalizeNoBuffer = await api(`/api/shopping-plan/${planId}/finalize`, {
      method: 'POST',
      body: { use_safety_buffer: false }
    });
    assert(finalizeNoBuffer.ok, `Finalize without buffer failed: ${JSON.stringify(finalizeNoBuffer.payload)}`);

    const techBase = await api(`/api/shopping-plan/${planId}/technician-view`);
    assert(techBase.ok, 'Failed to fetch technician base plan');

    const baseRows = Object.values(techBase.payload.categories || {}).flat();
    const baseSugar = baseRows.find((r) => String(r.item_name || '').toLowerCase() === 'sugar');
    assert(baseSugar, 'Sugar missing in technician base plan');
    const baseSugarQty = Number(baseSugar.final_qty);

    const reopen = await api(`/api/shopping-plan/${planId}/reopen`, { method: 'POST', body: {} });
    assert(reopen.ok && reopen.payload.plan && reopen.payload.plan.id, 'Failed to reopen plan');

    const planIdBuffered = Number(reopen.payload.plan.id);
    temp.planIds.push(planIdBuffered);

    const finalizeBuffered = await api(`/api/shopping-plan/${planIdBuffered}/finalize`, {
      method: 'POST',
      body: {
        use_safety_buffer: true,
        default_safety_buffer_percent: 10,
        safety_buffer_by_category: {}
      }
    });
    assert(finalizeBuffered.ok, `Finalize with buffer failed: ${JSON.stringify(finalizeBuffered.payload)}`);

    const techBuffered = await api(`/api/shopping-plan/${planIdBuffered}/technician-view`);
    assert(techBuffered.ok, 'Failed to fetch technician buffered plan');

    const bufferedRows = Object.values(techBuffered.payload.categories || {}).flat();
    const bufferedSugar = bufferedRows.find((r) => String(r.item_name || '').toLowerCase() === 'sugar');
    assert(bufferedSugar, 'Sugar missing in technician buffered plan');
    const bufferedSugarQty = Number(bufferedSugar.final_qty);

    assert(bufferedSugarQty > baseSugarQty, `Expected buffered sugar qty > base qty (${bufferedSugarQty} vs ${baseSugarQty})`);
    const ratio = bufferedSugarQty / baseSugarQty;
    assert(ratio > 1.09 && ratio < 1.11, `Expected ~10% buffer ratio, got ${ratio}`);

    console.log('PHASE4_SMOKE_PASS');
    console.log(JSON.stringify({
      check1: 'canonical conversion + merge verified',
      check2: 'incompatible unit finalize blocker verified',
      check3: 'buffered finalize vs unbuffered technician output verified',
      plan_base: planId,
      plan_buffered: planIdBuffered,
      sugar_base: baseSugarQty,
      sugar_buffered: bufferedSugarQty,
      ratio
    }, null, 2));
  } catch (err) {
    console.error('PHASE4_SMOKE_FAIL');
    console.error(err && err.stack ? err.stack : err);
    process.exitCode = 1;
  } finally {
    try {
      if (temp.planIds.length) {
        await pool.query('DELETE FROM shopping_plan WHERE id = ANY($1::int[])', [temp.planIds]);
      }
      if (temp.bookingIds.length) {
        await pool.query('DELETE FROM desired_servings_ingredients WHERE booking_id = ANY($1::int[])', [temp.bookingIds]);
        await pool.query('DELETE FROM bookings WHERE id = ANY($1::int[])', [temp.bookingIds]);
      }
      if (temp.recipeIds.length) {
        await pool.query('DELETE FROM recipes WHERE id = ANY($1::int[])', [temp.recipeIds]);
      }
    } catch (cleanupErr) {
      console.warn('Cleanup warning:', cleanupErr.message || cleanupErr);
    }

    await pool.end();
  }
})();

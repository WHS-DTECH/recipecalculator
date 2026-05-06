// phase6_1_scaling_smoke.js
// Phase 6.1: scaling math validation across 5 varied-serving recipes.
//
// End-to-end checks:
// 1) Seed 5 recipes with varied serving_size + booking desired_servings inputs.
// 2) Verify desired_servings_ingredients.calculated_qty matches formula:
//      measure_qty * (desired_servings / serving_size)
// 3) Build a shopping plan from those bookings and verify generated draft
//    calculated totals match expected scaled values.
//
// Usage:
//   $env:PHASE6_BASE_URL='https://recipe-calculator-backend.onrender.com'
//   $env:PHASE6_ADMIN_EMAIL='you@example.com'
//   node scripts/phase6_1_scaling_smoke.js

const BASE_URL = process.env.PHASE6_BASE_URL || 'http://127.0.0.1:5055';
const ADMIN_EMAIL = process.env.PHASE6_ADMIN_EMAIL || 'test.admin@local';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function round4(value) {
  return Math.round(Number(value) * 10000) / 10000;
}

async function api(path, options = {}) {
  const headers = {
    'x-user-email': ADMIN_EMAIL,
    ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {})
  };

  const resp = await fetch(`${BASE_URL}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });

  const payload = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, payload };
}

(async function run() {
  const temp = { planIds: [], bookingIds: [], recipeIds: [] };

  try {
    console.log('Seeding Phase 6.1 scaling dataset...');
    const seed = await api('/api/shopping-plan/smoke-seed-scaling', { method: 'POST', body: {} });
    assert(seed.ok, `smoke-seed-scaling failed (${seed.status}): ${JSON.stringify(seed.payload)}`);

    const friday = seed.payload.friday;
    const cases = Array.isArray(seed.payload.cases) ? seed.payload.cases : [];

    assert(cases.length >= 5, `Expected at least 5 seeded cases, got ${cases.length}`);

    temp.bookingIds.push(...(seed.payload.bookingIds || []));
    temp.recipeIds.push(...(seed.payload.recipeIds || []));

    // --- Validate scaling formula per booking row ---
    for (const c of cases) {
      const dsi = await api(`/api/ingredients/desired_servings_ingredients?booking_id=${encodeURIComponent(c.bookingId)}`);
      assert(dsi.ok, `Failed to fetch DSI rows for booking ${c.bookingId}`);

      const rows = Array.isArray(dsi.payload.data) ? dsi.payload.data : [];
      const target = rows.find((r) => String(r.ingredient_name || '') === String(c.ingredientName));
      assert(target, `Missing seeded ingredient row for booking ${c.bookingId}`);

      const measureQty = Number(target.measure_qty);
      const desired = Number(target.desired_servings);
      const servingSize = Number(c.serving_size);
      const actualCalculated = Number(target.calculated_qty);

      assert(Number.isFinite(measureQty), `Non-numeric measure_qty for booking ${c.bookingId}`);
      assert(Number.isFinite(desired), `Non-numeric desired_servings for booking ${c.bookingId}`);
      assert(Number.isFinite(servingSize) && servingSize > 0, `Invalid serving_size for case ${c.index}`);
      assert(Number.isFinite(actualCalculated), `Non-numeric calculated_qty for booking ${c.bookingId}`);

      const expected = round4(measureQty * (desired / servingSize));
      const actual = round4(actualCalculated);
      assert(Math.abs(actual - expected) < 0.0001,
        `Scaling mismatch case ${c.index}: expected ${expected}, got ${actual}`);
    }

    console.log('CHECK 1 PASS: per-recipe scaling formula validated for 5 varied serving sizes');

    // --- End-to-end: build shopping plan and verify generated draft totals ---
    const create = await api('/api/shopping-plan/create', {
      method: 'POST',
      body: {
        week_ending: friday,
        booking_ids: seed.payload.bookingIds,
        notes: 'Phase6.1 scaling smoke'
      }
    });
    assert(create.ok && create.payload.plan && create.payload.plan.id,
      `Create plan failed: ${JSON.stringify(create.payload)}`);

    const planId = Number(create.payload.plan.id);
    temp.planIds.push(planId);

    const gen = await api(`/api/shopping-plan/${planId}/generate-draft`, { method: 'POST', body: {} });
    assert(gen.ok, `Generate draft failed: ${JSON.stringify(gen.payload)}`);

    const getPlan = await api(`/api/shopping-plan/${planId}`);
    assert(getPlan.ok, `Get plan failed: ${JSON.stringify(getPlan.payload)}`);

    const items = Array.isArray(getPlan.payload.items) ? getPlan.payload.items : [];

    for (const c of cases) {
      const item = items.find((i) => String(i.item_name || '') === String(c.ingredientName));
      assert(item, `Missing generated draft item for ${c.ingredientName}`);
      const actual = round4(Number(item.calculated_qty));
      const expected = round4(Number(c.expected_calculated_qty));
      assert(Math.abs(actual - expected) < 0.0001,
        `Draft aggregation mismatch for ${c.ingredientName}: expected ${expected}, got ${actual}`);
    }

    console.log('CHECK 2 PASS: shopping plan draft generation preserved scaled totals end-to-end');

    console.log('\nPHASE6_1_SCALING_PASS');
    console.log(JSON.stringify({
      casesValidated: cases.length,
      variedServingSizes: cases.map((c) => Number(c.serving_size)),
      planId,
      friday
    }, null, 2));
  } catch (err) {
    console.error('\nPHASE6_1_SCALING_FAIL');
    console.error(err && err.stack ? err.stack : err);
    process.exitCode = 1;
  } finally {
    try {
      console.log('\nCleaning up Phase 6.1 test data...');
      const cleanup = await api('/api/shopping-plan/smoke-cleanup', {
        method: 'POST',
        body: {
          planIds: temp.planIds,
          bookingIds: temp.bookingIds,
          recipeIds: temp.recipeIds
        }
      });
      if (!cleanup.ok) {
        console.warn('Cleanup warning:', JSON.stringify(cleanup.payload));
      } else {
        console.log('Cleanup OK');
      }
    } catch (cleanupErr) {
      console.warn('Cleanup error:', cleanupErr.message || cleanupErr);
    }
  }
})();

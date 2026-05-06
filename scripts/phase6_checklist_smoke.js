// phase6_checklist_smoke.js
// Phase 6 checklist smoke test for Teacher-First Shopping Plan.
//
// Validates:
// - Functional flow (create draft, edit/add, finalize lock, technician view, reopen)
// - Permissions (non-admin cannot finalize, technician cannot edit)
// - Accuracy subset (duplicate merge + tsp/tbsp and g/kg conversion)
//
// Usage:
//   $env:PHASE6_BASE_URL='https://recipe-calculator-backend.onrender.com'
//   $env:PHASE6_ADMIN_EMAIL='you@example.com'
//   node scripts/phase6_checklist_smoke.js

const BASE_URL = process.env.PHASE6_BASE_URL || 'http://127.0.0.1:5055';
const ADMIN_EMAIL = process.env.PHASE6_ADMIN_EMAIL || 'test.admin@local';
const NON_ADMIN_EMAIL = process.env.PHASE6_NON_ADMIN_EMAIL || 'phase6.nonadmin@local.test';
const TECH_EMAIL = process.env.PHASE6_TECH_EMAIL || 'phase6.tech@local.test';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function api(path, options = {}) {
  const headers = {
    'x-user-email': options.userEmail || ADMIN_EMAIL,
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

function flattenCategories(categoriesObj) {
  if (!categoriesObj || typeof categoriesObj !== 'object') return [];
  return Object.values(categoriesObj).flat();
}

(async function run() {
  const temp = { planIds: [], bookingIds: [], recipeIds: [] };

  try {
    console.log('Seeding Phase 6 test data...');
    const seed = await api('/api/shopping-plan/smoke-seed', { method: 'POST', body: {} });
    assert(seed.ok, `smoke-seed failed (${seed.status}): ${JSON.stringify(seed.payload)}`);

    const { recipeIds, bookingIds, friday } = seed.payload;
    temp.recipeIds.push(...recipeIds);
    temp.bookingIds.push(...bookingIds);

    // 1) Create draft plan for selected week + generate draft
    const create = await api('/api/shopping-plan/create', {
      method: 'POST',
      body: {
        week_ending: friday,
        booking_ids: bookingIds,
        notes: 'Phase6 smoke'
      }
    });
    assert(create.ok && create.payload.plan && create.payload.plan.id,
      `Create draft failed: ${JSON.stringify(create.payload)}`);

    const planId = Number(create.payload.plan.id);
    temp.planIds.push(planId);

    const gen = await api(`/api/shopping-plan/${planId}/generate-draft`, { method: 'POST', body: {} });
    assert(gen.ok, `Generate draft failed: ${JSON.stringify(gen.payload)}`);

    const planDraft = await api(`/api/shopping-plan/${planId}`);
    assert(planDraft.ok, `Fetch plan failed: ${JSON.stringify(planDraft.payload)}`);

    const itemsBeforeEdit = Array.isArray(planDraft.payload.items) ? planDraft.payload.items : [];
    const sugar = itemsBeforeEdit.find((i) => String(i.item_name || '').toLowerCase() === 'sugar');
    const flour = itemsBeforeEdit.find((i) => String(i.item_name || '').toLowerCase() === 'flour');

    // Accuracy subset: duplicate merge + conversion checks
    assert(sugar, 'Sugar row missing after generation');
    assert(flour, 'Flour row missing after generation');
    assert(String(sugar.base_unit || '').toLowerCase() === 'tsp',
      `Expected sugar base_unit=tsp, got ${sugar.base_unit}`);
    assert(Math.abs(Number(sugar.calculated_qty) - 5) < 0.0001,
      `Expected sugar calculated_qty=5 from merged classes, got ${sugar.calculated_qty}`);
    assert(String(flour.base_unit || '').toLowerCase() === 'g',
      `Expected flour base_unit=g, got ${flour.base_unit}`);
    assert(Math.abs(Number(flour.calculated_qty) - 1500) < 0.0001,
      `Expected flour calculated_qty=1500 from merged classes, got ${flour.calculated_qty}`);

    // 2) Edit teacher quantities and add manual extra
    const updatesAndAdds = await api(`/api/shopping-plan/${planId}/items`, {
      method: 'PUT',
      body: {
        updates: [
          { id: sugar.id, teacher_qty: 9, notes: 'phase6 teacher override' }
        ],
        adds: [
          {
            category: 'Pantry',
            item_name: 'Phase6 Manual Extra',
            base_unit: 'g',
            teacher_qty: 250,
            notes: 'phase6 manual add'
          }
        ]
      }
    });
    assert(updatesAndAdds.ok, `Edit/add failed: ${JSON.stringify(updatesAndAdds.payload)}`);

    const planEdited = await api(`/api/shopping-plan/${planId}`);
    assert(planEdited.ok, `Fetch edited plan failed: ${JSON.stringify(planEdited.payload)}`);
    const editedItems = Array.isArray(planEdited.payload.items) ? planEdited.payload.items : [];

    const sugarEdited = editedItems.find((i) => Number(i.id) === Number(sugar.id));
    const manualExtra = editedItems.find((i) => String(i.item_name || '').toLowerCase() === 'phase6 manual extra');
    assert(sugarEdited && Number(sugarEdited.teacher_qty) === 9,
      `Expected sugar teacher_qty=9, got ${sugarEdited ? sugarEdited.teacher_qty : 'missing row'}`);
    assert(manualExtra, 'Manual extra row was not added');

    // 3) Finalize locks data
    const finalize = await api(`/api/shopping-plan/${planId}/finalize`, { method: 'POST', body: {} });
    assert(finalize.ok, `Finalize failed: ${JSON.stringify(finalize.payload)}`);

    const postFinalizeEditAsAdmin = await api(`/api/shopping-plan/${planId}/items`, {
      method: 'PUT',
      body: { updates: [{ id: sugar.id, teacher_qty: 11 }] }
    });
    assert(!postFinalizeEditAsAdmin.ok && postFinalizeEditAsAdmin.status === 409,
      `Expected 409 when editing finalized plan, got ${postFinalizeEditAsAdmin.status}`);

    // 4) Technician view reflects finalized values exactly
    const techView = await api(`/api/shopping-plan/${planId}/technician-view`, {
      method: 'GET',
      userEmail: TECH_EMAIL
    });
    assert(techView.ok, `Technician view failed: ${JSON.stringify(techView.payload)}`);

    const techRows = flattenCategories(techView.payload.categories);
    const techSugar = techRows.find((r) => String(r.item_name || '').toLowerCase() === 'sugar');
    const techExtra = techRows.find((r) => String(r.item_name || '').toLowerCase() === 'phase6 manual extra');
    assert(techSugar && Number(techSugar.final_qty) === 9,
      `Expected technician sugar final_qty=9, got ${techSugar ? techSugar.final_qty : 'missing row'}`);
    assert(techExtra && Number(techExtra.final_qty) === 250,
      `Expected technician manual extra final_qty=250, got ${techExtra ? techExtra.final_qty : 'missing row'}`);

    // 5) Reopen creates a new version and preserves history/edits
    const reopen = await api(`/api/shopping-plan/${planId}/reopen`, { method: 'POST', body: {} });
    assert(reopen.ok && reopen.payload.plan && reopen.payload.plan.id,
      `Reopen failed: ${JSON.stringify(reopen.payload)}`);

    const reopenedPlanId = Number(reopen.payload.plan.id);
    temp.planIds.push(reopenedPlanId);
    assert(Number(reopen.payload.plan.version) > Number(create.payload.plan.version),
      `Expected reopened version > original version, got ${reopen.payload.plan.version}`);

    const reopenedPlan = await api(`/api/shopping-plan/${reopenedPlanId}`);
    assert(reopenedPlan.ok, `Fetch reopened plan failed: ${JSON.stringify(reopenedPlan.payload)}`);
    assert(String(reopenedPlan.payload.plan.status || '') === 'draft',
      `Expected reopened plan status=draft, got ${reopenedPlan.payload.plan.status}`);

    const reopenedItems = Array.isArray(reopenedPlan.payload.items) ? reopenedPlan.payload.items : [];
    const reopenedSugar = reopenedItems.find((i) => String(i.item_name || '').toLowerCase() === 'sugar');
    const reopenedExtra = reopenedItems.find((i) => String(i.item_name || '').toLowerCase() === 'phase6 manual extra');
    assert(reopenedSugar && Number(reopenedSugar.teacher_qty) === 9,
      `Expected reopened sugar teacher_qty=9, got ${reopenedSugar ? reopenedSugar.teacher_qty : 'missing row'}`);
    assert(reopenedExtra && Number(reopenedExtra.teacher_qty) === 250,
      `Expected reopened manual extra teacher_qty=250, got ${reopenedExtra ? reopenedExtra.teacher_qty : 'missing row'}`);

    // Permissions
    // A) Non-admin cannot finalize
    const nonAdminFinalize = await api(`/api/shopping-plan/${reopenedPlanId}/finalize`, {
      method: 'POST',
      userEmail: NON_ADMIN_EMAIL,
      body: {}
    });
    assert(!nonAdminFinalize.ok && nonAdminFinalize.status === 403,
      `Expected 403 for non-admin finalize, got ${nonAdminFinalize.status}`);

    // B) Technician cannot edit finalized quantities (route is admin-guarded)
    const techEditFinalized = await api(`/api/shopping-plan/${planId}/items`, {
      method: 'PUT',
      userEmail: TECH_EMAIL,
      body: {
        updates: [{ id: sugar.id, teacher_qty: 15 }]
      }
    });
    assert(!techEditFinalized.ok && techEditFinalized.status === 403,
      `Expected 403 for technician edit on finalized plan, got ${techEditFinalized.status}`);

    console.log('\nPHASE6_SMOKE_PASS');
    console.log(JSON.stringify({
      functional: {
        createDraft: true,
        editAndManualAdd: true,
        finalizeLocks: true,
        technicianExact: true,
        reopenVersioned: true
      },
      accuracy: {
        duplicateMergeAcrossClasses: true,
        unitConversionSpnWeight: true
      },
      permissions: {
        nonAdminFinalizeBlocked: true,
        technicianEditBlocked: true
      },
      ids: {
        originalPlanId: planId,
        reopenedPlanId
      }
    }, null, 2));
  } catch (err) {
    console.error('\nPHASE6_SMOKE_FAIL');
    console.error(err && err.stack ? err.stack : err);
    process.exitCode = 1;
  } finally {
    try {
      console.log('\nCleaning up Phase 6 test data...');
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

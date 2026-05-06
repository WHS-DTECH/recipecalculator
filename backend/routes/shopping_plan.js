// routes/shopping_plan.js
// Teacher-First Shopping Plan API
// All endpoints require admin (Lead Teacher) except GET /:id/technician-view
// which only requires a logged-in session.

const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAdmin } = require('../middleware/requireAdmin');

// ---------------------------------------------------------------------------
// Helper: resolve the requesting user's email from the request
// ---------------------------------------------------------------------------
function requestEmail(req) {
  return String(
    req.authUserEmail ||
    req.headers['x-user-email'] ||
    req.headers['x-staff-email'] ||
    req.query.userEmail ||
    (req.body && req.body.userEmail) ||
    'unknown'
  ).trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Helper: normalise an ingredient name for deduplication keying
// ---------------------------------------------------------------------------
function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function normalizeUnit(value) {
  const u = String(value || '').trim().toLowerCase();
  if (!u) return '';
  if (['teaspoon', 'teaspoons', 'tsp'].includes(u)) return 'tsp';
  if (['tablespoon', 'tablespoons', 'tbsp', 'tbs', 'tblsp'].includes(u)) return 'tbsp';
  if (['gram', 'grams', 'g'].includes(u)) return 'g';
  if (['kilogram', 'kilograms', 'kg'].includes(u)) return 'kg';
  if (['milliliter', 'milliliters', 'millilitre', 'millilitres', 'ml'].includes(u)) return 'ml';
  if (['liter', 'liters', 'litre', 'litres', 'l'].includes(u)) return 'l';
  return u;
}

function unitFamily(unit) {
  const normalized = normalizeUnit(unit);
  if (!normalized) return 'none';
  if (normalized === 'tsp' || normalized === 'tbsp') return 'spoon';
  if (normalized === 'g' || normalized === 'kg') return 'weight';
  if (normalized === 'ml' || normalized === 'l') return 'volume';
  return 'other';
}

function toCanonicalQty(qtyValue, unitValue) {
  const qty = Number(qtyValue);
  const unit = normalizeUnit(unitValue);
  const family = unitFamily(unit);

  if (!Number.isFinite(qty)) {
    return { qty: NaN, unit, family, wasConverted: false };
  }

  if (unit === 'tbsp') return { qty: qty * 3, unit: 'tsp', family: 'spoon', wasConverted: true };
  if (unit === 'tsp') return { qty, unit: 'tsp', family: 'spoon', wasConverted: false };
  if (unit === 'kg') return { qty: qty * 1000, unit: 'g', family: 'weight', wasConverted: true };
  if (unit === 'g') return { qty, unit: 'g', family: 'weight', wasConverted: false };
  if (unit === 'l') return { qty: qty * 1000, unit: 'ml', family: 'volume', wasConverted: true };
  if (unit === 'ml') return { qty, unit: 'ml', family: 'volume', wasConverted: false };

  return { qty, unit, family, wasConverted: false };
}

function buildUnitCompatibilityDiagnostics(items) {
  const byIngredient = new Map();

  for (const item of items || []) {
    const ingredientKey = `${normalizeKey(item.normalized_item_key || item.item_name)}||${normalizeKey(item.category)}`;
    if (!byIngredient.has(ingredientKey)) {
      byIngredient.set(ingredientKey, {
        item_name: item.item_name,
        category: item.category || 'Uncategorised',
        units: new Set(),
        families: new Set()
      });
    }
    const unit = normalizeUnit(item.base_unit);
    const family = unitFamily(unit);
    if (unit) byIngredient.get(ingredientKey).units.add(unit);
    if (family !== 'none') byIngredient.get(ingredientKey).families.add(family);
  }

  const warnings = [];
  const errors = [];

  byIngredient.forEach((entry) => {
    const units = Array.from(entry.units);
    const families = Array.from(entry.families);

    if (units.length <= 1) return;

    const hasMultipleFamilies = families.length > 1;
    const sameConvertibleFamily = families.length === 1 && ['spoon', 'weight', 'volume'].includes(families[0]);
    const allSameOtherFamily = families.length === 1 && families[0] === 'other' && units.length === 1;

    if (hasMultipleFamilies || (!sameConvertibleFamily && !allSameOtherFamily)) {
      errors.push(`"${entry.item_name}" in category "${entry.category}" uses incompatible units (${units.join(', ')}). Split into separate lines or standardize units before finalizing.`);
      return;
    }

    if (sameConvertibleFamily && units.length > 1) {
      warnings.push(`"${entry.item_name}" combines units (${units.join(', ')}) and is auto-converted to canonical ${families[0]} units.`);
    }
  });

  return { warnings, errors };
}

// ---------------------------------------------------------------------------
// Helper: validate that a date string falls on a Friday
// ---------------------------------------------------------------------------
function isFriday(dateStr) {
  const d = new Date(dateStr);
  // getDay() returns 5 for Friday (UTC)
  return !isNaN(d.getTime()) && d.getUTCDay() === 5;
}

// ===========================================================================
// POST /api/shopping-plan/create
// Create a new draft plan for a given week_ending Friday.
// Body: { week_ending: "YYYY-MM-DD", booking_ids?: number[], notes?: string }
// ===========================================================================
router.post('/create', requireAdmin, async (req, res) => {
  const { week_ending, booking_ids, notes } = req.body || {};

  if (!week_ending) {
    return res.status(400).json({ success: false, error: 'week_ending is required (YYYY-MM-DD Friday).' });
  }
  if (!isFriday(week_ending)) {
    return res.status(400).json({ success: false, error: 'week_ending must be a Friday.' });
  }

  const email = requestEmail(req);

  try {
    // Determine next version number for this week
    const versionRes = await pool.query(
      'SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM shopping_plan WHERE week_ending = $1',
      [week_ending]
    );
    const version = versionRes.rows[0].next_version;

    // Create the plan
    const planRes = await pool.query(
      `INSERT INTO shopping_plan (week_ending, status, version, created_by, notes)
       VALUES ($1, 'draft', $2, $3, $4)
       RETURNING *`,
      [week_ending, version, email, notes || null]
    );
    const plan = planRes.rows[0];

    // Snapshot classes from provided booking_ids (if any)
    if (Array.isArray(booking_ids) && booking_ids.length > 0) {
      const safeIds = booking_ids.map(Number).filter(Number.isInteger);
      if (safeIds.length > 0) {
        const bookingsRes = await pool.query(
          `SELECT id, staff_name, class_name, recipe_id, class_size
           FROM bookings
           WHERE id = ANY($1::int[])`,
          [safeIds]
        );
        if (bookingsRes.rows.length > 0) {
          const insertValues = bookingsRes.rows.map((b, i) => {
            const base = i * 6;
            return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
          });
          const flatParams = [];
          bookingsRes.rows.forEach((b, i) => {
            flatParams.push(plan.id, b.id, b.class_name || '', b.staff_name || null, b.recipe_id || null, b.class_size || null);
          });
          await pool.query(
            `INSERT INTO shopping_plan_classes (plan_id, booking_id, class_name, teacher_name, recipe_id, planned_servings)
             VALUES ${insertValues.join(', ')}`,
            flatParams
          );
        }
      }
    }

    return res.status(201).json({ success: true, plan });
  } catch (err) {
    console.error('[shopping-plan] POST /create error:', err.message);
    if (err.code === '23505') {
      return res.status(409).json({ success: false, error: 'A plan for this week and version already exists.' });
    }
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ===========================================================================
// POST /api/shopping-plan/:id/generate-draft
// Aggregate ingredient quantities from desired_servings_ingredients for all
// included classes in this plan. Replaces any existing items for this plan.
// ===========================================================================
router.post('/:id/generate-draft', requireAdmin, async (req, res) => {
  const planId = parseInt(req.params.id, 10);
  if (!Number.isInteger(planId) || planId <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid plan ID.' });
  }

  try {
    // Confirm plan exists and is still a draft
    const planRes = await pool.query('SELECT * FROM shopping_plan WHERE id = $1', [planId]);
    if (planRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Plan not found.' });
    }
    if (planRes.rows[0].status !== 'draft') {
      return res.status(409).json({ success: false, error: 'Cannot regenerate a finalized plan.' });
    }

    // Fetch included classes for this plan that have a booking_id
    const classesRes = await pool.query(
      `SELECT spc.booking_id, spc.class_name, spc.teacher_name, spc.recipe_id, spc.planned_servings
       FROM shopping_plan_classes spc
       WHERE spc.plan_id = $1 AND spc.included = true AND spc.booking_id IS NOT NULL`,
      [planId]
    );

    if (classesRes.rowCount === 0) {
      return res.status(422).json({ success: false, error: 'No included classes with booking IDs found. Add classes to the plan first.' });
    }

    const bookingIds = classesRes.rows.map(r => r.booking_id);

    // Pull scaled ingredients for all included bookings from desired_servings_ingredients
    const dsiRes = await pool.query(
      `SELECT
         dsi.booking_id,
         dsi.ingredient_name,
         dsi.fooditem,
         dsi.stripfooditem,
         dsi.measure_unit,
         dsi.calculated_qty,
         COALESCE(ac.name, 'Uncategorised') AS category
       FROM desired_servings_ingredients dsi
       LEFT JOIN aisle_category ac ON ac.id = dsi.aisle_category_id
       WHERE dsi.booking_id = ANY($1::int[])`,
      [bookingIds]
    );

    // Group by normalised ingredient key + category + canonical unit.
    // This allows tsp/tbsp, g/kg, ml/l to combine safely while keeping
    // incompatible units separated for explicit review.
    const itemMap = new Map();
    const classLookup = new Map(classesRes.rows.map(r => [r.booking_id, r]));

    for (const row of dsiRes.rows) {
      const rawName = row.stripfooditem || row.fooditem || row.ingredient_name || '';
      const unit = String(row.measure_unit || '').trim();
      const canonical = toCanonicalQty(row.calculated_qty, unit);
      const canonicalUnit = canonical.unit || normalizeUnit(unit) || '';
      const key = normalizeKey(rawName) + '||' + normalizeKey(row.category) + '||' + normalizeKey(canonicalUnit);
      const qty = Number.isFinite(canonical.qty) ? canonical.qty : 0;
      const cls = classLookup.get(row.booking_id);

      if (!itemMap.has(key)) {
        itemMap.set(key, {
          category: row.category,
          item_name: rawName,
          normalized_item_key: normalizeKey(rawName),
          base_unit: canonicalUnit,
          calculated_qty: 0,
          sources: []
        });
      }
      const entry = itemMap.get(key);
      entry.calculated_qty += qty;
      entry.sources.push({
        booking_id: row.booking_id,
        class_name: cls ? cls.class_name : null,
        teacher_name: cls ? cls.teacher_name : null,
        qty: Number.isFinite(Number(row.calculated_qty)) ? Number(row.calculated_qty) : null,
        unit,
        canonical_qty: Number.isFinite(canonical.qty) ? canonical.qty : null,
        canonical_unit: canonicalUnit,
        was_converted: canonical.wasConverted
      });
    }

    // Delete existing auto-generated items (source_type = 'recipe_scale') for this plan
    await pool.query(
      `DELETE FROM shopping_plan_items WHERE plan_id = $1 AND (source_type = 'recipe_scale' OR source_type IS NULL)`,
      [planId]
    );

    // Bulk insert the new aggregated items
    if (itemMap.size > 0) {
      const entries = Array.from(itemMap.values());
      const valueClauses = entries.map((_, i) => {
        const b = i * 7;
        return `($${b+1}, $${b+2}, $${b+3}, $${b+4}, $${b+5}, $${b+6}, $${b+7})`;
      });
      const flatParams = [];
      entries.forEach((e, i) => {
        flatParams.push(
          planId,
          e.category,
          e.item_name,
          e.normalized_item_key,
          e.base_unit || null,
          Math.round(e.calculated_qty * 10000) / 10000,
          JSON.stringify(e.sources)
        );
      });
      await pool.query(
        `INSERT INTO shopping_plan_items
           (plan_id, category, item_name, normalized_item_key, base_unit, calculated_qty, source_type, source_detail_json, sort_order)
         VALUES ${valueClauses.map((v, i) => {
           // re-map to include source_type literal and sort_order
           const b = i * 7;
           return `($${b+1}, $${b+2}, $${b+3}, $${b+4}, $${b+5}, $${b+6}, 'recipe_scale', $${b+7}, ${i})`;
         }).join(', ')}`,
        flatParams
      );
    }

    const itemCount = itemMap.size;
    const diagnostics = buildUnitCompatibilityDiagnostics(Array.from(itemMap.values()));
    return res.json({
      success: true,
      items_generated: itemCount,
      warnings: diagnostics.warnings
    });
  } catch (err) {
    console.error('[shopping-plan] POST /:id/generate-draft error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ===========================================================================
// GET /api/shopping-plan (list)
// Return summary list of all plans, most recent first.
// ===========================================================================
router.get('/', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, week_ending, status, version, created_by, created_at, finalized_at, notes
       FROM shopping_plan
       ORDER BY week_ending DESC, version DESC`
    );
    return res.json({ success: true, plans: result.rows });
  } catch (err) {
    console.error('[shopping-plan] GET / error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ===========================================================================
// GET /api/shopping-plan/:id
// Return full plan: header + classes + items + warnings.
// ===========================================================================
router.get('/:id', requireAdmin, async (req, res) => {
  const planId = parseInt(req.params.id, 10);
  if (!Number.isInteger(planId) || planId <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid plan ID.' });
  }

  try {
    const [planRes, classesRes, itemsRes] = await Promise.all([
      pool.query('SELECT * FROM shopping_plan WHERE id = $1', [planId]),
      pool.query(
        'SELECT * FROM shopping_plan_classes WHERE plan_id = $1 ORDER BY sort_order, id',
        [planId]
      ),
      pool.query(
        'SELECT * FROM shopping_plan_items WHERE plan_id = $1 ORDER BY category, sort_order, id',
        [planId]
      )
    ]);

    if (planRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Plan not found.' });
    }

    // Soft warnings
    const warnings = [];
    const classesWithNoIngredients = classesRes.rows
      .filter(c => c.included && c.booking_id)
      .map(c => c.booking_id)
      .filter(bid => !itemsRes.rows.some(item =>
        item.source_detail_json &&
        item.source_detail_json.some &&
        item.source_detail_json.some(s => s.booking_id === bid)
      ));
    if (classesWithNoIngredients.length > 0) {
      warnings.push(`${classesWithNoIngredients.length} included class(es) have no ingredient data — run generate-draft or check desired_servings_ingredients.`);
    }

    const itemsMissingUnit = itemsRes.rows.filter(item => !item.base_unit && item.calculated_qty > 0);
    if (itemsMissingUnit.length > 0) {
      warnings.push(`${itemsMissingUnit.length} item(s) are missing a unit. Review before finalizing.`);
    }

    const unitDiagnostics = buildUnitCompatibilityDiagnostics(itemsRes.rows);
    warnings.push(...unitDiagnostics.warnings);
    if (unitDiagnostics.errors.length > 0) {
      warnings.push(`${unitDiagnostics.errors.length} unit compatibility issue(s) must be fixed before finalizing.`);
    }

    const recipeIds = classesRes.rows
      .filter((c) => c.included && Number.isInteger(Number(c.recipe_id)) && Number(c.recipe_id) > 0)
      .map((c) => Number(c.recipe_id));

    if (recipeIds.length > 0) {
      const yieldCheck = await pool.query(
        `SELECT id
         FROM recipes
         WHERE id = ANY($1::int[])
           AND (serving_size IS NULL OR serving_size <= 0)`,
        [recipeIds]
      );

      if (yieldCheck.rowCount > 0) {
        warnings.push(`${yieldCheck.rowCount} class recipe(s) have missing or zero serving size. Quantity scaling may be inaccurate.`);
      }
    }

    return res.json({
      success: true,
      plan: planRes.rows[0],
      classes: classesRes.rows,
      items: itemsRes.rows,
      warnings
    });
  } catch (err) {
    console.error('[shopping-plan] GET /:id error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ===========================================================================
// PUT /api/shopping-plan/:id/items
// Save teacher edits: update teacher_qty, base_unit, category, notes per item.
// Also supports adding new manual rows and deleting rows (by item id).
// Body: {
//   updates?: [{ id, teacher_qty?, base_unit?, category?, notes? }],
//   adds?:    [{ category, item_name, base_unit, teacher_qty, notes }],
//   deletes?: [id]
// }
// Writes audit records for any changed numeric/text field.
// ===========================================================================
router.put('/:id/items', requireAdmin, async (req, res) => {
  const planId = parseInt(req.params.id, 10);
  if (!Number.isInteger(planId) || planId <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid plan ID.' });
  }

  const { updates = [], adds = [], deletes = [] } = req.body || {};
  const email = requestEmail(req);

  try {
    const planRes = await pool.query('SELECT status FROM shopping_plan WHERE id = $1', [planId]);
    if (planRes.rowCount === 0) return res.status(404).json({ success: false, error: 'Plan not found.' });
    if (planRes.rows[0].status !== 'draft') {
      return res.status(409).json({ success: false, error: 'Cannot edit a finalized plan. Reopen it first.' });
    }

    // -- Process deletes --
    if (deletes.length > 0) {
      const safeDeletes = deletes.map(Number).filter(Number.isInteger);
      if (safeDeletes.length > 0) {
        await pool.query(
          'DELETE FROM shopping_plan_items WHERE id = ANY($1::int[]) AND plan_id = $2',
          [safeDeletes, planId]
        );
      }
    }

    // -- Process updates --
    for (const upd of updates) {
      const itemId = parseInt(upd.id, 10);
      if (!Number.isInteger(itemId) || itemId <= 0) continue;

      const existing = await pool.query(
        'SELECT * FROM shopping_plan_items WHERE id = $1 AND plan_id = $2',
        [itemId, planId]
      );
      if (existing.rowCount === 0) continue;
      const row = existing.rows[0];

      const auditEntries = [];
      const setClauses = [];
      const params = [];

      const trackField = (field, newVal) => {
        const oldVal = row[field] !== null && row[field] !== undefined ? String(row[field]) : null;
        const newValStr = newVal !== null && newVal !== undefined ? String(newVal) : null;
        if (oldVal !== newValStr) {
          auditEntries.push({ field_name: field, old_value: oldVal, new_value: newValStr });
        }
        params.push(newVal !== undefined ? newVal : row[field]);
        setClauses.push(`${field} = $${params.length}`);
      };

      if (upd.teacher_qty !== undefined) trackField('teacher_qty', upd.teacher_qty !== '' ? upd.teacher_qty : null);
      if (upd.base_unit !== undefined)   trackField('base_unit', upd.base_unit || null);
      if (upd.category !== undefined)    trackField('category', upd.category || 'Uncategorised');
      if (upd.notes !== undefined)       trackField('notes', upd.notes || null);

      if (setClauses.length > 0) {
        params.push(email, new Date().toISOString(), itemId, planId);
        await pool.query(
          `UPDATE shopping_plan_items
           SET ${setClauses.join(', ')}, edited_by = $${params.length - 3}, edited_at = $${params.length - 2}
           WHERE id = $${params.length - 1} AND plan_id = $${params.length}`,
          params
        );

        // Write audit records
        for (const entry of auditEntries) {
          await pool.query(
            `INSERT INTO shopping_plan_item_audit (plan_item_id, field_name, old_value, new_value, reason, changed_by)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [itemId, entry.field_name, entry.old_value, entry.new_value, upd.reason || null, email]
          );
        }
      }
    }

    // -- Process adds (manual rows) --
    for (const add of adds) {
      const itemName = String(add.item_name || '').trim();
      if (!itemName) continue;
      await pool.query(
        `INSERT INTO shopping_plan_items
           (plan_id, category, item_name, normalized_item_key, base_unit, teacher_qty, source_type, notes, edited_by, edited_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'manual', $7, $8, NOW())`,
        [
          planId,
          add.category || 'Uncategorised',
          itemName,
          normalizeKey(itemName),
          add.base_unit || null,
          add.teacher_qty !== undefined ? add.teacher_qty : null,
          add.notes || null,
          email
        ]
      );
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('[shopping-plan] PUT /:id/items error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ===========================================================================
// POST /api/shopping-plan/:id/finalize
// Compute final_qty for every item, then lock the plan to status=finalized.
// Blocks on: negative quantities, NaN quantities for items that have a unit.
// ===========================================================================
router.post('/:id/finalize', requireAdmin, async (req, res) => {
  const planId = parseInt(req.params.id, 10);
  if (!Number.isInteger(planId) || planId <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid plan ID.' });
  }

  const email = requestEmail(req);

  try {
    const planRes = await pool.query('SELECT * FROM shopping_plan WHERE id = $1', [planId]);
    if (planRes.rowCount === 0) return res.status(404).json({ success: false, error: 'Plan not found.' });
    if (planRes.rows[0].status !== 'draft') {
      return res.status(409).json({ success: false, error: 'Plan is already finalized.' });
    }

    const itemsRes = await pool.query(
      'SELECT * FROM shopping_plan_items WHERE plan_id = $1',
      [planId]
    );

    const body = req.body || {};
    const useSafetyBuffer = body.use_safety_buffer === true;
    const defaultSafetyBufferPercent = Number(body.default_safety_buffer_percent);
    const rawCategoryBuffer = body.safety_buffer_by_category && typeof body.safety_buffer_by_category === 'object'
      ? body.safety_buffer_by_category
      : {};
    const categoryBuffer = {};
    Object.keys(rawCategoryBuffer).forEach((k) => {
      const parsed = Number(rawCategoryBuffer[k]);
      if (Number.isFinite(parsed) && parsed >= 0) {
        categoryBuffer[normalizeKey(k)] = parsed;
      }
    });

    // Validation: block on bad quantities
    const errors = [];
    const unitDiagnostics = buildUnitCompatibilityDiagnostics(itemsRes.rows);
    errors.push(...unitDiagnostics.errors);
    for (const item of itemsRes.rows) {
      const effective = item.teacher_qty !== null ? parseFloat(item.teacher_qty) : parseFloat(item.calculated_qty);
      if (!item.base_unit && Number.isFinite(effective) && effective > 0) {
        errors.push(`"${item.item_name}" has quantity ${effective} but no unit.`);
      }
      if (item.base_unit && (isNaN(effective) || effective === null)) {
        errors.push(`"${item.item_name}" has a unit but no valid quantity.`);
      }
      if (Number.isFinite(effective) && effective < 0) {
        errors.push(`"${item.item_name}" has a negative quantity (${effective}).`);
      }
    }
    if (errors.length > 0) {
      return res.status(422).json({ success: false, errors });
    }

    // Compute and store final_qty for each item
    for (const item of itemsRes.rows) {
      const baseFinalQty = item.teacher_qty !== null
        ? parseFloat(item.teacher_qty)
        : (item.calculated_qty !== null ? parseFloat(item.calculated_qty) : null);

      let finalQty = baseFinalQty;
      if (useSafetyBuffer && Number.isFinite(baseFinalQty)) {
        const categoryKey = normalizeKey(item.category || '');
        const categoryPercent = Number(categoryBuffer[categoryKey]);
        const fallbackPercent = Number.isFinite(defaultSafetyBufferPercent) && defaultSafetyBufferPercent >= 0
          ? defaultSafetyBufferPercent
          : 0;
        const bufferPercent = Number.isFinite(categoryPercent) ? categoryPercent : fallbackPercent;
        finalQty = baseFinalQty * (1 + (bufferPercent / 100));
      }

      await pool.query(
        'UPDATE shopping_plan_items SET final_qty = $1 WHERE id = $2',
        [finalQty !== null && Number.isFinite(finalQty) ? Math.round(finalQty * 10000) / 10000 : null, item.id]
      );
    }

    // Lock the plan
    await pool.query(
      `UPDATE shopping_plan
       SET status = 'finalized', finalized_by = $1, finalized_at = NOW()
       WHERE id = $2`,
      [email, planId]
    );

    return res.json({
      success: true,
      message: 'Plan finalized.',
      safety_buffer_applied: useSafetyBuffer === true,
      warnings: unitDiagnostics.warnings
    });
  } catch (err) {
    console.error('[shopping-plan] POST /:id/finalize error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ===========================================================================
// POST /api/shopping-plan/:id/reopen
// Copy a finalized plan into a new draft at the next version number.
// Items with teacher_qty carry forward; calculated_qty is preserved.
// ===========================================================================
router.post('/:id/reopen', requireAdmin, async (req, res) => {
  const planId = parseInt(req.params.id, 10);
  if (!Number.isInteger(planId) || planId <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid plan ID.' });
  }

  const email = requestEmail(req);

  try {
    const planRes = await pool.query('SELECT * FROM shopping_plan WHERE id = $1', [planId]);
    if (planRes.rowCount === 0) return res.status(404).json({ success: false, error: 'Plan not found.' });
    const original = planRes.rows[0];

    if (original.status !== 'finalized') {
      return res.status(409).json({ success: false, error: 'Only finalized plans can be reopened.' });
    }

    // Next version for this week
    const versionRes = await pool.query(
      'SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM shopping_plan WHERE week_ending = $1',
      [original.week_ending]
    );
    const newVersion = versionRes.rows[0].next_version;

    // Create new draft
    const newPlanRes = await pool.query(
      `INSERT INTO shopping_plan (week_ending, status, version, created_by, notes)
       VALUES ($1, 'draft', $2, $3, $4)
       RETURNING *`,
      [original.week_ending, newVersion, email, original.notes]
    );
    const newPlan = newPlanRes.rows[0];

    // Copy classes
    await pool.query(
      `INSERT INTO shopping_plan_classes
         (plan_id, booking_id, class_name, teacher_name, recipe_id, planned_servings, included, sort_order)
       SELECT $1, booking_id, class_name, teacher_name, recipe_id, planned_servings, included, sort_order
       FROM shopping_plan_classes
       WHERE plan_id = $2`,
      [newPlan.id, planId]
    );

    // Copy items (reset final_qty; preserve teacher overrides)
    await pool.query(
      `INSERT INTO shopping_plan_items
         (plan_id, category, item_name, normalized_item_key, base_unit,
          calculated_qty, teacher_qty, source_type, source_detail_json, notes, sort_order)
       SELECT $1, category, item_name, normalized_item_key, base_unit,
              calculated_qty, teacher_qty, source_type, source_detail_json, notes, sort_order
       FROM shopping_plan_items
       WHERE plan_id = $2`,
      [newPlan.id, planId]
    );

    return res.status(201).json({ success: true, plan: newPlan });
  } catch (err) {
    console.error('[shopping-plan] POST /:id/reopen error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ===========================================================================
// GET /api/shopping-plan/:id/technician-view
// Read-only finalized list grouped by category.
// Accessible to any logged-in user (no admin required).
// ===========================================================================
router.get('/:id/technician-view', async (req, res) => {
  const planId = parseInt(req.params.id, 10);
  if (!Number.isInteger(planId) || planId <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid plan ID.' });
  }

  try {
    const planRes = await pool.query(
      'SELECT id, week_ending, status, version, finalized_by, finalized_at, notes FROM shopping_plan WHERE id = $1',
      [planId]
    );
    if (planRes.rowCount === 0) return res.status(404).json({ success: false, error: 'Plan not found.' });

    const plan = planRes.rows[0];
    if (plan.status !== 'finalized') {
      return res.status(409).json({ success: false, error: 'This plan has not been finalized yet.' });
    }

    const itemsRes = await pool.query(
      `SELECT category, item_name, base_unit, final_qty, notes
       FROM shopping_plan_items
       WHERE plan_id = $1
       ORDER BY category, sort_order, id`,
      [planId]
    );

    // Group by category
    const grouped = {};
    for (const item of itemsRes.rows) {
      const cat = item.category || 'Uncategorised';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push({
        item_name: item.item_name,
        base_unit: item.base_unit,
        final_qty: item.final_qty,
        notes: item.notes
      });
    }

    return res.json({ success: true, plan, categories: grouped });
  } catch (err) {
    console.error('[shopping-plan] GET /:id/technician-view error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/shopping-plan/smoke-seed  (admin only)
// Creates minimal test recipes, bookings, and desired_servings_ingredients
// rows for Phase 4 guardrail smoke tests.  Returns the created IDs so the
// smoke script can reference them without a direct DB connection.
// ---------------------------------------------------------------------------
router.post('/smoke-seed', requireAdmin, async (req, res) => {
  const stamp = Date.now();
  try {
    const r1 = await pool.query(
      `INSERT INTO recipes (name, description, ingredients, serving_size, url)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [`Phase4 Smoke Recipe A ${stamp}`, 'phase4 smoke', 'sugar', null, 'https://example.com/a']
    );
    const r2 = await pool.query(
      `INSERT INTO recipes (name, description, ingredients, serving_size, url)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [`Phase4 Smoke Recipe B ${stamp}`, 'phase4 smoke', 'sugar', 8, 'https://example.com/b']
    );
    const recipeIdA = Number(r1.rows[0].id);
    const recipeIdB = Number(r2.rows[0].id);

    // Determine next Friday for the booking date
    const d = new Date();
    const day = d.getUTCDay();
    const add = day <= 5 ? 5 - day : 12 - day;
    d.setUTCDate(d.getUTCDate() + add);
    const friday = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

    const b1 = await pool.query(
      `INSERT INTO bookings (staff_name, class_name, booking_date, period, recipe, recipe_id, class_size, planner_stream)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      ['Phase4 Teacher', `PH4-A-${stamp}`, friday, 'P1', `Phase4 Smoke Recipe A ${stamp}`, recipeIdA, 20, 'Middle']
    );
    const b2 = await pool.query(
      `INSERT INTO bookings (staff_name, class_name, booking_date, period, recipe, recipe_id, class_size, planner_stream)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      ['Phase4 Teacher', `PH4-B-${stamp}`, friday, 'P2', `Phase4 Smoke Recipe B ${stamp}`, recipeIdB, 20, 'Middle']
    );
    const bookingId1 = Number(b1.rows[0].id);
    const bookingId2 = Number(b2.rows[0].id);

    await pool.query(
      `INSERT INTO desired_servings_ingredients
         (booking_id, ingredient_name, fooditem, stripfooditem, measure_qty, measure_unit, calculated_qty)
       VALUES
         ($1, 'Sugar', 'Sugar', 'Sugar', 1, 'tbsp', 1),
         ($2, 'Sugar', 'Sugar', 'Sugar', 2, 'tsp', 2),
         ($1, 'Flour', 'Flour', 'Flour', 1, 'kg', 1),
         ($2, 'Flour', 'Flour', 'Flour', 500, 'g', 500)`,
      [bookingId1, bookingId2]
    );

    return res.json({
      success: true,
      recipeIds: [recipeIdA, recipeIdB],
      bookingIds: [bookingId1, bookingId2],
      friday
    });
  } catch (err) {
    console.error('[shopping-plan] smoke-seed error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/shopping-plan/smoke-cleanup  (admin only)
// Deletes data created by smoke-seed. Expects { planIds, bookingIds, recipeIds }
// ---------------------------------------------------------------------------
router.post('/smoke-cleanup', requireAdmin, async (req, res) => {
  const { planIds = [], bookingIds = [], recipeIds = [] } = req.body || {};
  try {
    if (planIds.length) {
      await pool.query('DELETE FROM shopping_plan WHERE id = ANY($1::int[])', [planIds]);
    }
    if (bookingIds.length) {
      await pool.query('DELETE FROM desired_servings_ingredients WHERE booking_id = ANY($1::int[])', [bookingIds]);
      await pool.query('DELETE FROM bookings WHERE id = ANY($1::int[])', [bookingIds]);
    }
    if (recipeIds.length) {
      await pool.query('DELETE FROM recipes WHERE id = ANY($1::int[])', [recipeIds]);
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('[shopping-plan] smoke-cleanup error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

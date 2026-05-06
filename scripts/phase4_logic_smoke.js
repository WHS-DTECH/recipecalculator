function normalizeKey(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
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
  if (!Number.isFinite(qty)) return { qty: NaN, unit, family, wasConverted: false };
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
      errors.push(`\"${entry.item_name}\" in category \"${entry.category}\" uses incompatible units (${units.join(', ')}).`);
      return;
    }

    if (sameConvertibleFamily && units.length > 1) {
      warnings.push(`\"${entry.item_name}\" combines units (${units.join(', ')}) and is auto-converted.`);
    }
  });

  return { warnings, errors };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function check1() {
  const dsi = [
    { item_name: 'Sugar', category: 'Pantry', qty: 1, unit: 'tbsp' },
    { item_name: 'Sugar', category: 'Pantry', qty: 2, unit: 'tsp' },
    { item_name: 'Flour', category: 'Pantry', qty: 1, unit: 'kg' },
    { item_name: 'Flour', category: 'Pantry', qty: 500, unit: 'g' }
  ];

  const map = new Map();
  for (const r of dsi) {
    const c = toCanonicalQty(r.qty, r.unit);
    const key = `${normalizeKey(r.item_name)}||${normalizeKey(r.category)}||${normalizeKey(c.unit)}`;
    if (!map.has(key)) map.set(key, { item_name: r.item_name, category: r.category, base_unit: c.unit, calculated_qty: 0 });
    map.get(key).calculated_qty += c.qty;
  }

  const items = Array.from(map.values());
  const sugar = items.find((i) => i.item_name === 'Sugar');
  const flour = items.find((i) => i.item_name === 'Flour');

  assert(sugar && sugar.base_unit === 'tsp', 'Check1: Sugar canonical unit should be tsp');
  assert(Math.abs(sugar.calculated_qty - 5) < 0.0001, `Check1: Sugar qty expected 5, got ${sugar && sugar.calculated_qty}`);
  assert(flour && flour.base_unit === 'g', 'Check1: Flour canonical unit should be g');
  assert(Math.abs(flour.calculated_qty - 1500) < 0.0001, `Check1: Flour qty expected 1500, got ${flour && flour.calculated_qty}`);

  return { sugar, flour };
}

function check2() {
  const items = [
    { item_name: 'Milk Guardrail', category: 'Dairy', base_unit: 'ml' },
    { item_name: 'Milk Guardrail', category: 'Dairy', base_unit: 'g' }
  ];

  const diag = buildUnitCompatibilityDiagnostics(items);
  assert(diag.errors.length > 0, 'Check2: incompatible unit error should be produced');
  return diag.errors[0];
}

function check3() {
  const baseQty = 5;
  const defaultBufferPercent = 10;
  const bufferedQty = Math.round((baseQty * (1 + defaultBufferPercent / 100)) * 10000) / 10000;
  const ratio = bufferedQty / baseQty;
  assert(bufferedQty > baseQty, 'Check3: buffered qty should be greater than base qty');
  assert(ratio > 1.09 && ratio < 1.11, `Check3: expected ~1.10 ratio, got ${ratio}`);
  return { baseQty, bufferedQty, ratio };
}

try {
  const r1 = check1();
  const r2 = check2();
  const r3 = check3();
  console.log('PHASE4_LOGIC_SMOKE_PASS');
  console.log(JSON.stringify({
    check1: r1,
    check2: r2,
    check3: r3
  }, null, 2));
} catch (err) {
  console.error('PHASE4_LOGIC_SMOKE_FAIL');
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
}

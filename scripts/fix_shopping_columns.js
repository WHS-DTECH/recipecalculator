// One-time script: update book_the_shopping.js teacher/category table columns
// This script applies CRLF-safe replacements to book_the_shopping.js
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../backend/public/book_the_shopping.js');
let src = fs.readFileSync(filePath, 'utf8');
// Normalise to LF for matching, remember original EOL style
const hasCRLF = src.includes('\r\n');
src = src.replace(/\r\n/g, '\n');

// ── Shared replacement fragments ───────────────────────────────────────────
const NEW_COLGROUP = '<colgroup><col style="width:10%;"><col style="width:12%;"><col style="width:78%;"></colgroup>';

// ── 1. renderTeacherListHtmlByData ─────────────────────────────────────────
const OLD_TEACHER_RENDER_TABLE = `        html += '<table style="width:100%;border-collapse:collapse;margin-bottom:0.7em;">';
        html += '<thead><tr style="background:#e3e3e3;">';
        html += '<th style="text-align:left;padding:0.5em 1.5em;min-width:180px;white-space:nowrap;">Ingredient</th>';
        html += '<th style="text-align:left;padding:0.5em 1em;min-width:60px;white-space:nowrap;">Qty</th>';
        html += '<th style="text-align:left;padding:0.5em 1em;min-width:80px;white-space:nowrap;">Unit</th>';
        html += '<th style="text-align:left;padding:0.5em 1em;min-width:140px;white-space:nowrap;">SplitFoodItem</th>';
        html += '<th style="text-align:left;padding:0.5em 1em;min-width:120px;white-space:nowrap;">Calculated Qty</th>';
        html += '</tr></thead><tbody>';
        let rowNum = 0;
        for (const item of data.data[teacherKey]) {
            html += \`<tr style="background:\${rowNum % 2 === 0 ? '#fff' : '#f6f8fa'};">\`;
            html += \`<td style="padding:0.5em 1.5em;min-width:180px;white-space:nowrap;">\${getTeacherListDisplayIngredient(item)}</td>\`;
            html += \`<td style="padding:0.5em 1em;min-width:60px;white-space:nowrap;">\${item.qty || ''}</td>\`;
            html += \`<td style="padding:0.5em 1em;min-width:80px;white-space:nowrap;">\${item.unit || ''}</td>\`;
            html += \`<td style="padding:0.5em 1em;min-width:140px;white-space:nowrap;">\${item.stripFoodItem || ''}</td>\`;
            html += \`<td style="padding:0.5em 1em;min-width:120px;white-space:nowrap;">\${item.calculated_qty || ''}</td>\`;
            html += '</tr>';
            rowNum++;
        }`;

const NEW_TEACHER_RENDER_TABLE = `        html += '<table style="width:100%;border-collapse:collapse;margin-bottom:0.7em;table-layout:fixed;">';
        html += '${NEW_COLGROUP}';
        html += '<thead><tr style="background:#e3e3e3;">';
        html += '<th style="text-align:right;padding:0.5em 0.6em;">Qty</th>';
        html += '<th style="text-align:left;padding:0.5em 0.6em;">Unit</th>';
        html += '<th style="text-align:left;padding:0.5em 0.8em;">Item</th>';
        html += '</tr></thead><tbody>';
        let rowNum = 0;
        for (const item of data.data[teacherKey]) {
            html += \`<tr style="background:\${rowNum % 2 === 0 ? '#fff' : '#f6f8fa'}">\`;
            html += \`<td style="padding:0.5em 0.6em;text-align:right;">\${item.qty || ''}</td>\`;
            html += \`<td style="padding:0.5em 0.6em;">\${item.unit || ''}</td>\`;
            html += \`<td style="padding:0.5em 0.8em;">\${getTeacherListDisplayIngredient(item)}</td>\`;
            html += '</tr>';
            rowNum++;
        }`;

// ── 2. Inline generateByTeacherBtn handler ─────────────────────────────────
const OLD_TEACHER_INLINE_TABLE = `                            html += \`<table style="width:100%;border-collapse:collapse;margin-bottom:0.7em;">\`;
                            html += \`<thead><tr style="background:#e3e3e3;">\`;
                            html += '<th style="text-align:left;padding:0.5em 1.5em;min-width:180px;white-space:nowrap;">Ingredient</th>';
                            html += '<th style="text-align:left;padding:0.5em 1em;min-width:60px;white-space:nowrap;">Qty</th>';
                            html += '<th style="text-align:left;padding:0.5em 1em;min-width:80px;white-space:nowrap;">Unit</th>';
                            html += '<th style="text-align:left;padding:0.5em 1em;min-width:140px;white-space:nowrap;">SplitFoodItem</th>';
                            html += '<th style="text-align:left;padding:0.5em 1em;min-width:120px;white-space:nowrap;">Calculated Qty</th>';
                            html += '</tr></thead><tbody>';
                            let rowNum = 0;
                            for (const item of data.data[teacherKey]) {
                                html += \`<tr style="background:\${rowNum % 2 === 0 ? '#fff' : '#f6f8fa'};">\`;
                                html += \`<td style="padding:0.5em 1.5em;min-width:180px;white-space:nowrap;">\${getTeacherListDisplayIngredient(item)}</td>\`;
                                html += \`<td style="padding:0.5em 1em;min-width:60px;white-space:nowrap;">\${item.qty || ''}</td>\`;
                                html += \`<td style="padding:0.5em 1em;min-width:80px;white-space:nowrap;">\${item.unit || ''}</td>\`;
                                html += \`<td style="padding:0.5em 1em;min-width:140px;white-space:nowrap;">\${item.stripFoodItem || ''}</td>\`;
                                html += \`<td style="padding:0.5em 1em;min-width:120px;white-space:nowrap;">\${item.calculated_qty || ''}</td>\`;
                                html += '</tr>';
                                rowNum++;
                            }`;

const NEW_TEACHER_INLINE_TABLE = `                            html += '<table style="width:100%;border-collapse:collapse;margin-bottom:0.7em;table-layout:fixed;">';
                            html += '${NEW_COLGROUP}';
                            html += '<thead><tr style="background:#e3e3e3;">';
                            html += '<th style="text-align:right;padding:0.5em 0.6em;">Qty</th>';
                            html += '<th style="text-align:left;padding:0.5em 0.6em;">Unit</th>';
                            html += '<th style="text-align:left;padding:0.5em 0.8em;">Item</th>';
                            html += '</tr></thead><tbody>';
                            let rowNum = 0;
                            for (const item of data.data[teacherKey]) {
                                html += \`<tr style="background:\${rowNum % 2 === 0 ? '#fff' : '#f6f8fa'}">\`;
                                html += \`<td style="padding:0.5em 0.6em;text-align:right;">\${item.qty || ''}</td>\`;
                                html += \`<td style="padding:0.5em 0.6em;">\${item.unit || ''}</td>\`;
                                html += \`<td style="padding:0.5em 0.8em;">\${getTeacherListDisplayIngredient(item)}</td>\`;
                                html += '</tr>';
                                rowNum++;
                            }`;

// ── 3. Inline generateByCategoryBtn handler ────────────────────────────────
const OLD_CAT_INLINE_TABLE = `                                html += \`<table class="shopping-category-table" style="margin-bottom:1em;width:100%;border-collapse:collapse;">\`;
                                html += \`<thead><tr style="background:#e3e3e3;">\`;
                                html += '<th style="text-align:left;padding:0.5em 0.8em;">Item</th>';
                                html += '<th style="text-align:right;padding:0.5em 0.6em;">Qty</th>';
                                html += '<th style="text-align:left;padding:0.5em 0.6em;">Unit</th>';
                                html += '</tr></thead><tbody>';
                                sortedItems.forEach((item, idx) => {
                                    html += \`<tr style="background:\${idx % 2 === 0 ? '#fff' : '#f6f8fa'};">\`;
                                    html += \`<td style="padding:0.5em 0.8em;">\${item.display}</td>\`;
                                    html += \`<td style="padding:0.5em 0.6em;text-align:right;">\${item.qty}</td>\`;
                                    html += \`<td style="padding:0.5em 0.6em;">\${item.unit}</td>\`;
                                    html += '</tr>';
                                });`;

const NEW_CAT_INLINE_TABLE = `                                html += '<table class="shopping-category-table" style="margin-bottom:1em;width:100%;border-collapse:collapse;table-layout:fixed;">';
                                html += '${NEW_COLGROUP}';
                                html += '<thead><tr style="background:#e3e3e3;">';
                                html += '<th style="text-align:right;padding:0.5em 0.6em;">Qty</th>';
                                html += '<th style="text-align:left;padding:0.5em 0.6em;">Unit</th>';
                                html += '<th style="text-align:left;padding:0.5em 0.8em;">Item</th>';
                                html += '</tr></thead><tbody>';
                                sortedItems.forEach((item, idx) => {
                                    html += \`<tr style="background:\${idx % 2 === 0 ? '#fff' : '#f6f8fa'}">\`;
                                    html += \`<td style="padding:0.5em 0.6em;text-align:right;">\${item.qty}</td>\`;
                                    html += \`<td style="padding:0.5em 0.6em;">\${item.unit}</td>\`;
                                    html += \`<td style="padding:0.5em 0.8em;">\${item.display}</td>\`;
                                    html += '</tr>';
                                });`;

// ── Apply replacements ─────────────────────────────────────────────────────
let count = 0;

function replace(old, next, label) {
  if (src.includes(old)) {
    src = src.replace(old, next);
    console.log('✔ Replaced:', label);
    count++;
  } else {
    console.warn('✘ NOT FOUND:', label);
    // Print first 80 chars of old for debugging
    console.warn('  Looking for (first 80):', JSON.stringify(old.substring(0, 80)));
  }
}

replace(OLD_TEACHER_RENDER_TABLE, NEW_TEACHER_RENDER_TABLE, 'renderTeacherListHtmlByData table');
replace(OLD_TEACHER_INLINE_TABLE, NEW_TEACHER_INLINE_TABLE, 'generateByTeacherBtn inline table');
replace(OLD_CAT_INLINE_TABLE, NEW_CAT_INLINE_TABLE, 'generateByCategoryBtn inline table');

if (count > 0) {
  // Restore original EOL style
  const out = hasCRLF ? src.replace(/\n/g, '\r\n') : src;
  fs.writeFileSync(filePath, out, 'utf8');
  console.log(`\nWrote ${count} replacement(s) to file.`);
} else {
  console.log('\nNo replacements made.');
}

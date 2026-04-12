// Applies print-header / page-number / logo changes to book_the_shopping.js
// Run once: node scripts/fix_print_headers.js
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../backend/public/book_the_shopping.js');
let src = fs.readFileSync(filePath, 'utf8');
const hasCRLF = src.includes('\r\n');
src = src.replace(/\r\n/g, '\n'); // normalise to LF for matching

// ── 1. printCombinedWeekLists ──────────────────────────────────────────────
const OLD_COMBINED = `function printCombinedWeekLists(teacherHtml, categoryHtml, mondayDate) {
    const weekStart = new Date(mondayDate);
    const weekEnd = new Date(mondayDate);
    weekEnd.setDate(weekStart.getDate() + 6);
    const printDate = new Date().toLocaleDateString();

    const win = window.open('', '', 'width=1100,height=800');
    if (!win) {
        alert('Please allow pop-ups to print the weekly lists.');
        return;
    }
    win.document.write('<html><head><title>Auto Week List - ' + formatDateDMY(weekStart) + ' to ' + formatDateDMY(weekEnd) + '</title>');
    win.document.write('<style>body{font-family:sans-serif;} h1,h2,h3{margin:0.5em 0;} table{width:100%;border-collapse:collapse;} th,td{border:1px solid #888;padding:0.3em 0.7em;} th{background:#e3e3e3;} tr:nth-child(even){background:#f6f8fa;} .section{margin-bottom:1.8em;} .print-header{margin-bottom:1.5em;border-bottom:2px solid #888;padding-bottom:0.5em;} .meta{color:#444;} </style>');
    win.document.write('</head><body>');
    win.document.write('<div class="print-header"><h1>Weekly Shopping Lists</h1><div class="meta"><strong>Week:</strong> ' + formatDateDMY(weekStart) + ' to ' + formatDateDMY(weekEnd) + ' | <strong>Printed:</strong> ' + printDate + '</div></div>');
    win.document.write('<div class="section"><h2>Shopping List by Teacher</h2>' + teacherHtml + '</div>');
    win.document.write('<div class="section"><h2>Shopping List by Category</h2>' + categoryHtml + '</div>');
    win.document.write('</body></html>');
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 300);
}`;

const NEW_COMBINED = `function printCombinedWeekLists(teacherHtml, categoryHtml, mondayDate) {
    const weekStart = new Date(mondayDate);
    const weekEnd = new Date(mondayDate);
    weekEnd.setDate(weekStart.getDate() + 6);
    const printDate = new Date().toLocaleDateString();
    const weekLabel = formatDateDMY(weekStart) + ' to ' + formatDateDMY(weekEnd);
    const logoUrl = window.location.origin + '/images/whs%20logo%20circular%20reo%20.png';

    const win = window.open('', '', 'width=1100,height=800');
    if (!win) {
        alert('Please allow pop-ups to print the weekly lists.');
        return;
    }
    win.document.write('<!DOCTYPE html><html><head><title>Auto Week List - ' + weekLabel + '</title>');
    win.document.write('<style>');
    win.document.write('@page{margin:2.8cm 1.5cm 1.8cm 1.5cm;}');
    win.document.write('@page{@bottom-right{content:"Page " counter(page) " of " counter(pages);font-size:8pt;color:#555;}}');
    win.document.write('body{font-family:sans-serif;margin:0;padding:0;}');
    win.document.write('.running-header{position:fixed;top:0;left:0;right:0;display:flex;align-items:center;gap:0.6em;padding:0.3em 0.8em 0.4em;border-bottom:2px solid #1a237e;background:#fff;font-size:9pt;}');
    win.document.write('.running-header img{height:40px;width:40px;object-fit:contain;}');
    win.document.write('.running-header-title{font-weight:700;font-size:11pt;flex:1;color:#1a237e;}');
    win.document.write('.running-header-meta{color:#555;font-size:8.5pt;text-align:right;white-space:nowrap;}');
    win.document.write('.body-content{margin-top:3.8em;}');
    win.document.write('h2,h3{margin:0.5em 0;}');
    win.document.write('table{width:100%;border-collapse:collapse;}');
    win.document.write('th,td{border:1px solid #888;padding:0.3em 0.7em;}');
    win.document.write('th{background:#e3e3e3;}');
    win.document.write('tr:nth-child(even){background:#f6f8fa;}');
    win.document.write('.section{margin-bottom:1.8em;}');
    win.document.write('.category-section{break-before:page;page-break-before:always;}');
    win.document.write('</style>');
    win.document.write('</head><body>');
    win.document.write('<div class="running-header">');
    win.document.write('<img src="' + logoUrl + '" alt="WHS Logo" />');
    win.document.write('<span class="running-header-title">Weekly Shopping Lists \u2014 Auto Week List</span>');
    win.document.write('<span class="running-header-meta">Week: ' + weekLabel + '&nbsp;&nbsp;|&nbsp;&nbsp;Printed: ' + printDate + '</span>');
    win.document.write('</div>');
    win.document.write('<div class="body-content">');
    win.document.write('<div class="section"><h2>Shopping List by Teacher</h2>' + teacherHtml + '</div>');
    win.document.write('<div class="section category-section"><h2>Shopping List by Category</h2>' + categoryHtml + '</div>');
    win.document.write('</div>');
    win.document.write('</body></html>');
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 300);
}`;

// ── 2. printArea ───────────────────────────────────────────────────────────
const OLD_PRINT_AREA = `function printArea(areaId, title, extraTitle) {
    const area = document.getElementById(areaId);
    if (!area) return;
    // Compose print content
    const win = window.open('', '', 'width=900,height=700');
    // Add print date
    const printDate = new Date().toLocaleDateString();
    let fullTitle = title || 'Print';
    if (extraTitle) fullTitle += ' - ' + extraTitle;
    fullTitle += ' - ' + printDate;
    win.document.write('<html><head><title>' + fullTitle + '</title>');
    win.document.write('<style>body{font-family:sans-serif;} h1,h2{margin:0.5em 0;} table{width:100%;border-collapse:collapse;} th,td{border:1px solid #888;padding:0.3em 0.7em;} th{background:#e3e3e3;} tr:nth-child(even){background:#f6f8fa;} .section{margin-bottom:1.5em;} .print-header{margin-bottom:1.5em;border-bottom:2px solid #888;padding-bottom:0.5em;} .print-bookings{margin-bottom:1em;} </style>');
    win.document.write('</head><body>');
    win.document.write('<div class="print-header"><h1>Weekly Shopping List</h1>' + getWeekLabel() + '</div>');
    win.document.write('<div class="print-bookings">' + getSelectedBookingsHTML() + '</div>');
    win.document.write('<div id="printArea">' + area.innerHTML + '</div>');
    win.document.write('</body></html>');
    win.document.close();
    win.focus();
    setTimeout(()=>{ win.print(); win.close(); }, 300);
}`;

const NEW_PRINT_AREA = `function printArea(areaId, title, extraTitle) {
    const area = document.getElementById(areaId);
    if (!area) return;
    const win = window.open('', '', 'width=900,height=700');
    const printDate = new Date().toLocaleDateString();
    let fullTitle = title || 'Print';
    if (extraTitle) fullTitle += ' - ' + extraTitle;
    fullTitle += ' - ' + printDate;
    const logoUrl = window.location.origin + '/images/whs%20logo%20circular%20reo%20.png';
    const weekLabelEl = document.getElementById('calendarWeekLabel');
    const weekText = weekLabelEl ? 'Week: ' + weekLabelEl.textContent.trim() : '';
    win.document.write('<!DOCTYPE html><html><head><title>' + fullTitle + '</title>');
    win.document.write('<style>');
    win.document.write('@page{margin:2.8cm 1.5cm 1.8cm 1.5cm;}');
    win.document.write('@page{@bottom-right{content:"Page " counter(page) " of " counter(pages);font-size:8pt;color:#555;}}');
    win.document.write('body{font-family:sans-serif;margin:0;padding:0;}');
    win.document.write('.running-header{position:fixed;top:0;left:0;right:0;display:flex;align-items:center;gap:0.6em;padding:0.3em 0.8em 0.4em;border-bottom:2px solid #1a237e;background:#fff;font-size:9pt;}');
    win.document.write('.running-header img{height:40px;width:40px;object-fit:contain;}');
    win.document.write('.running-header-title{font-weight:700;font-size:11pt;flex:1;color:#1a237e;}');
    win.document.write('.running-header-meta{color:#555;font-size:8.5pt;text-align:right;white-space:nowrap;}');
    win.document.write('.body-content{margin-top:3.8em;}');
    win.document.write('h2,h3{margin:0.5em 0;}');
    win.document.write('table{width:100%;border-collapse:collapse;}');
    win.document.write('th,td{border:1px solid #888;padding:0.3em 0.7em;}');
    win.document.write('th{background:#e3e3e3;}');
    win.document.write('tr:nth-child(even){background:#f6f8fa;}');
    win.document.write('.section{margin-bottom:1.5em;}');
    win.document.write('</style>');
    win.document.write('</head><body>');
    win.document.write('<div class="running-header">');
    win.document.write('<img src="' + logoUrl + '" alt="WHS Logo" />');
    win.document.write('<span class="running-header-title">' + (title || 'Weekly Shopping List') + (extraTitle ? ' \u2014 ' + extraTitle : '') + '</span>');
    win.document.write('<span class="running-header-meta">' + (weekText ? weekText + '&nbsp;&nbsp;|&nbsp;&nbsp;' : '') + 'Printed: ' + printDate + '</span>');
    win.document.write('</div>');
    win.document.write('<div class="body-content">');
    win.document.write('<div id="printArea">' + area.innerHTML + '</div>');
    win.document.write('</div>');
    win.document.write('</body></html>');
    win.document.close();
    win.focus();
    setTimeout(()=>{ win.print(); win.close(); }, 300);
}`;

// ── Apply ──────────────────────────────────────────────────────────────────
let count = 0;

function replace(old, next, label) {
    if (src.includes(old)) {
        src = src.replace(old, next);
        console.log('✔ Replaced:', label);
        count++;
    } else {
        console.warn('✘ NOT FOUND:', label);
        console.warn('  First 100 chars:', JSON.stringify(old.substring(0, 100)));
    }
}

replace(OLD_COMBINED, NEW_COMBINED, 'printCombinedWeekLists');
replace(OLD_PRINT_AREA, NEW_PRINT_AREA, 'printArea');

if (count > 0) {
    const out = hasCRLF ? src.replace(/\n/g, '\r\n') : src;
    fs.writeFileSync(filePath, out, 'utf8');
    console.log(`\nWrote ${count} replacement(s) to file.`);
} else {
    console.log('\nNo replacements applied.');
}

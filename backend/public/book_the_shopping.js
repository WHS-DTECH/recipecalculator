// --- Shopping List By Category ---
async function generateShoppingListByCategory(bookingIds) {
  if (!bookingIds || !bookingIds.length) return;
  const url = `/api/ingredients/shopping_list/by_category?booking_ids=${bookingIds.join(',')}`;
  try {
    const resp = await fetch(url);
    const data = await resp.json();
    container.innerHTML = html;
  } catch (err) {
    console.error('Error fetching shopping list by teacher:', err);
  }
}

// Helper to get selected bookings as HTML
function getSelectedBookingsHTML() {
    const sel = document.querySelector('.shopping-app .calendar-app + div') || document.querySelector('.shopping-app');
    const links = Array.from(document.querySelectorAll('.shopping-app a')).map(a => `<li>${a.outerHTML}</li>`).join('');
    return `<div style="margin-bottom:1em;"><strong>Selected Bookings</strong><ul>${links}</ul></div>`;
}

// Helper to get week label
function getWeekLabel() {
    const label = document.getElementById('calendarWeekLabel');
    return label ? `<div style='margin-bottom:1em;'><strong>Week:</strong> ${label.textContent}</div>` : '';
}

// Print function for a given area
function printArea(areaId, title, extraTitle) {
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
}

document.addEventListener('DOMContentLoaded',()=>{
    // Tab switching logic
        // Print buttons
        const printByTeacherBtn = document.getElementById('printByTeacherBtn');
        if (printByTeacherBtn) {
            printByTeacherBtn.onclick = function() {
                // Get all teacher headings in the rendered HTML (should be only the teacher name, not table headers)
                const teacherHeaders = document.querySelectorAll('#by-teacher-ingredients > div > div');
                let teacherName = '';
                if (teacherHeaders.length === 1) {
                    teacherName = teacherHeaders[0].childNodes[0] ? teacherHeaders[0].childNodes[0].textContent.trim() : teacherHeaders[0].textContent.trim();
                } else if (teacherHeaders.length > 1) {
                    teacherName = 'Multiple Teachers';
                } else {
                    teacherName = '';
                }
                // Remove any problematic characters for filenames
                teacherName = teacherName.replace(/[^a-zA-Z0-9 _\-()]/g, '');
                printArea('printByTeacherArea', 'Shopping List by Teacher', teacherName);
            };
        }
        const printByCategoryBtn = document.getElementById('printByCategoryBtn');
        if (printByCategoryBtn) {
            printByCategoryBtn.onclick = function() {
                printArea('printByCategoryArea', 'Shopping List by Category');
            };
        }
    const tabByTeacher = document.getElementById('tabByTeacher');
    const tabByCategory = document.getElementById('tabByCategory');
    const tabContentByTeacher = document.getElementById('tabContentByTeacher');
    const tabContentByCategory = document.getElementById('tabContentByCategory');
    tabByTeacher.onclick = function() {
        tabByTeacher.classList.add('active');
        tabByCategory.classList.remove('active');
        tabContentByTeacher.style.display = '';
        tabContentByCategory.style.display = 'none';
    };
    tabByCategory.onclick = function() {
        tabByCategory.classList.add('active');
        tabByTeacher.classList.remove('active');
        tabContentByCategory.style.display = '';
        tabContentByTeacher.style.display = 'none';
    };

    // Wire up Generate Shopping List by Teacher button
    const btnTeacher = document.getElementById('generateByTeacherBtn');
    if (btnTeacher) {
        btnTeacher.onclick = async function() {
            console.log('[DEBUG] Generate Shopping List button clicked');
            let bookingIds = (window.selectedBookingIds && window.selectedBookingIds.length) ? window.selectedBookingIds : [];
            bookingIds = bookingIds.map(id => String(id));
            if (!bookingIds.length) {
                alert('Please select at least one booking from the calendar.');
                return;
            }
            const container = document.getElementById('by-teacher-ingredients');
            if (container) {
                container.innerHTML = '<em>Loading shopping list...</em>';
            }
            try {
                const response = await fetch(`/api/ingredients/shopping_list/by_teacher?booking_ids=${bookingIds.join(',')}`);
                if (!response.ok) {
                    throw new Error('API request failed with status ' + response.status);
                }
                const data = await response.json();
                if (container) {
                    if (data && data.success && data.data && Object.keys(data.data).length > 0) {
                        let html = '<div style="margin-bottom:2em;max-width:900px;margin-left:auto;margin-right:auto;">';
                        for (const teacherKey of Object.keys(data.data)) {
                            html += `<div style="margin-bottom:2em;">`;
                            html += `<div style="font-weight:bold;font-size:1.15em;margin-bottom:0.7em;color:#1976d2;">${teacherKey}</div>`;
                            html += `<table style="width:100%;border-collapse:collapse;margin-bottom:0.7em;">`;
                            html += `<thead><tr style="background:#e3e3e3;">`;
                            html += '<th style="text-align:left;padding:0.5em 1.5em;min-width:180px;white-space:nowrap;">Ingredient</th>';
                            html += '<th style="text-align:left;padding:0.5em 1em;min-width:60px;white-space:nowrap;">Qty</th>';
                            html += '<th style="text-align:left;padding:0.5em 1em;min-width:80px;white-space:nowrap;">Unit</th>';
                            html += '<th style="text-align:left;padding:0.5em 1em;min-width:140px;white-space:nowrap;">SplitFoodItem</th>';
                            html += '<th style="text-align:left;padding:0.5em 1em;min-width:120px;white-space:nowrap;">Calculated Qty</th>';
                            html += '</tr></thead><tbody>';
                            let rowNum = 0;
                            for (const item of data.data[teacherKey]) {
                                html += `<tr style="background:${rowNum % 2 === 0 ? '#fff' : '#f6f8fa'};">`;
                                html += `<td style="padding:0.5em 1.5em;min-width:180px;white-space:nowrap;">${item.ingredient || ''}</td>`;
                                html += `<td style="padding:0.5em 1em;min-width:60px;white-space:nowrap;">${item.qty || ''}</td>`;
                                html += `<td style="padding:0.5em 1em;min-width:80px;white-space:nowrap;">${item.unit || ''}</td>`;
                                html += `<td style="padding:0.5em 1em;min-width:140px;white-space:nowrap;">${item.stripFoodItem || ''}</td>`;
                                html += `<td style="padding:0.5em 1em;min-width:120px;white-space:nowrap;">${item.calculated_qty || ''}</td>`;
                                html += '</tr>';
                                rowNum++;
                            }
                            html += '</tbody></table>';
                            html += '</div>';
                        }
                        html += '</div>';
                        container.innerHTML = html;
                    } else {
                        container.innerHTML = '<em>No shopping list data returned.</em>';
                    }
                }
            } catch (err) {
                console.error('[ERROR] Fetching shopping list failed:', err);
                if (container) {
                    container.innerHTML = '<span style="color:red">Error fetching shopping list: ' + err.message + '</span>';
                }
            }
        };
    }

    // Wire up Generate Shopping List by Category button
    const btnCat = document.getElementById('generateByCategoryBtn');
    if (btnCat) {
        btnCat.onclick = async function() {
            console.log('[DEBUG] Generate Shopping List by Category button clicked');
            let bookingIds = (window.selectedBookingIds && window.selectedBookingIds.length) ? window.selectedBookingIds : [];
            bookingIds = bookingIds.map(id => String(id));
            const container = document.getElementById('by-category-ingredients');
            if (!bookingIds.length) {
                if (container) container.innerHTML = '<em>Please select at least one booking from the calendar.</em>';
                return;
            }
            if (container) container.innerHTML = '<em>Loading shopping list by category...</em>';
            try {
                const response = await fetch(`/api/ingredients/shopping_list/by_category?booking_ids=${bookingIds.join(',')}`);
                const data = await response.json();
                if (container) {
                    if (data && data.success && data.data) {
                        let html = '';
                        const aisleOrder = ['Produce','Dairy','Pantry','Other','Action'];
                        for (const cat of aisleOrder) {
                            if (data.data[cat] && data.data[cat].length > 0) {
                                html += `<h4 style="margin-bottom:0.3em;">${cat}</h4>`;
                                html += `<table style="margin-bottom:1em;width:100%;border-collapse:collapse;">`;
                                html += `<thead><tr style="background:#e3e3e3;">`;
                                html += '<th style="text-align:left;padding:0.5em 1em;min-width:140px;">SplitFoodItem</th>';
                                html += '<th style="text-align:right;padding:0.5em 1em;min-width:60px;">Qty</th>';
                                html += '<th style="text-align:left;padding:0.5em 1em;min-width:80px;">Unit</th>';
                                html += '</tr></thead><tbody>';
                                data.data[cat].forEach((item, idx) => {
                                    html += `<tr style="background:${idx % 2 === 0 ? '#fff' : '#f6f8fa'};">`;
                                    html += `<td style="padding:0.5em 1em;">${item.display}</td>`;
                                    html += `<td style="padding:0.5em 1em;text-align:right;">${item.qty}</td>`;
                                    html += `<td style="padding:0.5em 1em;">${item.unit}</td>`;
                                    html += '</tr>';
                                });
                                html += '</tbody></table>';
                            }
                        }
                        if (!html) html = '<em>No items found for selected bookings.</em>';
                        container.innerHTML = html;
                    } else {
                        container.innerHTML = '<em>No shopping list data returned.</em>';
                    }
                }
            } catch (err) {
                console.error('[ERROR] Fetching shopping list by category failed:', err);
                if (container) {
                    container.innerHTML = '<span style="color:red">Error fetching shopping list: ' + err.message + '</span>';
                }
            }
        };
    }

    // Wire up tab switching for original/calculated view
    if(document.getElementById('tabOriginal')){
        document.getElementById('tabOriginal').onclick = ()=>{
            document.getElementById('tabOriginal').classList.add('active');
            document.getElementById('tabCalculated').classList.remove('active');
            renderCalcPanelContent('original');
        };
    }
    if(document.getElementById('tabCalculated')){
        document.getElementById('tabCalculated').onclick = ()=>{
            document.getElementById('tabCalculated').classList.add('active');
            document.getElementById('tabOriginal').classList.remove('active');
            renderCalcPanelContent('calculated');
        };
    }
});

// Removed static renderCalendar and demo data to prevent overwriting dynamic calendar.

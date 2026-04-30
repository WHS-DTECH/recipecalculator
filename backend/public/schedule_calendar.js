
function escHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Locale-aware date formatting using the browser's regional settings
const userLocale = (navigator.languages && navigator.languages[0]) || navigator.language || undefined;
const shortDateFormatter = new Intl.DateTimeFormat(userLocale, {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit'
});
const longDateFormatter = new Intl.DateTimeFormat(userLocale, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric'
});
const weekdayFormatter = new Intl.DateTimeFormat(userLocale, { weekday: 'long' });
const WEEK_DAYS_COUNT = 7;
const bookingPageLabel = (window && window.bookingPageLabel) ? String(window.bookingPageLabel) : 'Load Booking';
const bookClassSharedStateKey = 'bookClassEmbedSharedState';
const bookClassSharedChannelName = 'bookClassEmbedSharedChannel';
const scheduleViewModeStorageKey = 'scheduleViewMode';
const scheduleCalendarSourceId = `schedule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const scheduleCalendarSharedChannel = ('BroadcastChannel' in window)
  ? new BroadcastChannel(bookClassSharedChannelName)
  : null;
let lastCalendarRefreshSignalAt = 0;
let scheduleViewMode = (() => {
  const saved = String(localStorage.getItem(scheduleViewModeStorageKey) || '').trim().toLowerCase();
  return saved === 'recipe' ? 'recipe' : 'class';
})();

function getCellPrimaryText(booking) {
  if (scheduleViewMode === 'recipe') {
    const recipeLabel = String(booking.recipe || '').trim();
    return recipeLabel ? `Recipe: ${recipeLabel}` : `Class: ${booking.class_name || ''}`;
  }
  return `Class: ${booking.class_name || ''}`;
}

function publishBookingToBookClassForm(booking) {
  if (!booking) return;
  const sharedState = {
    sourceId: scheduleCalendarSourceId,
    updatedAt: Date.now(),
    staffId: String(booking.staff_id || ''),
    className: String(booking.class_name || ''),
    bookingDate: String(booking.booking_date || ''),
    period: String(booking.period || ''),
    recipeId: booking.recipe_id != null ? String(booking.recipe_id) : '',
    classSize: booking.class_size != null ? String(booking.class_size) : '',
    editBookingId: String(booking.id || '')
  };
  localStorage.setItem(bookClassSharedStateKey, JSON.stringify(sharedState));
  if (scheduleCalendarSharedChannel) {
    scheduleCalendarSharedChannel.postMessage(sharedState);
  }
}

function toLocalIsoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function normalizePlannerStream(booking) {
  const explicit = String(booking && booking.planner_stream ? booking.planner_stream : '').trim().toLowerCase();
  if (explicit === 'junior') return 'Junior';
  if (explicit === 'senior') return 'Senior';
  if (explicit === 'middle') return 'Middle';

  const className = String(booking && booking.class_name ? booking.class_name : '').toLowerCase();
  if (/(^|\b)jfood(\b|$)|junior/.test(className)) return 'Junior';
  if (/(^|\b)hosp(\b|$)|senior|hp100/.test(className)) return 'Senior';
  return 'Middle';
}

function plannerChipStyle(stream) {
  if (stream === 'Junior') return { bg: '#dcfce7', border: '#86efac', text: '#166534' };
  if (stream === 'Senior') return { bg: '#ffedd5', border: '#fdba74', text: '#9a3412' };
  return { bg: '#dbeafe', border: '#93c5fd', text: '#1e40af' };
}

function isPlannerLikeBooking(booking) {
  const period = String(booking && booking.period ? booking.period : '').trim().toLowerCase();
  if (period === 'planner') return true;

  const hasTeacher = Boolean(String(booking && booking.staff_id ? booking.staff_id : '').trim() ||
    String(booking && booking.staff_name ? booking.staff_name : '').trim());
  if (hasTeacher) return false;

  const className = String(booking && booking.class_name ? booking.class_name : '').trim().toUpperCase();
  return className === 'MFOOD' || className === 'JFOOD' || className === 'HOSP';
}

  // Snap a Saturday (+2) or Sunday (+1) date string to the following Monday
  function snapToNearestMonday(isoDate) {
    const d = new Date(isoDate + 'T00:00:00');
    const dow = d.getDay();
    if (dow === 0) d.setDate(d.getDate() + 1);
    else if (dow === 6) d.setDate(d.getDate() + 2);
    return toLocalIsoDate(d);
  }

function parseLocalIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function getRegionalWeekStartDay() {
  try {
    const locale = new Intl.Locale(userLocale || 'en');
    const firstDay = locale.weekInfo && locale.weekInfo.firstDay;
    if (typeof firstDay === 'number') {
      return firstDay % 7;
    }
  } catch {
    // Ignore and fall back below.
  }
  return 1; // Monday fallback for older browsers.
}

function getStartOfWeek(referenceDate) {
  const date = new Date(referenceDate);
  date.setHours(0, 0, 0, 0);
  const firstDay = getRegionalWeekStartDay();
  const diff = (date.getDay() - firstDay + 7) % 7;
  date.setDate(date.getDate() - diff);
  return date;
}

// Days and periods for the calendar grid
const periods = [1, 2, 3, 4, 5];
let showWeekends = true;

function getVisibleDayIndices(weekDates, includeWeekends = showWeekends) {
  const indices = [];
  for (let i = 0; i < weekDates.length; ++i) {
    if (includeWeekends || !weekDates[i].isWeekend) {
      indices.push(i);
    }
  }
  return indices;
}

function ensureWeekendToggleButton() {
  let toggleBtn = document.getElementById('toggleWeekendBtn');
  if (!toggleBtn) {
    const anchorBtn = document.getElementById('printScheduleBtn') || document.getElementById('nextWeekBtn');
    const parent = anchorBtn && anchorBtn.parentElement;
    if (!parent) return null;

    toggleBtn = document.createElement('button');
    toggleBtn.id = 'toggleWeekendBtn';
    toggleBtn.style.margin = '0 0.3em';
    toggleBtn.style.background = '#455a64';
    toggleBtn.style.color = '#fff';
    toggleBtn.style.border = 'none';
    toggleBtn.style.borderRadius = '5px';
    toggleBtn.style.padding = '0.45rem 1rem';
    toggleBtn.onclick = () => {
      showWeekends = !showWeekends;
      renderScheduleCalendar();
    };

    if (anchorBtn && anchorBtn.nextSibling) {
      parent.insertBefore(toggleBtn, anchorBtn.nextSibling);
    } else {
      parent.appendChild(toggleBtn);
    }
  }

  toggleBtn.textContent = showWeekends ? 'Hide Weekend' : 'Show Weekend';
  return toggleBtn;
}

function getWeekDatesFromMonday(monday) {
  const weekDates = [];
  for (let i = 0; i < WEEK_DAYS_COUNT; ++i) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    weekDates.push({
      display: formatDateShort(d),
      iso: getISODate(d),
      weekday: weekdayFormatter.format(d),
      isWeekend: d.getDay() === 0 || d.getDay() === 6
    });
  }
  return weekDates;
}

function mondayToWeekInputValue(monday) {
  const refMonday = new Date(monday);
  refMonday.setHours(0, 0, 0, 0);
  const thursday = new Date(refMonday);
  thursday.setDate(refMonday.getDate() + 3);
  const year = thursday.getFullYear();
  const jan4 = new Date(year, 0, 4);
  const jan4Day = jan4.getDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setDate(jan4.getDate() - jan4Day + 1);
  const diffDays = Math.round((refMonday - week1Monday) / 86400000);
  const weekNo = Math.floor(diffDays / 7) + 1;
  return `${year}-W${String(weekNo).padStart(2, '0')}`;
}

function weekInputValueToMonday(weekValue) {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekValue || '');
  if (!match) return null;
  const year = Number(match[1]);
  const weekNo = Number(match[2]);
  if (weekNo < 1 || weekNo > 53) return null;
  const jan4 = new Date(year, 0, 4);
  const jan4Day = jan4.getDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setDate(jan4.getDate() - jan4Day + 1);
  const monday = new Date(week1Monday);
  monday.setDate(week1Monday.getDate() + ((weekNo - 1) * 7));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function askWeekToPrint(defaultMonday) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;z-index:9999;';
    const box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,0.2);padding:1rem 1.1rem;min-width:320px;max-width:90vw;';
    const defaultWeek = mondayToWeekInputValue(defaultMonday);
    box.innerHTML = `
      <div style="font-weight:700;font-size:1.05rem;margin-bottom:0.65rem;">Print ${bookingPageLabel} Schedule</div>
      <label for="weekToPrintInput" style="display:block;margin-bottom:0.35rem;">Which week do you want to print?</label>
      <input id="weekToPrintInput" type="week" value="${defaultWeek}" style="width:100%;padding:0.4rem;margin-bottom:0.8rem;" />
      <div style="display:flex;justify-content:flex-end;gap:0.5rem;">
        <button id="weekPrintCancelBtn" style="padding:0.42rem 0.8rem;border:1px solid #bbb;background:#f2f2f2;border-radius:5px;">Cancel</button>
        <button id="weekPrintConfirmBtn" style="padding:0.42rem 0.8rem;border:0;background:#1976d2;color:#fff;border-radius:5px;">Print</button>
      </div>
    `;
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const cleanup = () => {
      overlay.remove();
    };

    box.querySelector('#weekPrintCancelBtn').onclick = () => {
      cleanup();
      resolve(null);
    };

    box.querySelector('#weekPrintConfirmBtn').onclick = () => {
      const weekValue = box.querySelector('#weekToPrintInput').value;
      const monday = weekInputValueToMonday(weekValue);
      cleanup();
      resolve(monday);
    };

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        cleanup();
        resolve(null);
      }
    });
  });
}

function buildPrintGrid(bookings, weekDates) {
  const grid = Array.from({ length: periods.length }, () => Array(weekDates.length).fill(null));
  bookings.forEach(b => {
    if (isPlannerLikeBooking(b)) return;
    const dayIdx = weekDates.findIndex(wd => wd.iso === b.booking_date);
    const periodIdx = periods.indexOf(Number(b.period));
    if (dayIdx !== -1 && periodIdx !== -1) {
      grid[periodIdx][dayIdx] = b;
    }
  });
  return grid;
}

function getPrintBookingTitle(cell, displayMode) {
  if (displayMode === 'recipe') {
    const recipe = String(cell.recipe || '').trim();
    return recipe ? `Recipe: ${recipe}` : `Class: ${cell.class_name || ''}`;
  }
  return `Class: ${cell.class_name || ''}`;
}

async function printScheduleForWeek(printMonday, includeWeekends = showWeekends, displayMode = 'class') {
  if (!printMonday) return;

  const weekDates = getWeekDatesFromMonday(printMonday);
  const bookings = await fetchBookingsForWeek(printMonday);
  const grid = buildPrintGrid(bookings, weekDates);
  const visibleDayIndices = getVisibleDayIndices(weekDates, includeWeekends);
  const visibleWeekDates = visibleDayIndices.map((idx) => weekDates[idx]);
  const weekStart = new Date(printMonday);
  const weekEnd = new Date(printMonday);
  weekEnd.setDate(weekStart.getDate() + 6);
  const printDate = new Date().toLocaleDateString();
  const logoUrl = new URL('images/whs logo circular reo .png', window.location.href).href;

  let tableHtml = '<table class="print-calendar-table"><thead>';
  tableHtml += '<tr><th class="period-col"></th>';
  tableHtml += visibleWeekDates.map(d => `<th>${d.weekday}</th>`).join('');
  tableHtml += '</tr>';
  tableHtml += '<tr><th class="period-col"></th>';
  tableHtml += visibleWeekDates.map(d => `<th class="date-head">${d.display}</th>`).join('');
  tableHtml += '</tr></thead><tbody>';

  for (let p = 0; p < periods.length; ++p) {
    tableHtml += `<tr><td class="period-col">P${periods[p]}</td>`;
    for (let d = 0; d < visibleDayIndices.length; ++d) {
      const dayIdx = visibleDayIndices[d];
      const cell = grid[p][dayIdx];
      if (cell) {
        tableHtml += `<td><div class="booking-box"><div class="booking-title">${getPrintBookingTitle(cell, displayMode)}</div><div class="booking-teacher">Teacher: ${cell.staff_name || ''}</div></div></td>`;
      } else {
        tableHtml += '<td></td>';
      }
    }
    tableHtml += '</tr>';
  }

  tableHtml += '</tbody></table>';

  const win = window.open('', '', 'width=1300,height=850');
  if (!win) {
    alert('Please allow pop-ups to print the schedule.');
    return;
  }

  win.document.write(`
    <html lang="${userLocale}">
      <head>
        <title>${bookingPageLabel} ${formatDateLong(weekStart)} to ${formatDateLong(weekEnd)}</title>
        <style>
          @page { size: A4 landscape; margin: 10mm; }
          * { box-sizing: border-box; }
          body { font-family: "Segoe UI", Arial, sans-serif; color: #1d1d1d; margin: 0; }
          .print-page { width: 100%; }
          .print-header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #1976d2; padding-bottom: 8px; margin-bottom: 10px; }
          .print-brand { display: flex; align-items: center; gap: 10px; }
          .print-brand img { width: 56px; height: 56px; object-fit: contain; }
          .print-title { font-size: 22px; font-weight: 700; color: #1976d2; margin: 0; }
          .print-subtitle { margin: 2px 0 0 0; font-size: 13px; }
          .print-meta { font-size: 12px; text-align: right; }
          .print-calendar-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
          .print-calendar-table th, .print-calendar-table td { border: 1px solid #8f8f8f; padding: 4px; text-align: center; vertical-align: top; font-size: 11px; height: 64px; }
          .print-calendar-table th { background: #1976d2; color: #fff; font-weight: 700; }
          .print-calendar-table th.date-head { background: #eaf1ff; color: #222; font-weight: 600; }
          .period-col { width: 46px; background: #f1f1f1 !important; color: #222 !important; font-weight: 700; }
          .booking-box { background: #e8f5e9; border-radius: 6px; padding: 4px; min-height: 52px; }
          .booking-title { font-weight: 700; margin-bottom: 2px; }
          .booking-teacher { color: #2e7d32; font-weight: 600; }
        </style>
      </head>
      <body>
        <div class="print-page">
          <div class="print-header">
            <div class="print-brand">
              <img src="${logoUrl}" alt="School Logo" />
              <div>
                <h1 class="print-title">${bookingPageLabel}</h1>
                <p class="print-subtitle">Week of ${formatDateLong(weekStart)} to ${formatDateLong(weekEnd)}</p>
              </div>
            </div>
            <div class="print-meta">
              <div><strong>Printed:</strong> ${printDate}</div>
              <div><strong>Total Bookings:</strong> ${bookings.length}</div>
            </div>
          </div>
          ${tableHtml}
        </div>
      </body>
    </html>
  `);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
  }, 300);
}

// Helper to get ISO date string (yyyy-mm-dd) for a given date
function getISODate(date) {
  return toLocalIsoDate(date);
}

// Fetch bookings for the current week
async function fetchBookingsForWeek(monday) {
  // Get all bookings (ideally, backend should filter by week, but we filter here for now)
  const res = await fetch('/api/bookings/all');
  const data = await res.json();
  if (!data.bookings) return [];
  // Align filtering to the user's regional week start.
  const weekStartDate = getStartOfWeek(monday);
  let weekDates = [];
  for (let i = 0; i < WEEK_DAYS_COUNT; ++i) {
    const d = new Date(weekStartDate);
    d.setDate(weekStartDate.getDate() + i);
    weekDates.push(getISODate(d));
  }
  // Filter bookings for this week
  return data.bookings.filter(b => weekDates.includes(b.booking_date));
}

function formatDateShort(date) {
  return shortDateFormatter.format(date);
}

function formatDateLong(date) {
  return longDateFormatter.format(date);
}

// Track the current week start (Monday)
let currentMonday = (() => {
  return getStartOfWeek(new Date());
})();


async function renderScheduleCalendar() {
  const table = document.getElementById('scheduleCalendarTable');
  const weekDates = getWeekDatesFromMonday(currentMonday);
  const visibleDayIndices = getVisibleDayIndices(weekDates, showWeekends);
  const visibleWeekDates = visibleDayIndices.map((idx) => weekDates[idx]);

  // Fetch bookings for this week
  const bookings = await fetchBookingsForWeek(currentMonday);

  const grid = buildPrintGrid(bookings, weekDates);

  // Header rows
    let html = `<thead><tr style='background:#1976d2;color:#fff;'>
      <th style='width:48px;background:#1976d2;'></th>` + visibleWeekDates.map((d) => `<th style='padding:0.35rem 0.1rem;font-size:0.98em;background:#1976d2;color:#fff;'>${d.weekday}</th>`).join('') + '</tr>';
    html += `<tr style='background:#e3eafc;color:#222;'>
      <th style='width:48px;'></th>` + visibleWeekDates.map(date => `<th style='padding:0.15rem 0.1rem;font-size:0.92em;'>${date.display}</th>`).join('') + '</tr></thead>';

  // Planner row — year planner entries, each shown individually with a delete button
  html += `<tr><td style='background:#e8eaf6;font-weight:bold;text-align:center;font-size:0.85em;color:#283593;padding:0.3rem 0.1rem;'>Planner</td>`;
  for (let d = 0; d < visibleDayIndices.length; ++d) {
    const dayIdx = visibleDayIndices[d];
    const dayIso = weekDates[dayIdx].iso;
    const plannerEntries = bookings.filter(b =>
      isPlannerLikeBooking(b) &&
        snapToNearestMonday(b.booking_date) === dayIso &&
        String(b.recipe || '').trim()
    );
    if (plannerEntries.length) {
      html += `<td style='vertical-align:top;text-align:center;padding:0.2rem 0.1rem;'>` +
        plannerEntries.map(entry => {
          const style = plannerChipStyle(normalizePlannerStream(entry));
          return `<div class='planner-chip' data-booking-id='${entry.id}' style='background:${style.bg};border:1px solid ${style.border};border-radius:5px;padding:0.12rem 0.2rem;font-size:0.82em;color:${style.text};font-weight:600;margin-bottom:2px;display:flex;align-items:center;gap:3px;justify-content:space-between;'><span>${escHtml(entry.recipe)}</span><button class='planner-delete-btn' data-booking-id='${entry.id}' title='Delete this entry' style='background:none;border:none;cursor:pointer;color:${style.text};font-size:0.9em;opacity:0.6;padding:0 1px;line-height:1;flex-shrink:0;' aria-label='Delete ${escHtml(entry.recipe)}'>&#x2715;</button></div>`;
        }).join('') +
        `</td>`;
    } else {
      html += '<td></td>';
    }
  }
  html += '</tr>';

  // Periods and cells (make bookings clickable)
  for (let p = 0; p < periods.length; ++p) {
    html += `<tr><td style='background:#f5f5f5;font-weight:bold;text-align:center;'>P${periods[p]}</td>`;
      for (let d = 0; d < visibleDayIndices.length; ++d) {
      const dayIdx = visibleDayIndices[d];
      const cell = grid[p][dayIdx];
        if (cell) {
          // Add a unique id for each booking cell
          const bookingId = `booking-${cell.id}`;
          const cellLabel = `${escHtml(getCellPrimaryText(cell))}, Teacher: ${escHtml(cell.staff_name)}`;
          // Add a class for selected state
          html += `<td style='vertical-align:top;text-align:center;padding:0.25rem 0.1rem;'>
            <div class="calendar-booking-cell" id="${bookingId}" data-booking-id="${cell.id}" tabindex="0" role="button" aria-label="${cellLabel}" style='background:#e8f5e9;border-radius:7px;padding:0.32rem 0.18rem;box-shadow:0 1px 2px #0001;cursor:pointer;transition:box-shadow 0.2s;'>
              <div style='font-weight:bold;font-size:0.98em;'>${escHtml(getCellPrimaryText(cell))}</div>
              <div style='font-weight:bold;color:#388e3c;font-size:0.95em;'>Teacher: ${escHtml(cell.staff_name)}</div>
            </div>
          </td>`;
      } else {
        html += '<td></td>';
      }
    }
    html += '</tr>';
  }

  table.setAttribute('aria-label', `Schedule calendar, week of ${formatDateLong(new Date(currentMonday))}`);
  table.innerHTML = html;

  // Legend: inject above the table
  let legendEl = document.getElementById('planner-stream-legend');
  if (!legendEl) {
    legendEl = document.createElement('div');
    legendEl.id = 'planner-stream-legend';
    table.parentNode.insertBefore(legendEl, table);
  }
  legendEl.innerHTML = `<div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;font-size:0.8rem;margin-bottom:0.45rem;">
    <span style="font-weight:600;color:#374151;">Planner:</span>
    <span style="background:#dbeafe;border:1px solid #93c5fd;color:#1e40af;border-radius:4px;padding:1px 7px;font-weight:600;">&#9632; Middle School</span>
    <span style="background:#dcfce7;border:1px solid #86efac;color:#166534;border-radius:4px;padding:1px 7px;font-weight:600;">&#9632; Junior School</span>
    <span style="background:#ffedd5;border:1px solid #fdba74;color:#9a3412;border-radius:4px;padding:1px 7px;font-weight:600;">&#9632; Senior (HOSP)</span>
    <span style="font-size:0.75rem;color:#6b7280;margin-left:0.25rem;">Click &#x2715; on a chip to delete it.</span>
  </div>`;

  // Delete handler for planner chips
  table.addEventListener('click', async (e) => {
    const btn = e.target.closest('.planner-delete-btn');
    if (!btn) return;
    const id = btn.dataset.bookingId;
    if (!id) return;
    const chip = btn.closest('.planner-chip');
    const recipeName = chip ? chip.querySelector('span') ? chip.querySelector('span').textContent : '' : '';
    if (!confirm(`Delete planner entry "${recipeName}"?`)) return;
    try {
      const res = await fetch(`/api/bookings/${id}`, { method: 'DELETE' });
      if (!res.ok) { alert('Failed to delete entry.'); return; }
      await renderScheduleCalendar();
    } catch { alert('Error deleting entry.'); }
  }, { capture: false });

  // Add or update the Selected Bookings list below the calendar
  let selectedListDiv = document.getElementById('selected-bookings-list');
  if (!selectedListDiv) {
    selectedListDiv = document.createElement('div');
    selectedListDiv.id = 'selected-bookings-list';
    selectedListDiv.style.margin = '2em 0 0 0';
    selectedListDiv.style.fontSize = '1em';
    table.parentNode.appendChild(selectedListDiv);
  }
  function renderSelectedBookings() {
    const selectedIds = window.selectedBookingIds || [];
    if (!selectedIds.length) {
      selectedListDiv.innerHTML = '';
      return;
    }
    let html = '<div style="font-weight:bold;margin-bottom:0.5em;">Selected Bookings</div><ul style="margin:0 0 0 1.2em;padding:0;">';
    selectedIds.forEach(id => {
      const b = bookings.find(bk => bk.id === id);
      if (b) {
        html += `<li><a href="#" onclick="scrollToDesiredServingsRow(${escHtml(String(id))});return false;">${escHtml(b.booking_date)} | ${escHtml(b.staff_name)} | ${escHtml(b.class_name)} | ${escHtml(b.recipe)}</a></li>`;
      }
    });
    html += '</ul>';
    // Desired Serving Ingredients Table for each selected booking
    html += '<div id="desired-ingredients-section" style="margin-top:1.5em;"></div>';
    selectedListDiv.innerHTML = html;

    // Fetch and render desired serving ingredients for each selected booking
    const section = document.getElementById('desired-ingredients-section');
    if (!section) return;
    section.innerHTML = '';
    selectedIds.forEach(async id => {
      // Debug output for Desired_Servings_Ingredients removed
    });
  }
  renderSelectedBookings();

  // Add click handlers to booking cells for selection
  window.selectedBookingIds = Array.isArray(window.selectedBookingIds)
    ? window.selectedBookingIds.map(id => parseInt(id, 10)).filter(id => Number.isInteger(id) && id > 0)
    : [];

  function applySelectionStyles() {
    const selectedIds = new Set(window.selectedBookingIds || []);
    bookings.forEach(cell => {
      const bookingDiv = document.getElementById(`booking-${cell.id}`);
      if (!bookingDiv) return;
      if (selectedIds.has(parseInt(cell.id, 10))) {
        bookingDiv.style.boxShadow = '0 0 0 3px #1976d2, 0 1px 4px #0001';
        bookingDiv.style.background = '#bbdefb';
      } else {
        bookingDiv.style.boxShadow = '0 1px 4px #0001';
        bookingDiv.style.background = '#e8f5e9';
      }
    });
  }

  function setupTeacherQuickSelect() {
    const teacherSelect = document.getElementById('quickSelectTeacher');
    const selectBtn = document.getElementById('selectTeacherBookingsBtn');
    const clearBtn = document.getElementById('clearTeacherSelectionBtn');
    if (!teacherSelect) return;

    const teacherNames = [...new Set(
      bookings
        .map(b => String(b.staff_name || '').trim())
        .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b));

    teacherSelect.innerHTML = '<option value="">-- Select teacher --</option>' +
      teacherNames.map(name => `<option value="${name.replace(/"/g, '&quot;')}">${name}</option>`).join('');

    if (selectBtn) {
      selectBtn.onclick = function() {
        const teacher = String(teacherSelect.value || '').trim();
        if (!teacher) {
          if (window.QC) window.QC.toast('Choose a teacher first', 'warn');
          return;
        }
        window.selectedBookingIds = bookings
          .filter(b => String(b.staff_name || '').trim() === teacher)
          .map(b => parseInt(b.id, 10))
          .filter(id => Number.isInteger(id) && id > 0);
        applySelectionStyles();
        renderSelectedBookings();
        if (window.QC) window.QC.toast(`Selected all bookings for ${teacher}`, 'success');
      };
    }

    if (clearBtn) {
      clearBtn.onclick = function() {
        window.selectedBookingIds = [];
        applySelectionStyles();
        renderSelectedBookings();
      };
    }
  }

  bookings.forEach(cell => {
    const bookingDiv = document.getElementById(`booking-${cell.id}`);
    if (bookingDiv) {
      const toggleBooking = function() {
        const bookingId = parseInt(cell.id, 10);
        const idx = window.selectedBookingIds.indexOf(bookingId);
        if (idx === -1) {
          window.selectedBookingIds.push(bookingId);
          publishBookingToBookClassForm(cell);
        } else {
          window.selectedBookingIds.splice(idx, 1);
        }
        window.selectedBookingIds = [...new Set(window.selectedBookingIds)];
        applySelectionStyles();
        renderSelectedBookings();
      };
      bookingDiv.onclick = toggleBooking;
      bookingDiv.onkeydown = function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleBooking();
        }
      };
    }
  });

  applySelectionStyles();
  setupTeacherQuickSelect();

  // Update week label
  const weekStart = new Date(currentMonday);
  const weekEnd = new Date(currentMonday);
  weekEnd.setDate(weekStart.getDate() + 6);
  document.getElementById('calendarWeekLabel').textContent = `Week of ${formatDateLong(weekStart)} to ${formatDateLong(weekEnd)}`;
  ensureWeekendToggleButton();
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.documentElement) {
    document.documentElement.lang = String(userLocale || 'en');
  }
  renderScheduleCalendar();
  // Add click handler for compare button
  const compareBtn = document.getElementById('compareStripFoodItemBtn');
  if (compareBtn) {
    compareBtn.onclick = function() {
      const selected = window.selectedBookingIds && window.selectedBookingIds[0];
      if (selected) {
        window.renderStripFoodItemComparisonTable(selected);
      } else {
        alert('Please select a booking first.');
      }
    };
  }
  document.getElementById('prevWeekBtn').onclick = () => {
    currentMonday.setDate(currentMonday.getDate() - 7);
    renderScheduleCalendar();
  };
  document.getElementById('todayBtn').onclick = () => {
    // Reset to this week's regional start day
    currentMonday = getStartOfWeek(new Date());
    renderScheduleCalendar();
  };
  document.getElementById('nextWeekBtn').onclick = () => {
    currentMonday.setDate(currentMonday.getDate() + 7);
    renderScheduleCalendar();
  };

  const scheduleViewModeSelect = document.getElementById('scheduleViewModeSelect');
  if (scheduleViewModeSelect) {
    scheduleViewModeSelect.value = scheduleViewMode;
    scheduleViewModeSelect.onchange = () => {
      const nextMode = String(scheduleViewModeSelect.value || '').trim().toLowerCase();
      scheduleViewMode = nextMode === 'recipe' ? 'recipe' : 'class';
      localStorage.setItem(scheduleViewModeStorageKey, scheduleViewMode);
      renderScheduleCalendar();
    };
  }

  const printScheduleBtn = document.getElementById('printScheduleBtn');
  if (printScheduleBtn) {
    printScheduleBtn.onclick = async () => {
      const chosenMonday = await askWeekToPrint(currentMonday);
      if (!chosenMonday) return;
      await printScheduleForWeek(chosenMonday, showWeekends, 'class');
    };
  }

  const printScheduleByRecipeBtn = document.getElementById('printScheduleByRecipeBtn');
  if (printScheduleByRecipeBtn) {
    printScheduleByRecipeBtn.onclick = async () => {
      const chosenMonday = await askWeekToPrint(currentMonday);
      if (!chosenMonday) return;
      await printScheduleForWeek(chosenMonday, showWeekends, 'recipe');
    };
  }
  ensureWeekendToggleButton();

  if (scheduleCalendarSharedChannel) {
    scheduleCalendarSharedChannel.addEventListener('message', (event) => {
      const state = event && event.data ? event.data : null;
      if (!state || !state.refreshCalendarAt) return;
      const refreshAt = Number(state.refreshCalendarAt);
      if (!Number.isFinite(refreshAt) || refreshAt <= lastCalendarRefreshSignalAt) return;
      lastCalendarRefreshSignalAt = refreshAt;
      renderScheduleCalendar();
    });
  }
});

window.publishBookingToBookClassForm = publishBookingToBookClassForm;

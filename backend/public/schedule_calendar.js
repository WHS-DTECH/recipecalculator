
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

function toLocalIsoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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
const periods = [1, 2, 3, 4, 5, 6];

function getWeekDatesFromMonday(monday) {
  const weekDates = [];
  for (let i = 0; i < WEEK_DAYS_COUNT; ++i) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    weekDates.push({
      display: formatDateShort(d),
      iso: getISODate(d),
      weekday: weekdayFormatter.format(d)
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
    const dayIdx = weekDates.findIndex(wd => wd.iso === b.booking_date);
    const periodIdx = periods.indexOf(Number(b.period));
    if (dayIdx !== -1 && periodIdx !== -1) {
      grid[periodIdx][dayIdx] = b;
    }
  });
  return grid;
}

async function printScheduleForWeek(printMonday) {
  if (!printMonday) return;

  const weekDates = getWeekDatesFromMonday(printMonday);
  const bookings = await fetchBookingsForWeek(printMonday);
  const grid = buildPrintGrid(bookings, weekDates);
  const weekStart = new Date(printMonday);
  const weekEnd = new Date(printMonday);
  weekEnd.setDate(weekStart.getDate() + 6);
  const printDate = new Date().toLocaleDateString();
  const logoUrl = new URL('images/whs logo circular reo .png', window.location.href).href;

  let tableHtml = '<table class="print-calendar-table"><thead>';
  tableHtml += '<tr><th class="period-col"></th>';
  tableHtml += weekDates.map(d => `<th>${d.weekday}</th>`).join('');
  tableHtml += '</tr>';
  tableHtml += '<tr><th class="period-col"></th>';
  tableHtml += weekDates.map(d => `<th class="date-head">${d.display}</th>`).join('');
  tableHtml += '</tr></thead><tbody>';

  for (let p = 0; p < periods.length; ++p) {
    tableHtml += `<tr><td class="period-col">P${periods[p]}</td>`;
    for (let d = 0; d < weekDates.length; ++d) {
      const cell = grid[p][d];
      if (cell) {
        tableHtml += `<td><div class="booking-box"><div class="booking-title">Class: ${cell.class_name || ''}</div><div class="booking-teacher">Teacher: ${cell.staff_name || ''}</div></div></td>`;
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

  // Fetch bookings for this week
  const bookings = await fetchBookingsForWeek(currentMonday);

  const grid = buildPrintGrid(bookings, weekDates);

  // Header rows
    let html = `<thead><tr style='background:#1976d2;color:#fff;'>
      <th style='width:48px;background:#1976d2;'></th>` + weekDates.map((d) => `<th style='padding:0.35rem 0.1rem;font-size:0.98em;background:#1976d2;color:#fff;'>${d.weekday}</th>`).join('') + '</tr>';
    html += `<tr style='background:#e3eafc;color:#222;'>
      <th style='width:48px;'></th>` + weekDates.map(date => `<th style='padding:0.15rem 0.1rem;font-size:0.92em;'>${date.display}</th>`).join('') + '</tr></thead>';

  // Periods and cells (make bookings clickable)
  for (let p = 0; p < periods.length; ++p) {
    html += `<tr><td style='background:#f5f5f5;font-weight:bold;text-align:center;'>P${periods[p]}</td>`;
      for (let d = 0; d < weekDates.length; ++d) {
      const cell = grid[p][d];
        if (cell) {
          // Add a unique id for each booking cell
          const bookingId = `booking-${cell.id}`;
          // Add a class for selected state
          html += `<td style='vertical-align:top;text-align:center;padding:0.25rem 0.1rem;'>
            <div class=\"calendar-booking-cell\" id=\"${bookingId}\" data-booking-id=\"${cell.id}\" style='background:#e8f5e9;border-radius:7px;padding:0.32rem 0.18rem;box-shadow:0 1px 2px #0001;cursor:pointer;transition:box-shadow 0.2s;'>
              <div style='font-weight:bold;font-size:0.98em;'>Class: ${cell.class_name}</div>
              <div style='font-weight:bold;color:#388e3c;font-size:0.95em;'>Teacher: ${cell.staff_name}</div>
              <!-- Recipe and Servings hidden in event box -->
            </div>
          </td>`;
      } else {
        html += '<td></td>';
      }
    }
    html += '</tr>';
  }

  table.innerHTML = html;

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
        html += `<li><a href="#" onclick="scrollToDesiredServingsRow(${id});return false;">${b.booking_date} | ${b.staff_name} | ${b.class_name} | ${b.recipe}</a></li>`;
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
  window.selectedBookingIds = window.selectedBookingIds || [];
  bookings.forEach(cell => {
    const bookingDiv = document.getElementById(`booking-${cell.id}`);
    if (bookingDiv) {
      bookingDiv.onclick = function() {
        const idx = window.selectedBookingIds.indexOf(cell.id);
        if (idx === -1) {
          window.selectedBookingIds.push(cell.id);
          bookingDiv.style.boxShadow = '0 0 0 3px #1976d2, 0 1px 4px #0001';
          bookingDiv.style.background = '#bbdefb';
        } else {
          window.selectedBookingIds.splice(idx, 1);
          bookingDiv.style.boxShadow = '0 1px 4px #0001';
          bookingDiv.style.background = '#e8f5e9';
        }
        renderSelectedBookings();
      };
      // Initial state
      if (window.selectedBookingIds.includes(cell.id)) {
        bookingDiv.style.boxShadow = '0 0 0 3px #1976d2, 0 1px 4px #0001';
        bookingDiv.style.background = '#bbdefb';
      }
    }
  });

  // Update week label
  const weekStart = new Date(currentMonday);
  const weekEnd = new Date(currentMonday);
  weekEnd.setDate(weekStart.getDate() + 6);
  document.getElementById('calendarWeekLabel').textContent = `Week of ${formatDateLong(weekStart)} to ${formatDateLong(weekEnd)}`;
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
  const printScheduleBtn = document.getElementById('printScheduleBtn');
  if (printScheduleBtn) {
    printScheduleBtn.onclick = async () => {
      const chosenMonday = await askWeekToPrint(currentMonday);
      if (!chosenMonday) return;
      await printScheduleForWeek(chosenMonday);
    };
  }
});

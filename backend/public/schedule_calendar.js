


// Days and periods for the calendar grid
const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const periods = [1, 2, 3, 4, 5, 6];

// Helper to get ISO date string (yyyy-mm-dd) for a given date
function getISODate(date) {
  return date.toISOString().slice(0, 10);
}

// Fetch bookings for the current week
async function fetchBookingsForWeek(monday) {
  // Get all bookings (ideally, backend should filter by week, but we filter here for now)
  const res = await fetch('/api/bookings/all');
  const data = await res.json();
  console.log('[DEBUG] Raw bookings data from API:', data.bookings);
  if (!data.bookings) return [];
  // Robustly calculate the Monday for the week containing the reference date
  const refDate = new Date(monday);
  const refDay = refDate.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
  // Calculate how many days to subtract to get to Monday
  // If Sunday (0), subtract 6; else subtract (refDay - 1)
  const daysToMonday = refDay === 0 ? 6 : refDay - 1;
  const mondayDate = new Date(refDate);
  mondayDate.setDate(refDate.getDate() - daysToMonday);
  mondayDate.setHours(0,0,0,0);
  console.log('[DEBUG] Robust Calculated Monday:', getISODate(mondayDate), '| refDay:', refDay, '| daysToMonday:', daysToMonday);
  let weekDates = [];
  for (let i = 0; i < 7; ++i) {
    const d = new Date(mondayDate);
    d.setDate(mondayDate.getDate() + i);
    weekDates.push(getISODate(d));
  }
  console.log('[DEBUG] weekDates for filtering:', weekDates);
  data.bookings.forEach(b => {
    console.log('[DEBUG] booking_date in DB:', b.booking_date, '| typeof:', typeof b.booking_date, '| match:', weekDates.includes(b.booking_date));
    if (!weekDates.includes(b.booking_date)) {
      weekDates.forEach(wd => {
        if (b.booking_date == wd) {
          console.log('[DEBUG] booking_date == weekDate (loose equality):', b.booking_date, wd);
        }
      });
    }
  });
  // Filter bookings for this week
  return data.bookings.filter(b => weekDates.includes(b.booking_date));
}

// Helper to format date as dd/mm/yy
function formatDateDMY(date) {
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth()+1).toString().padStart(2, '0');
  const y = date.getFullYear().toString().slice(-2);
  return `${d}/${m}/${y}`;
}

// Track the current week start (Monday)
let currentMonday = (() => {
  const today = new Date();
  const day = today.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // Monday as start
  const monday = new Date(today);
  monday.setDate(today.getDate() + diff);
  monday.setHours(0,0,0,0);
  return monday;
})();


async function renderScheduleCalendar() {
  console.log('[DEBUG] renderScheduleCalendar called');
  const table = document.getElementById('scheduleCalendarTable');
  // Calculate week dates
  let weekDates = [];
  for (let i = 0; i < 7; ++i) {
    const d = new Date(currentMonday);
    d.setDate(currentMonday.getDate() + i);
    weekDates.push({
      display: formatDateDMY(d),
      iso: getISODate(d)
    });
  }

  // Fetch bookings for this week
  const bookings = await fetchBookingsForWeek(currentMonday);

  // Build a grid: periods x days, fill with bookings
  const grid = Array.from({ length: periods.length }, () => Array(days.length).fill(null));
  bookings.forEach(b => {
    // Find day index (by booking_date)
    const dayIdx = weekDates.findIndex(wd => wd.iso === b.booking_date);
    // Find period index (periods are 1-based)
    const periodIdx = periods.indexOf(Number(b.period));
    if (dayIdx !== -1 && periodIdx !== -1) {
      grid[periodIdx][dayIdx] = b;
    }
  });

  // Header rows
    let html = `<thead><tr style='background:#1976d2;color:#fff;'>
      <th style='width:48px;background:#1976d2;'></th>` + days.map((d) => `<th style='padding:0.35rem 0.1rem;font-size:0.98em;background:#1976d2;color:#fff;'>${d}</th>`).join('') + '</tr>';
    html += `<tr style='background:#e3eafc;color:#222;'>
      <th style='width:48px;'></th>` + weekDates.map(date => `<th style='padding:0.15rem 0.1rem;font-size:0.92em;'>${date.display}</th>`).join('') + '</tr></thead>';

  // Periods and cells (make bookings clickable)
  for (let p = 0; p < periods.length; ++p) {
    html += `<tr><td style='background:#f5f5f5;font-weight:bold;text-align:center;'>P${periods[p]}</td>`;
      for (let d = 0; d < days.length; ++d) {
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
  console.log('[DEBUG] Calendar table rendered with bookings:', bookings);

  // Add or update the Selected Bookings list below the calendar
    console.log('[DEBUG] End of renderScheduleCalendar');
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
  document.getElementById('calendarWeekLabel').textContent = `Week of ${formatDateDMY(weekStart)} to ${formatDateDMY(weekEnd)}`;
}

document.addEventListener('DOMContentLoaded', () => {
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
    // Reset to this week's Monday
    const today = new Date();
    const day = today.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    currentMonday = new Date(today);
    currentMonday.setDate(today.getDate() + diff);
    currentMonday.setHours(0, 0, 0, 0);
    renderScheduleCalendar();
  };
  document.getElementById('nextWeekBtn').onclick = () => {
    currentMonday.setDate(currentMonday.getDate() + 7);
    renderScheduleCalendar();
  };
});
    document.getElementById('prevWeekBtn').onclick = () => {
      currentMonday.setDate(currentMonday.getDate() - 7);
      renderScheduleCalendar();
    };
    document.getElementById('todayBtn').onclick = () => {
      // Reset to this week's Monday
      const today = new Date();
      const day = today.getDay();
      const diff = (day === 0 ? -6 : 1) - day;
      currentMonday = new Date(today);
      currentMonday.setDate(today.getDate() + diff);
      currentMonday.setHours(0,0,0,0);
      renderScheduleCalendar();
    };
    document.getElementById('nextWeekBtn').onclick = () => {
      currentMonday.setDate(currentMonday.getDate() + 7);
      renderScheduleCalendar();
    };


// --- Populate Staff Dropdown ---

function getTopSelections(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch { return []; }
}

function setTopSelection(key, value) {
  let arr = getTopSelections(key);
  arr = arr.filter(v => v !== value);
  arr.unshift(value);
  if (arr.length > 5) arr = arr.slice(0, 5);
  localStorage.setItem(key, JSON.stringify(arr));
}

function populateStaffDropdown() {
  fetch('/api/staff_upload/dropdown')
    .then(res => res.json())
    .then(data => {
      const select = document.getElementById('staffSelect');
      if (!select) return;
      select.innerHTML = '';
        // Add default option
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Choose Staff member';
        defaultOption.disabled = true;
        defaultOption.selected = true;
        select.appendChild(defaultOption);
      const staffArr = data.staff || [];
      const topStaff = getTopSelections('topStaff');
      // Sort: topStaff first, then rest
      const sorted = [
        ...topStaff.map(id => staffArr.find(s => String(s.id) === String(id))).filter(Boolean),
        ...staffArr.filter(s => !topStaff.includes(String(s.id)))
      ];
      sorted.forEach(staff => {
        const opt = document.createElement('option');
        opt.value = staff.id;
        // Always show staff code if available
        if (staff.code) {
          opt.textContent = `${staff.last_name}, ${staff.first_name} (${staff.code})`;
        } else {
          opt.textContent = `${staff.last_name}, ${staff.first_name}`;
        }
        select.appendChild(opt);
      });
    });
}

// --- Populate Class Dropdown ---

function getStaffCodeById(staffId, staffArr) {
  const staff = staffArr.find(s => String(s.id) === String(staffId));
  return staff && staff.code ? staff.code : '';
}

let _staffArrCache = [];

function populateClassDropdown(staffCode) {
  let url = '/api/classes/dropdown';
  if (staffCode) url += '?staffCode=' + encodeURIComponent(staffCode);
  fetch(url)
    .then(res => res.json())
    .then(data => {
      const select = document.getElementById('classSelect');
      if (!select) return;
      select.innerHTML = '';
        // Add default option
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Choose Class';
        defaultOption.disabled = true;
        defaultOption.selected = true;
        select.appendChild(defaultOption);
      const classArr = (data.classes || []).filter(c => c && c.ttcode && c.name);
      const topClasses = getTopSelections('topClasses');
      // Sort: topClasses first, then rest
      const sorted = [
        ...topClasses.map(ttcode => classArr.find(c => c.ttcode === ttcode)).filter(Boolean),
        ...classArr.filter(c => !topClasses.includes(c.ttcode))
      ];
      if (sorted.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No classes available for this staff member';
        select.appendChild(opt);
        return;
      }
      sorted.forEach(cls => {
        if (!cls || !cls.ttcode || !cls.name) return;
        const opt = document.createElement('option');
        opt.value = cls.ttcode;
        // Only show TTCode and Name (and Level in brackets if present)
        if (cls.level) {
          opt.textContent = `${cls.ttcode} - ${cls.name} (${cls.level})`;
        } else {
          opt.textContent = `${cls.ttcode} - ${cls.name}`;
        }
        select.appendChild(opt);
      });
    });
}

// --- Populate Recipe Dropdown ---
function populateRecipeDropdown() {
  fetch('/api/recipes/display-dropdown')
    .then(res => res.json())
    .then(data => {
      const select = document.getElementById('recipeSelect');
      if (!select) return;
      select.innerHTML = '';
      // Add default option
      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = 'Choose a recipe';
      defaultOption.disabled = true;
      defaultOption.selected = true;
      select.appendChild(defaultOption);
      (data.recipes || []).forEach(recipe => {
        const opt = document.createElement('option');
        opt.value = recipe.id;
        opt.textContent = `[ID: ${recipe.id}] ${recipe.name}`;
        opt.setAttribute('data-recipe-id', recipe.id);
        select.appendChild(opt);
      });
    });
}

// --- Save Booking ---

function saveBooking() {
  const staffSelect = document.getElementById('staffSelect');
  const classSelect = document.getElementById('classSelect');
  const dateInput = document.getElementById('dateInput');
  const periodSelect = document.getElementById('periodSelect');
  const recipeSelect = document.getElementById('recipeSelect');
  const classSizeInput = document.getElementById('classSizeInput');
  const staffId = staffSelect.value;
  const staffName = staffSelect.options[staffSelect.selectedIndex].textContent;
  const className = classSelect.value;
  const bookingDate = dateInput.value;
  const period = periodSelect.value;
  const recipe = recipeSelect.value;
  const classSize = classSizeInput.value;
  // Get recipe_id from selected option (assume dropdown options have data-recipe-id)
  let recipeId = '';
  if (recipeSelect.selectedIndex > 0) {
    recipeId = recipeSelect.options[recipeSelect.selectedIndex].getAttribute('data-recipe-id') || '';
  }
  // Track most selected
  setTopSelection('topStaff', staffId);
  setTopSelection('topClasses', className);
  const editId = document.getElementById('saveBookingBtn').dataset.editId;
  const method = editId ? 'PUT' : 'POST';
  const url = editId ? `/api/bookings/${editId}` : '/api/bookings';
  fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      staff_id: staffId,
      staff_name: staffName,
      class_name: className,
      booking_date: bookingDate,
      period,
      recipe,
      recipe_id: recipeId,
      class_size: classSize
    })
  })
    .then(res => res.json())
    .then(result => {
      if (result.success) {
        document.getElementById('saveBookingBtn').textContent = 'Save booking';
        delete document.getElementById('saveBookingBtn').dataset.editId;
        document.getElementById('resetBtn').click();
        fetchAndRenderBookings();
      } else {
        alert('Failed to save booking.');
      }
    });
}

// Helper to get staff id by name (for edit)
function getStaffIdByName(staffName) {
  const match = (_staffArrCache || []).find(s => `${s.last_name}, ${s.first_name}` === staffName || `${s.code} - ${s.last_name}, ${s.first_name}` === staffName);
  return match ? match.id : '';
}


// --- Fetch and Render Bookings ---
function fetchAndRenderBookings() {
  fetch('/api/bookings/all')
    .then(res => res.json())
    .then(data => {
      renderBookings(data.bookings || []);
    });
}

function renderBookings(bookings = []) {
  const tbody = document.getElementById('scheduledBookings');
  if (!bookings.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-muted">No bookings found.</td></tr>';
    return;
  }
  tbody.innerHTML = bookings.map(b => {
    // Format date to NZ locale (en-NZ)
    let formattedDate = '';
    if (b.booking_date) {
      try {
        const dateObj = new Date(b.booking_date);
        formattedDate = dateObj.toLocaleDateString('en-NZ', { year: 'numeric', month: '2-digit', day: '2-digit' });
      } catch {
        formattedDate = b.booking_date;
      }
    }
    return `<tr data-booking-id="${b.id}">
      <td>${b.id || ''}</td>
      <td>${formattedDate}</td>
      <td>${b.period || ''}</td>
      <td>${b.staff_name || ''}</td>
      <td>${b.class_name || ''}</td>
      <td>${b.class_size || ''}</td>
      <td>${b.recipe || ''}</td>
      <td>${b.recipe_id || ''}</td>
      <td><button class='edit-btn'>Edit</button> <button class='delete-btn'>Delete</button></td>
    </tr>`;
  }).join('');
  // Attach event listeners for delete
  tbody.querySelectorAll('.delete-btn').forEach(btn => {
    btn.onclick = function() {
      const tr = btn.closest('tr');
      const bookingId = tr.getAttribute('data-booking-id');
      if (confirm('Delete this booking?')) {
        fetch(`/api/bookings/${bookingId}`, { method: 'DELETE' })
          .then(res => res.json())
          .then(result => {
            if (result.success) fetchAndRenderBookings();
            else alert('Failed to delete booking.');
          })
          .catch(() => alert('Failed to delete booking.'));
      }
    };
  });
  // Attach event listeners for edit
  tbody.querySelectorAll('.edit-btn').forEach(btn => {
    btn.onclick = function() {
      const tr = btn.closest('tr');
      const bookingId = tr.getAttribute('data-booking-id');
      // Find booking data
      const booking = bookings.find(b => String(b.id) === String(bookingId));
      if (!booking) return;
      // Populate form fields
      document.getElementById('staffSelect').value = getStaffIdByName(booking.staff_name);
      const staffCode = getStaffCodeById(document.getElementById('staffSelect').value, _staffArrCache);
      populateClassDropdown(staffCode);
      setTimeout(() => {
        document.getElementById('classSelect').value = booking.class_name;
      }, 200);
      document.getElementById('dateInput').value = booking.booking_date;
      document.getElementById('periodSelect').value = booking.period;
      document.getElementById('recipeSelect').value = booking.recipe;
      document.getElementById('classSizeInput').value = booking.class_size;
      document.getElementById('saveBookingBtn').textContent = 'Update booking';
      document.getElementById('saveBookingBtn').dataset.editId = bookingId;
    };
  });
}

// --- Event Listeners ---
window.addEventListener('DOMContentLoaded', () => {
  fetch('/api/staff_upload/dropdown')
    .then(res => res.json())
    .then(data => {
      _staffArrCache = data.staff || [];
      populateStaffDropdown();
      // On initial load, use first staff code
      const firstStaffId = _staffArrCache.length ? _staffArrCache[0].id : '';
      const staffCode = getStaffCodeById(firstStaffId, _staffArrCache);
      populateClassDropdown(staffCode);
    });
  populateRecipeDropdown();
  fetchAndRenderBookings();
  document.getElementById('saveBookingBtn').addEventListener('click', saveBooking);
  document.getElementById('resetBtn').addEventListener('click', () => {
    document.getElementById('classSizeInput').value = 1;
    document.getElementById('recipeSelect').selectedIndex = 0;
    document.getElementById('periodSelect').selectedIndex = 0;
    document.getElementById('dateInput').value = new Date().toISOString().slice(0, 10);
    document.getElementById('classSelect').selectedIndex = 0;
    document.getElementById('staffSelect').selectedIndex = 0;
    // Reset class dropdown to first staff
    const staffId = document.getElementById('staffSelect').value;
    const staffCode = getStaffCodeById(staffId, _staffArrCache);
    populateClassDropdown(staffCode);
  });
  document.getElementById('staffSelect').addEventListener('change', function() {
    const staffId = this.value;
    const staffCode = getStaffCodeById(staffId, _staffArrCache);
    populateClassDropdown(staffCode);
  });
});

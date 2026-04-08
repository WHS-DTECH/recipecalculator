
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
      const topList = topStaff.map(id => staffArr.find(s => String(s.id) === String(id))).filter(Boolean);
      const restList = staffArr.filter(s => !topStaff.includes(String(s.id)));
      // Sort: topStaff first, then rest
      const sorted = [...topList, ...restList];
      sorted.forEach((staff, idx) => {
        // Add a separator between top (recent) and remaining staff
        if (topList.length > 0 && idx === topList.length) {
          const sep = document.createElement('option');
          sep.disabled = true;
          sep.textContent = '──────────────';
          select.appendChild(sep);
        }
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
let _currentTeacherTimetablePeriods = [];

function normalizeClassToken(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function autoSelectClassFromSelectedPeriod() {
  const periodSelect = document.getElementById('periodSelect');
  const classSelect = document.getElementById('classSelect');
  if (!periodSelect || !classSelect) return;

  const selectedPeriod = `P${periodSelect.value}`;
  const periodEntry = (_currentTeacherTimetablePeriods || []).find(p => p && p.period === selectedPeriod);
  if (!periodEntry || !Array.isArray(periodEntry.classes) || !periodEntry.classes.length) return;

  const timetableTokens = periodEntry.classes
    .flatMap(item => String(item || '').split(/[;,|]/g))
    .map(token => token.trim())
    .filter(Boolean);

  const options = Array.from(classSelect.options).filter(opt => opt.value);
  if (!options.length || !timetableTokens.length) return;

  const normalizedTokens = timetableTokens.map(normalizeClassToken);
  let matchedOption = null;

  for (const opt of options) {
    const valueNorm = normalizeClassToken(opt.value);
    const textNorm = normalizeClassToken(opt.textContent);
    if (normalizedTokens.some(tok => tok === valueNorm || tok === textNorm || tok.includes(valueNorm) || textNorm.includes(tok))) {
      matchedOption = opt;
      break;
    }
  }

  if (matchedOption) {
    classSelect.value = matchedOption.value;
    fetchStudentsForClass(classSelect.value);
  }
}

function selectClassOptionFromToken(classToken) {
  const classSelect = document.getElementById('classSelect');
  if (!classSelect || !classToken) return false;

  const rawToken = String(classToken || '').trim();
  const tokenNorm = normalizeClassToken(rawToken);
  const tokenParts = rawToken
    .split(/[^A-Za-z0-9]+/g)
    .map(p => normalizeClassToken(p))
    .filter(p => p.length >= 3);
  const options = Array.from(classSelect.options).filter(opt => opt.value);
  if (!options.length) return false;

  let matchedOption = null;

  // Pass 1: strict matching only (exact raw/exact normalized).
  for (const opt of options) {
    const rawValue = String(opt.value || '').trim();
    const rawText = String(opt.textContent || '').trim();
    const valueNorm = normalizeClassToken(opt.value);
    const textNorm = normalizeClassToken(opt.textContent);

    if (
      rawToken.toUpperCase() === rawValue.toUpperCase() ||
      rawToken.toUpperCase() === rawText.toUpperCase() ||
      tokenNorm === valueNorm ||
      tokenNorm === textNorm
    ) {
      matchedOption = opt;
      break;
    }
  }

  // Pass 2: conservative fuzzy matching (only for longer, meaningful tokens).
  if (!matchedOption) {
    for (const opt of options) {
      const valueNorm = normalizeClassToken(opt.value);
      const textNorm = normalizeClassToken(opt.textContent);

      const partExactMatch = tokenParts.some(part => part === valueNorm || part === textNorm);
      const safeContainMatch = tokenNorm.length >= 5 && valueNorm.length >= 5 &&
        (tokenNorm.includes(valueNorm) || valueNorm.includes(tokenNorm));

      if (partExactMatch || safeContainMatch) {
        matchedOption = opt;
        break;
      }
    }
  }

  if (matchedOption) {
    classSelect.value = matchedOption.value;
    fetchStudentsForClass(classSelect.value);
    return true;
  }

  // Fallback: add/select the clicked timetable class if no existing option matches.
  const tempOptId = '__timetableDynamicClassOption';
  const existingTemp = document.getElementById(tempOptId);
  if (existingTemp) existingTemp.remove();

  const fallbackOpt = document.createElement('option');
  fallbackOpt.id = tempOptId;
  fallbackOpt.value = rawToken;
  fallbackOpt.textContent = `${rawToken} (from timetable)`;
  classSelect.appendChild(fallbackOpt);
  classSelect.value = rawToken;
  fetchStudentsForClass(classSelect.value);
  return true;
}

function updateBookingDateDayLabel() {
  const dateInput = document.getElementById('dateInput');
  const dayLabel = document.getElementById('dateDayOfWeek');
  if (!dateInput || !dayLabel) return;
  const value = dateInput.value;
  if (!value) {
    dayLabel.textContent = '';
    return;
  }
  const parsed = new Date(value + 'T00:00:00');
  if (isNaN(parsed.getTime())) {
    dayLabel.textContent = '';
    return;
  }
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  dayLabel.textContent = `(${dayNames[parsed.getDay()]})`;
}

function renderTeacherTimetable(periods, teacherCode, date, weekday) {
  const meta = document.getElementById('teacherTimetableMeta');
  const body = document.getElementById('teacherTimetableBody');
  if (!meta || !body) return;

  meta.textContent = `${teacherCode} timetable for ${date}${weekday ? ` (${weekday})` : ''}`;
  if (!periods || !periods.length) {
    body.innerHTML = '<div class="text-muted">No timetable classes found for this day.</div>';
    return;
  }

  const rows = periods.map(p => {
    const classText = (p.classes && p.classes.length)
      ? p.classes.map(cls => `<button type="button" class="timetable-class-chip" data-period="${p.period}" data-class-token="${String(cls || '').replace(/"/g, '&quot;')}" style="margin:0 0.25rem 0.25rem 0;padding:0.2rem 0.45rem;border:1px solid #90caf9;border-radius:12px;background:#e3f2fd;color:#0d47a1;cursor:pointer;">${cls}</button>`).join('')
      : '<span style="color:#999;">No class</span>';
    return `<tr><td style="font-weight:bold;width:60px;">${p.period}</td><td>${classText}</td></tr>`;
  }).join('');
  body.innerHTML = `
    <table class="bookings-table" style="margin-top:0.5rem;">
      <thead><tr><th>Period</th><th>Class(es)</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  _currentTeacherTimetablePeriods = Array.isArray(periods) ? periods : [];
  autoSelectClassFromSelectedPeriod();

  body.querySelectorAll('.timetable-class-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const periodSelect = document.getElementById('periodSelect');
      const dateInput = document.getElementById('dateInput');
      if (dateInput && date) {
        dateInput.value = date;
        updateBookingDateDayLabel();
      }

      const periodValue = String(btn.getAttribute('data-period') || '').replace(/^P/i, '');
      if (periodSelect && periodValue) {
        periodSelect.value = periodValue;
      }

      const classToken = btn.getAttribute('data-class-token') || '';
      const wasMatched = selectClassOptionFromToken(classToken);
      if (!wasMatched) {
        autoSelectClassFromSelectedPeriod();
      }
    });
  });
}

function fetchTeacherTimetableForSelectedDate() {
  const staffSelect = document.getElementById('staffSelect');
  const dateInput = document.getElementById('dateInput');
  const meta = document.getElementById('teacherTimetableMeta');
  const body = document.getElementById('teacherTimetableBody');
  if (!staffSelect || !dateInput || !meta || !body) return;

  const staffCode = getStaffCodeById(staffSelect.value, _staffArrCache);
  const date = dateInput.value;
  if (!staffCode || !date) {
    meta.textContent = 'Select teacher and date to view timetable.';
    body.innerHTML = '';
    return;
  }

  meta.textContent = 'Loading timetable...';
  body.innerHTML = '';
  fetch(`/api/upload_timetable/teacher-day?teacherCode=${encodeURIComponent(staffCode)}&date=${encodeURIComponent(date)}`)
    .then(res => res.json())
    .then(data => {
      if (!data || data.success === false) {
        throw new Error(data && data.error ? data.error : 'Failed to load timetable');
      }
      renderTeacherTimetable(data.periods || [], data.teacherCode || staffCode, data.date || date, data.weekday || '');
    })
    .catch(() => {
      _currentTeacherTimetablePeriods = [];
      meta.textContent = 'Failed to load timetable for selected teacher/date.';
      body.innerHTML = '';
    });
}

function renderClassStudents(students = []) {
  const tbody = document.getElementById('classStudentsBody');
  const meta = document.getElementById('classStudentsMeta');
  const classSizeInput = document.getElementById('classSizeInput');
  if (!tbody || !meta) return;

  if (!students.length) {
    tbody.innerHTML = '<tr><td colspan="4">No students found for this class.</td></tr>';
    meta.textContent = '0 students timetabled for selected class.';
    if (classSizeInput) classSizeInput.value = 0;
    return;
  }

  meta.textContent = `${students.length} students timetabled for selected class.`;
  if (classSizeInput) classSizeInput.value = students.length;
  tbody.innerHTML = students.map(s => `
    <tr>
      <td>${s.id_number || ''}</td>
      <td>${s.student_name || ''}</td>
      <td>${s.form_class || ''}</td>
      <td>${s.year_level || ''}</td>
    </tr>
  `).join('');
}

function fetchStudentsForClass(classCode) {
  const meta = document.getElementById('classStudentsMeta');
  const tbody = document.getElementById('classStudentsBody');
  if (!meta || !tbody) return;

  if (!classCode) {
    meta.textContent = 'Choose a class to view students.';
    tbody.innerHTML = '<tr><td colspan="4">No class selected.</td></tr>';
    const classSizeInput = document.getElementById('classSizeInput');
    if (classSizeInput) classSizeInput.value = 1;
    return;
  }

  meta.textContent = 'Loading students...';
  fetch(`/api/student_upload/by-class/${encodeURIComponent(classCode)}`)
    .then(res => res.json())
    .then(data => renderClassStudents(data.students || []))
    .catch(() => {
      meta.textContent = 'Failed to load students for this class.';
      tbody.innerHTML = '<tr><td colspan="4">Could not load students.</td></tr>';
    });
}

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
        fetchStudentsForClass('');
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
      fetchStudentsForClass('');
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
        const recipeId = recipe.recipeid != null ? recipe.recipeid : recipe.id;
        const recipeName = recipe.name || '';
        const opt = document.createElement('option');
        opt.value = String(recipeId);
        opt.textContent = `[ID: ${recipeId}] ${recipeName}`;
        opt.setAttribute('data-recipe-id', String(recipeId));
        opt.setAttribute('data-recipe-name', recipeName);
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
  const classSize = classSizeInput.value;
  // Get recipe_id from selected option (assume dropdown options have data-recipe-id)
  let recipeId = '';
  let recipeName = '';
  if (recipeSelect.selectedIndex > 0) {
    const selectedRecipeOption = recipeSelect.options[recipeSelect.selectedIndex];
    recipeId = selectedRecipeOption.getAttribute('data-recipe-id') || selectedRecipeOption.value || '';
    recipeName = selectedRecipeOption.getAttribute('data-recipe-name') || '';
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
      recipe: recipeName,
      recipe_id: recipeId,
      class_size: classSize
    })
  })
    .then(res => res.json())
    .then(result => {
      if (result.success) {
        if (window.QC) window.QC.toast('Booking saved successfully', 'success');
        document.getElementById('saveBookingBtn').textContent = 'Save booking';
        delete document.getElementById('saveBookingBtn').dataset.editId;
        document.getElementById('resetBtn').click();
        fetchAndRenderBookings();
      } else {
        if (window.QC) window.QC.toast('Failed to save booking', 'error');
        else alert('Failed to save booking.');
      }
    })
    .catch(() => {
      if (window.QC) window.QC.toast('Failed to save booking', 'error');
      else alert('Failed to save booking.');
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
      <td>${b.recipe_id ? `[ID: ${b.recipe_id}] ` : ''}${b.recipe || ''}</td>
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
            if (result.success) {
              if (window.QC) window.QC.toast('Booking deleted', 'success');
              fetchAndRenderBookings();
            } else {
              if (window.QC) window.QC.toast('Failed to delete booking', 'error');
              else alert('Failed to delete booking.');
            }
          })
          .catch(() => {
            if (window.QC) window.QC.toast('Failed to delete booking', 'error');
            else alert('Failed to delete booking.');
          });
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
        fetchStudentsForClass(booking.class_name);
      }, 200);
      document.getElementById('dateInput').value = booking.booking_date;
      document.getElementById('periodSelect').value = booking.period;
      const recipeSelect = document.getElementById('recipeSelect');
      if (recipeSelect) {
        let recipeSelectValue = booking.recipe_id ? String(booking.recipe_id) : '';
        if (!recipeSelectValue && booking.recipe) {
          const idMatch = String(booking.recipe).match(/\[ID:\s*(\d+)\]/i);
          if (idMatch) recipeSelectValue = idMatch[1];
        }
        recipeSelect.value = recipeSelectValue;
        if (recipeSelect.selectedIndex < 0 && booking.recipe) {
          const optionByName = Array.from(recipeSelect.options).find(opt => (opt.getAttribute('data-recipe-name') || '').trim() === String(booking.recipe).trim());
          if (optionByName) recipeSelect.value = optionByName.value;
        }
      }
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

  const dateInput = document.getElementById('dateInput');
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().slice(0, 10);
  }
  updateBookingDateDayLabel();

  populateRecipeDropdown();
  fetchAndRenderBookings();
  document.getElementById('saveBookingBtn').addEventListener('click', saveBooking);
  document.getElementById('resetBtn').addEventListener('click', () => {
    document.getElementById('classSizeInput').value = 1;
    document.getElementById('recipeSelect').selectedIndex = 0;
    document.getElementById('periodSelect').selectedIndex = 0;
    document.getElementById('dateInput').value = new Date().toISOString().slice(0, 10);
    updateBookingDateDayLabel();
    document.getElementById('classSelect').selectedIndex = 0;
    document.getElementById('staffSelect').selectedIndex = 0;
    // Reset class dropdown to first staff
    const staffId = document.getElementById('staffSelect').value;
    const staffCode = getStaffCodeById(staffId, _staffArrCache);
    populateClassDropdown(staffCode);
    fetchTeacherTimetableForSelectedDate();
  });
  document.getElementById('staffSelect').addEventListener('change', function() {
    const staffId = this.value;
    const staffCode = getStaffCodeById(staffId, _staffArrCache);
    populateClassDropdown(staffCode);
    fetchTeacherTimetableForSelectedDate();
  });
  document.getElementById('dateInput').addEventListener('change', function() {
    updateBookingDateDayLabel();
    fetchTeacherTimetableForSelectedDate();
  });
  document.getElementById('periodSelect').addEventListener('change', function() {
    autoSelectClassFromSelectedPeriod();
  });
  document.getElementById('classSelect').addEventListener('change', function() {
    fetchStudentsForClass(this.value);
  });
  fetchStudentsForClass('');
  fetchTeacherTimetableForSelectedDate();

  if (window.QC) {
    window.QC.addSanityButton('Book a Class', [
      {
        name: 'Staff dropdown has options',
        run: async () => {
          const el = document.getElementById('staffSelect');
          return !!el && el.options.length > 1;
        }
      },
      {
        name: 'Class dropdown present',
        run: async () => {
          const el = document.getElementById('classSelect');
          return !!el;
        }
      },
      {
        name: 'Recipe dropdown has options',
        run: async () => {
          const el = document.getElementById('recipeSelect');
          return !!el && el.options.length > 1;
        }
      },
      {
        name: 'Timetable endpoint reachable',
        run: async () => {
          const staffCode = getStaffCodeById(document.getElementById('staffSelect')?.value, _staffArrCache);
          const date = document.getElementById('dateInput')?.value;
          if (!staffCode || !date) return true;
          const res = await fetch(`/api/upload_timetable/teacher-day?teacherCode=${encodeURIComponent(staffCode)}&date=${encodeURIComponent(date)}`);
          return res.ok;
        }
      }
    ]);
  }
});

// Save department assignment for staff
document.getElementById('saveDepartmentBtn').addEventListener('click', function() {
  const staffId = document.getElementById('staffSelect').value;
  const department = document.getElementById('departmentSelect').value;
  if (!staffId || !department) {
    alert('Please select both a staff member and a department.');
    return;
  }
  fetch('/api/department/assign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ staffId, department })
  })
    .then(res => res.json())
    .then(result => {
      if (result.success) {
        alert('Department assigned successfully!');
        fetchAndRenderDepartmentTable();
      } else {
        alert('Failed to assign department.');
      }
    })
    .catch(() => alert('Failed to assign department.'));
});
// Fetch staff for dropdown
function fetchAndPopulateStaffDropdown() {
  fetch('/api/staff_upload/all')
    .then(res => res.json())
    .then(result => {
      const select = document.getElementById('staffSelect');
      select.innerHTML = '';
      if (result && Array.isArray(result.staff)) {
        result.staff.forEach(staff => {
          const option = document.createElement('option');
          option.value = staff.id;
          option.textContent = staff.last_name + ', ' + staff.first_name;
          option.dataset.email = staff.email_school || '';
          select.appendChild(option);
        });
        if (result.staff.length > 0) {
          select.value = result.staff[0].id;
          showStaffEmailAndTimetable();
        }
      }
    });
}

function showStaffEmailAndTimetable() {
  const select = document.getElementById('staffSelect');
  const selectedOption = select.options[select.selectedIndex];
  const staffId = select.value;
  const email = selectedOption ? selectedOption.dataset.email : '';
  document.getElementById('staffEmail').textContent = email ? `Email: ${email}` : '';
  // Fetch timetable classes for this staff
  fetch(`/api/timetable/by-staff/${staffId}`)
    .then(res => res.json())
    .then(result => {
      const container = document.getElementById('timetableClassesContainer');
      if (result && Array.isArray(result.classes) && result.classes.length > 0) {
        let html = '<b>Timetable Classes:</b><ul>';
        result.classes.forEach(row => {
          html += `<li>${row.Form_Class || ''} - ${row.Teacher_Name || ''}</li>`;
        });
        html += '</ul>';
        container.innerHTML = html;
      } else {
        container.innerHTML = '<b>Timetable Classes:</b> None found.';
      }
    });
}

window.addEventListener('DOMContentLoaded', () => {
  fetchAndPopulateStaffDropdown();
  fetchAndRenderDepartmentTable();
  document.getElementById('staffSelect').addEventListener('change', showStaffEmailAndTimetable);
});
// Fetch and render the department table with all fields
function fetchAndRenderDepartmentTable() {
  fetch('/api/department/all')
    .then(res => res.json())
    .then(result => {
      if (result && Array.isArray(result.department)) {
        renderDepartmentTable(result.department);
      } else {
        document.getElementById('departmentTableContainer').innerHTML = '<div>No department data found.</div>';
      }
    })
    .catch(() => {
      document.getElementById('departmentTableContainer').innerHTML = '<div class="error">Failed to load department data.</div>';
    });
}

function renderDepartmentTable(rows) {
  const container = document.getElementById('departmentTableContainer');
  if (!container) return;
  // Define the headers you want to always show
  const headers = [
    'ID', 'Staff_Name', 'Classes', 'staff_email', 'First_Name', 'Last_Name', 'department'
  ];
  let html = '<table class="styled-table"><thead><tr>';
  headers.forEach(h => { html += `<th>${h}</th>`; });
  html += '</tr></thead><tbody>';
  if (rows && rows.length > 0) {
    rows.forEach(row => {
      html += '<tr>' + headers.map(h => `<td>${row[h] ?? ''}</td>`).join('') + '</tr>';
    });
  } else {
    html += '<tr>' + headers.map(() => '<td></td>').join('') + '</tr>';
  }
  html += '</tbody></table>';
  container.innerHTML = html;
}

window.addEventListener('DOMContentLoaded', fetchAndRenderDepartmentTable);

// Delete all department rows
document.getElementById('deleteAllBtn').addEventListener('click', function() {
  if (confirm('Are you sure you want to delete all department data?')) {
    fetch('/api/department/delete-all', { method: 'POST' })
      .then(res => res.json())
      .then(result => {
        if (result.success) {
          fetchAndRenderDepartmentTable();
        } else {
          alert('Failed to delete department data.');
        }
      })
      .catch(() => alert('Failed to delete department data.'));
  }
});

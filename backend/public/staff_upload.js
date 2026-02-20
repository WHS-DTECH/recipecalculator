// Fetch and display the staff_upload table
function fetchAndRenderStaffUploadTable() {
  fetch('/api/staff_upload/all')
    .then(res => res.json())
    .then(result => {
      if (result && Array.isArray(result.staff)) {
        renderStaffUploadTable(result.staff);
      }
    })
    .catch(() => {
      const container = document.getElementById('departmentTableContainer');
      if (container) container.innerHTML = '<div class="error">Failed to load staff upload data.</div>';
    });
}

function renderStaffUploadTable(rows) {
  const container = document.getElementById('departmentTableContainer');
  if (!container) return;
  let html = '<h2>Staff Upload Table</h2>';
  html += '<table class="staff-table"><thead><tr><th>ID</th><th>Code</th><th>Last Name</th><th>First Name</th><th>Title</th><th>Email (School)</th></tr></thead><tbody>';
  rows.forEach(row => {
    html += `<tr><td>${row.id}</td><td>${row.code || ''}</td><td>${row.last_name || ''}</td><td>${row.first_name || ''}</td><td>${row.title || ''}</td><td>${row.email_school || ''}</td></tr>`;
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

// Call on page load
window.addEventListener('DOMContentLoaded', fetchAndRenderStaffUploadTable);
// Staff CSV Upload & Preview
document.getElementById('uploadForm').addEventListener('submit', function(e) {
  e.preventDefault();
  const fileInput = document.getElementById('csvFile');
  const file = fileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(evt) {
    const text = evt.target.result;
    // Use PapaParse for robust CSV parsing
    const parsed = Papa.parse(text, { skipEmptyLines: true });
    const rows = parsed.data;
    if (!rows || rows.length < 2) {
      document.getElementById('uploadResult').textContent = 'CSV file is empty or invalid.';
      return;
    }
    const headers = rows[0];
    const data = rows.slice(1).filter(rowArr => rowArr.length === headers.length && rowArr.join() !== headers.join());
    fetch('/api/staff_upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staff: data })
    })
    .then(res => res.json())
    .then(result => {
      if (result.success && data.length > 0) {
        renderStaffTable(headers, data);
        document.getElementById('uploadResult').textContent = 'Upload and import successful!';
      } else if (data.length === 0) {
        document.getElementById('uploadResult').textContent = 'No valid staff data found in CSV.';
      } else {
        document.getElementById('uploadResult').textContent = 'Import failed: ' + (result.error || 'Unknown error');
      }
    })
    .catch(err => {
      document.getElementById('uploadResult').textContent = 'Import failed: ' + err;
    });
  };
  reader.readAsText(file);
});

function renderStaffTable(headers, data) {
  const table = document.createElement('table');
  table.className = 'staff-table';
  const thead = document.createElement('thead');
  const trHead = document.createElement('tr');
  headers.forEach(h => {
    const th = document.createElement('th');
    th.textContent = h;
    trHead.appendChild(th);
  });
  thead.appendChild(trHead);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  data.forEach(row => {
    if (row.length < 2) return;
    const tr = document.createElement('tr');
    row.forEach(cell => {
      const td = document.createElement('td');
      td.textContent = cell;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  const container = document.getElementById('staffTableContainer');
  container.innerHTML = '';
  container.appendChild(table);
}

// Class CSV Upload Script (modeled after staff_upload.js)
// Assumes backend endpoint /api/class-upload for POST

function fetchAndRenderClassUploadTable() {
  fetch('/api/class_upload/all')
    .then(res => res.json())
    .then(result => {
      if (result && Array.isArray(result.classes)) {
        renderClassUploadTable(result.classes);
      }
    })
    .catch(() => {
      const container = document.getElementById('classTableContainer');
      if (container) container.innerHTML = '<div class="error">Failed to load class upload data.</div>';
    });
}

function renderClassUploadTable(rows) {
  const container = document.getElementById('classTableContainer');
  if (!container) return;
  let html = '<h2>Class Upload Table</h2>';
  html += '<button id="deleteAllClassesBtn" style="margin-bottom:1rem;background:#d9534f;color:white;border:none;padding:0.5rem 1rem;border-radius:4px;cursor:pointer;">DELETE ALL</button>';
  html += '<table class="class-table"><thead><tr>' +
    '<th>ID</th>' +
    '<th>TTCode</th>' +
    '<th>Level</th>' +
    '<th>Name</th>' +
    '<th>Qualification</th>' +
    '<th>Department</th>' +
    '<th>Sub Department</th>' +
    '<th>Teacher in Charge</th>' +
    '<th>Description</th>' +
    '<th>STAR</th>' +
    '</tr></thead><tbody>';
  rows.forEach(row => {
    html += `<tr>` +
      `<td>${row.id || ''}</td>` +
      `<td>${row.ttcode || ''}</td>` +
      `<td>${row.level || ''}</td>` +
      `<td>${row.name || ''}</td>` +
      `<td>${row.qualification || ''}</td>` +
      `<td>${row.department || ''}</td>` +
      `<td>${row.sub_department || ''}</td>` +
      `<td>${row.teacher_in_charge || ''}</td>` +
      `<td>${row.description || ''}</td>` +
      `<td>${row.star || ''}</td>` +
      `</tr>`;
  });
  html += '</tbody></table>';
  container.innerHTML = html;
  // Add DELETE ALL event
  const delBtn = document.getElementById('deleteAllClassesBtn');
  if (delBtn) {
    delBtn.onclick = function() {
      if (confirm('Are you sure you want to delete ALL class records? This cannot be undone.')) {
        fetch('/api/class-upload/all', { method: 'DELETE' })
          .then(res => res.json())
          .then(result => {
            if (result.success) {
              fetchAndRenderClassUploadTable();
            } else {
              alert('Failed to delete all classes.');
            }
          })
          .catch(() => alert('Failed to delete all classes.'));
      }
    };
  }
}

// Call on page load
window.addEventListener('DOMContentLoaded', fetchAndRenderClassUploadTable);
// Class CSV Upload & Preview
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
    fetch('/api/class-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classes: data })
    })
    .then(res => res.json())
    .then(result => {
      if (result.success && data.length > 0) {
        renderClassTable(headers, data);
        document.getElementById('uploadResult').textContent = 'Upload and import successful!';
      } else if (data.length === 0) {
        document.getElementById('uploadResult').textContent = 'No valid class data found in CSV.';
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

function renderClassTable(headers, data) {
  const table = document.createElement('table');
  table.className = 'class-table';
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
  const container = document.getElementById('classTableContainer');
  container.innerHTML = '';
  container.appendChild(table);
}

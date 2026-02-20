// Fetch and render the latest timetable from the database
function fetchAndRenderTimetableTable() {
  fetch('/api/timetable/all')
    .then(res => res.json())
    .then(result => {
      if (result && Array.isArray(result.timetable) && result.timetable.length > 0) {
        const headers = Object.keys(result.timetable[0]);
        const data = result.timetable.map(row => headers.map(h => row[h]));
        renderTimetableTable(headers, data);
      }
    });
}

// Render timetable table on page load
window.addEventListener('DOMContentLoaded', fetchAndRenderTimetableTable);
// Timetable CSV Upload & Preview

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
    fetch('/api/upload_timetable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timetable: data, headers })
    })
    .then(res => res.json())
    .then(result => {
      if (result.success && data.length > 0) {
        fetchAndRenderTimetableTable();
        document.getElementById('uploadResult').textContent = 'Upload and import successful!';
      } else if (data.length === 0) {
        document.getElementById('uploadResult').textContent = 'No valid timetable data found in CSV.';
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

function renderTimetableTable(headers, data) {
  const container = document.getElementById('timetableTableContainer');
  let html = '<table class="styled-table"><thead><tr>';
  headers.forEach(h => { html += `<th>${h}</th>`; });
  html += '</tr></thead><tbody>';
  data.forEach(row => {
    html += '<tr>' + row.map(cell => `<td>${cell}</td>`).join('') + '</tr>';
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

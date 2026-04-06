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

function ensureUploadProgressUi() {
  let wrap = document.getElementById('uploadProgressWrap');
  if (wrap) return wrap;

  const uploadResult = document.getElementById('uploadResult');
  if (!uploadResult || !uploadResult.parentNode) return null;

  wrap = document.createElement('div');
  wrap.id = 'uploadProgressWrap';
  wrap.style.marginTop = '0.75rem';
  wrap.style.display = 'none';

  const label = document.createElement('div');
  label.id = 'uploadProgressLabel';
  label.style.fontSize = '0.9rem';
  label.style.marginBottom = '0.25rem';
  label.textContent = 'Preparing upload...';

  const progress = document.createElement('progress');
  progress.id = 'uploadProgressBar';
  progress.max = 100;
  progress.value = 0;
  progress.style.width = '100%';
  progress.style.height = '16px';

  wrap.appendChild(label);
  wrap.appendChild(progress);
  uploadResult.parentNode.insertBefore(wrap, uploadResult.nextSibling);
  return wrap;
}

function setUploadProgress(stepLabel, pct) {
  const wrap = ensureUploadProgressUi();
  if (!wrap) return;
  const label = document.getElementById('uploadProgressLabel');
  const bar = document.getElementById('uploadProgressBar');
  wrap.style.display = 'block';
  if (label) label.textContent = `${stepLabel} ${Math.max(0, Math.min(100, Math.round(pct)))}%`;
  if (bar) bar.value = Math.max(0, Math.min(100, pct));
}

function hideUploadProgress() {
  const wrap = document.getElementById('uploadProgressWrap');
  if (wrap) wrap.style.display = 'none';
}

function uploadTimetableWithProgress(payload, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload_timetable');
    xhr.setRequestHeader('Content-Type', 'application/json');

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable && onProgress) {
        const pct = (evt.loaded / evt.total) * 100;
        onProgress(pct);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch (err) {
          reject(new Error('Invalid JSON response from server'));
        }
      } else {
        let errMsg = `Upload failed with status ${xhr.status}`;
        try {
          const parsed = JSON.parse(xhr.responseText);
          if (parsed && parsed.error) errMsg = parsed.error;
        } catch (_) {}
        reject(new Error(errMsg));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(JSON.stringify(payload));
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
  const uploadResult = document.getElementById('uploadResult');
  if (uploadResult) uploadResult.textContent = '';
  setUploadProgress('Reading file...', 0);

  const reader = new FileReader();
  reader.onprogress = function(evt) {
    if (!evt.lengthComputable) return;
    setUploadProgress('Reading file...', (evt.loaded / evt.total) * 40);
  };

  reader.onload = function(evt) {
    const text = evt.target.result;
    // Use PapaParse for robust CSV parsing
    const parsed = Papa.parse(text, { skipEmptyLines: true });
    const rows = parsed.data;
    if (!rows || rows.length < 2) {
      document.getElementById('uploadResult').textContent = 'CSV file is empty or invalid.';
      hideUploadProgress();
      return;
    }
    const headers = rows[0];
    const data = rows.slice(1).filter(rowArr => rowArr.length === headers.length && rowArr.join() !== headers.join());
    setUploadProgress(`Uploading ${data.length} rows...`, 45);

    uploadTimetableWithProgress(
      { timetable: data, headers },
      (pct) => setUploadProgress(`Uploading ${data.length} rows...`, 45 + (pct * 0.5))
    )
    .then(result => {
      setUploadProgress('Finalizing...', 100);
      if (result.success && data.length > 0) {
        fetchAndRenderTimetableTable();
        document.getElementById('uploadResult').textContent =
          'Sync complete. Processed: ' + (result.processed || 0) +
          ', Inserted: ' + (result.inserted || 0) +
          ', Updated: ' + (result.updated || 0) +
          ', Marked Not Current: ' + (result.marked_not_current || 0) +
          ', Skipped (no Teacher): ' + (result.skipped_no_teacher || 0) +
          ', Duplicate Teachers in upload: ' + (result.duplicate_teachers_in_upload || 0);
      } else if (data.length === 0) {
        document.getElementById('uploadResult').textContent = 'No valid timetable data found in CSV.';
      } else {
        document.getElementById('uploadResult').textContent = 'Import failed: ' + (result.error || 'Unknown error');
      }
      setTimeout(hideUploadProgress, 800);
    })
    .catch(err => {
      document.getElementById('uploadResult').textContent = 'Import failed: ' + err;
      hideUploadProgress();
    });
  };

  reader.onerror = function() {
    document.getElementById('uploadResult').textContent = 'Import failed: could not read file.';
    hideUploadProgress();
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

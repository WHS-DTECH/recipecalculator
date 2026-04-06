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

function uploadStaffWithProgress(payload, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/staff_upload');
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

function renderStaffUploadTable(rows) {
  const container = document.getElementById('departmentTableContainer');
  if (!container) return;
  let html = '<h2>Staff Upload Table</h2>';
  html += '<table class="staff-table"><thead><tr><th>ID</th><th>Code</th><th>Last Name</th><th>First Name</th><th>Title</th><th>Email (School)</th><th>Status</th></tr></thead><tbody>';
  rows.forEach(row => {
    html += `<tr><td>${row.id}</td><td>${row.code || ''}</td><td>${row.last_name || ''}</td><td>${row.first_name || ''}</td><td>${row.title || ''}</td><td>${row.email_school || ''}</td><td>${row.status || 'Current'}</td></tr>`;
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

    uploadStaffWithProgress(
      { headers, staff: data },
      (pct) => setUploadProgress(`Uploading ${data.length} rows...`, 45 + (pct * 0.5))
    )
    .then(result => {
      setUploadProgress('Finalizing...', 100);
      if (result.success && data.length > 0) {
        fetchAndRenderStaffUploadTable();
        document.getElementById('uploadResult').textContent =
          'Sync complete. Processed: ' + (result.processed || 0) +
          ', Inserted: ' + (result.inserted || 0) +
          ', Updated: ' + (result.updated || 0) +
          ', Marked Not Current: ' + (result.marked_not_current || 0) +
          ', Skipped (no email): ' + (result.skipped_no_email || 0) +
          ', Duplicate emails in upload: ' + (result.duplicate_emails_in_upload || 0);
      } else if (data.length === 0) {
        document.getElementById('uploadResult').textContent = 'No valid staff data found in CSV.';
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

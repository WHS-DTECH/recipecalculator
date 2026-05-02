function getCurrentStaffEmail() {
  try {
    const raw = sessionStorage.getItem('currentStaffUser');
    const parsed = raw ? JSON.parse(raw) : null;
    return String(parsed && parsed.email_school ? parsed.email_school : '').trim().toLowerCase();
  } catch (err) {
    return '';
  }
}

function toIsoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function setDefaultDates() {
  const startEl = document.getElementById('prefillStartDate');
  const endEl = document.getElementById('prefillEndDate');
  if (!startEl || !endEl) return;

  const now = new Date();
  startEl.value = toIsoDate(now);
  endEl.value = `${now.getFullYear()}-12-31`;
}

function setStatus(message, isError) {
  const statusEl = document.getElementById('prefillStatus');
  if (!statusEl) return;
  statusEl.textContent = String(message || '');
  statusEl.classList.toggle('error', !!isError);
}

function setResults(payload) {
  const resultsEl = document.getElementById('prefillResults');
  if (!resultsEl) return;
  resultsEl.textContent = JSON.stringify(payload || {}, null, 2);
}

function setAuditResults(payload) {
  const resultsEl = document.getElementById('prefillAuditResults');
  if (!resultsEl) return;

  const candidates = Array.isArray(payload && payload.candidates) ? payload.candidates : [];
  if (!candidates.length) {
    resultsEl.textContent = 'No re-save candidates found for the selected date range.';
    return;
  }

  const lines = [];
  lines.push(`Candidates: ${candidates.length}`);
  lines.push('');
  for (const row of candidates) {
    lines.push([
      `Booking #${row.booking_id}`,
      row.booking_date || '',
      `P${row.period || ''}`,
      row.staff_name || '(No teacher)',
      row.class_name || '(No class)',
      row.recipe || '(No recipe)',
      row.reason || ''
    ].join(' | '));
  }
  resultsEl.textContent = lines.join('\n');
}

async function runPrefill(dryRun) {
  const startEl = document.getElementById('prefillStartDate');
  const endEl = document.getElementById('prefillEndDate');
  const dryBtn = document.getElementById('prefillDryRunBtn');
  const runBtn = document.getElementById('prefillRunBtn');

  const email = getCurrentStaffEmail();
  if (!email) {
    setStatus('Could not determine admin email from session.', true);
    return;
  }

  const body = {
    dryRun: !!dryRun,
    startDate: startEl && startEl.value ? startEl.value : undefined,
    endDate: endEl && endEl.value ? endEl.value : undefined
  };

  if (dryBtn) dryBtn.disabled = true;
  if (runBtn) runBtn.disabled = true;
  setStatus(dryRun ? 'Running dry run...' : 'Preloading bookings...', false);

  try {
    const resp = await fetch('/api/bookings/prefill-from-planner', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-email': email
      },
      body: JSON.stringify(body)
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data.success === false) {
      throw new Error(data.error || `Request failed (${resp.status})`);
    }
    setResults(data);
    if (window.QC && typeof window.QC.toast === 'function') {
      window.QC.toast(dryRun ? 'Dry run complete' : 'Prefill complete', 'success');
    }
    setStatus(dryRun ? 'Dry run complete.' : 'Prefill complete.', false);
  } catch (err) {
    setStatus(err.message || 'Request failed.', true);
    if (window.QC && typeof window.QC.toast === 'function') {
      window.QC.toast(err.message || 'Request failed', 'error');
    }
  } finally {
    if (dryBtn) dryBtn.disabled = false;
    if (runBtn) runBtn.disabled = false;
  }
}

async function runResaveAudit() {
  const startEl = document.getElementById('prefillStartDate');
  const endEl = document.getElementById('prefillEndDate');
  const auditBtn = document.getElementById('prefillResaveAuditBtn');
  const email = getCurrentStaffEmail();

  if (!email) {
    setStatus('Could not determine admin email from session.', true);
    return;
  }

  const params = new URLSearchParams();
  if (startEl && startEl.value) params.set('startDate', startEl.value);
  if (endEl && endEl.value) params.set('endDate', endEl.value);
  params.set('limit', '500');

  if (auditBtn) auditBtn.disabled = true;
  setStatus('Checking bookings that likely need re-save...', false);

  try {
    const resp = await fetch(`/api/bookings/admin/resave-candidates?${params.toString()}`, {
      headers: {
        'x-user-email': email
      }
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data.success === false) {
      throw new Error(data.error || `Request failed (${resp.status})`);
    }
    setAuditResults(data);
    setStatus('Re-save audit complete.', false);
    if (window.QC && typeof window.QC.toast === 'function') {
      window.QC.toast('Re-save audit complete', 'success');
    }
  } catch (err) {
    setStatus(err.message || 'Audit request failed.', true);
    if (window.QC && typeof window.QC.toast === 'function') {
      window.QC.toast(err.message || 'Audit request failed', 'error');
    }
  } finally {
    if (auditBtn) auditBtn.disabled = false;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  setDefaultDates();
  const dryBtn = document.getElementById('prefillDryRunBtn');
  const runBtn = document.getElementById('prefillRunBtn');
  const auditBtn = document.getElementById('prefillResaveAuditBtn');

  if (dryBtn) {
    dryBtn.addEventListener('click', () => runPrefill(true));
  }
  if (runBtn) {
    runBtn.addEventListener('click', () => {
      const yes = window.confirm('Create bookings now? This inserts class bookings for matching double periods.');
      if (!yes) return;
      runPrefill(false);
    });
  }
  if (auditBtn) {
    auditBtn.addEventListener('click', runResaveAudit);
  }
});
function getQueryParam(name) {
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function initialsForName(firstName, lastName) {
  const first = String(firstName || '').trim().charAt(0);
  const last = String(lastName || '').trim().charAt(0);
  return (first + last || 'UP').toUpperCase();
}

function setHeroDetails(user, department) {
  const nameEl = document.getElementById('profileName');
  const subtitleEl = document.getElementById('profileSubtitle');
  const avatarEl = document.getElementById('profileAvatar');
  const modeChipEl = document.getElementById('profileModeChip');

  if (!nameEl || !subtitleEl || !avatarEl || !modeChipEl) return;

  if (!user) {
    nameEl.textContent = 'User Profile';
    subtitleEl.textContent = 'Account details and sign-in readiness for future Google Login.';
    avatarEl.textContent = 'UP';
    modeChipEl.textContent = 'Waiting for user context';
    return;
  }

  const fullName = `${String(user.first_name || '').trim()} ${String(user.last_name || '').trim()}`.trim() || 'User Profile';
  const subtitleParts = [];
  if (department) subtitleParts.push(department);
  if (user.title) subtitleParts.push(String(user.title).trim());
  if (user.email_school) subtitleParts.push(String(user.email_school).trim());

  nameEl.textContent = fullName;
  subtitleEl.textContent = subtitleParts.join(' • ') || 'Profile loaded from current staff data.';
  avatarEl.textContent = initialsForName(user.first_name, user.last_name);
  modeChipEl.textContent = 'Current staff profile mode';
}

function renderProfileFacts(user, department) {
  const container = document.getElementById('profileContainer');
  if (!container) return;

  if (!user) {
    container.innerHTML = '<div class="profile-empty">Open this page from the navbar user link, or pass a user ID in the query string to preview a staff profile.</div>';
    return;
  }

  const facts = [
    ['First Name', user.first_name || ''],
    ['Last Name', user.last_name || ''],
    ['Title', user.title || 'Not set'],
    ['School Email', user.email_school || 'Not set'],
    ['Staff Code', user.code || 'Not set'],
    ['Department', department || 'Not assigned'],
    ['Google Account', 'Not connected yet'],
    ['Sign-In State', 'Prepared for future Google Login']
  ];

  container.innerHTML = `
    <div class="profile-facts">
      ${facts.map(([label, value]) => `
        <div class="profile-fact">
          <div class="profile-fact-label">${escapeHtml(label)}</div>
          <div class="profile-fact-value">${escapeHtml(value)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderError(message) {
  const container = document.getElementById('profileContainer');
  if (!container) return;
  container.innerHTML = `<div class="profile-error">${escapeHtml(message || 'Failed to load user profile.')}</div>`;
}

async function fetchDepartmentForUser(user) {
  if (!user) return '';
  try {
    const depRes = await fetch('/api/department/all');
    const depData = await depRes.json();
    if (!Array.isArray(depData.department)) return '';

    const depRow = depData.department.find((row) =>
      row.First_Name && row.Last_Name &&
      row.First_Name.toLowerCase() === String(user.first_name || '').toLowerCase() &&
      row.Last_Name.toLowerCase() === String(user.last_name || '').toLowerCase()
    );

    return depRow && depRow.department ? String(depRow.department) : '';
  } catch (_) {
    return '';
  }
}

async function fetchAndRenderUserProfile() {
  const userId = getQueryParam('user');

  if (!userId) {
    setHeroDetails(null, '');
    renderProfileFacts(null, '');
    return;
  }

  try {
    const staffRes = await fetch('/api/staff_upload/all');
    const staffData = await staffRes.json();
    const user = (staffData.staff || []).find((entry) => String(entry.id) === String(userId));

    if (!user) {
      setHeroDetails(null, '');
      renderError('No user profile found for this link.');
      return;
    }

    const department = await fetchDepartmentForUser(user);
    setHeroDetails(user, department);
    renderProfileFacts(user, department);
  } catch (err) {
    setHeroDetails(null, '');
    renderError(`Failed to load user profile: ${err && err.message ? err.message : 'Unknown error'}`);
  }
}

window.addEventListener('DOMContentLoaded', fetchAndRenderUserProfile);

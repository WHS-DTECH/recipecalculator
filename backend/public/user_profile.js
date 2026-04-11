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

function fetchJson(url) {
  return fetch(url, { credentials: 'include' })
    .then((res) => res.json().catch(() => ({})).then((data) => ({ ok: res.ok, data })));
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value;
}

function setHero(staff, authUser, department) {
  const nameEl = document.getElementById('profileName');
  const subtitleEl = document.getElementById('profileSubtitle');
  const avatarEl = document.getElementById('profileAvatar');
  const modeChipEl = document.getElementById('profileModeChip');

  if (!nameEl || !subtitleEl || !avatarEl || !modeChipEl) return;

  if (!staff && !authUser) {
    nameEl.textContent = 'User Profile';
    subtitleEl.textContent = 'Sign in with Google to load staff profile, department, and timetable data.';
    avatarEl.textContent = 'UP';
    avatarEl.style.backgroundImage = '';
    modeChipEl.textContent = 'Signed out';
    return;
  }

  const fullName = staff
    ? `${String(staff.first_name || '').trim()} ${String(staff.last_name || '').trim()}`.trim()
    : String(authUser.name || authUser.email || 'User Profile');

  const subtitleParts = [];
  if (department && department.primary) subtitleParts.push(department.primary);
  if (staff && staff.title) subtitleParts.push(String(staff.title).trim());
  if (authUser && authUser.email) subtitleParts.push(String(authUser.email).trim());

  nameEl.textContent = fullName || 'User Profile';
  subtitleEl.textContent = subtitleParts.join(' • ') || 'Google account connected.';
  modeChipEl.textContent = staff ? 'Linked to Staff CSV profile' : 'Google session only';

  if (authUser && authUser.picture) {
    avatarEl.textContent = '';
    avatarEl.style.backgroundImage = `url(${authUser.picture})`;
    avatarEl.style.backgroundSize = 'cover';
    avatarEl.style.backgroundPosition = 'center';
  } else {
    avatarEl.style.backgroundImage = '';
    avatarEl.textContent = initialsForName(staff && staff.first_name, staff && staff.last_name);
  }
}

function renderProfileFacts(staff, authUser, profileData) {
  const container = document.getElementById('profileContainer');
  if (!container) return;

  if (!authUser) {
    container.innerHTML = '<div class="profile-empty">No Google session is active. Click Login in the navbar to sign in.</div>';
    return;
  }

  const department = profileData && profileData.department ? profileData.department : null;
  const roles = profileData && profileData.roles ? profileData.roles : null;

  const facts = [
    ['Display Name', authUser.name || 'Not set'],
    ['Google Email', authUser.email || 'Not set'],
    ['Staff Code', (staff && staff.code) || 'Not linked'],
    ['Department', (department && (department.primary || department.all)) || 'Not linked'],
    ['Role in App', (roles && roles.effective_role) || authUser.role || 'public_access'],
    ['Additional Roles', (roles && (roles.additional_roles || []).join(', ')) || 'None'],
    ['Form Class', (profileData && profileData.timetable && profileData.timetable.form_class) || 'Not available'],
    ['Staff Record', staff ? 'Linked from Staff CSV' : 'Not found in Staff CSV']
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

function renderGoogleSection(authUser, profileData) {
  const dot = document.getElementById('googleStateDot');
  const title = document.getElementById('googleStateTitle');
  const copy = document.getElementById('googleStateCopy');
  const checklist = document.getElementById('googleChecklist');
  const actionBtn = document.getElementById('profileAuthAction');

  const isConnected = Boolean(authUser && authUser.email);
  const isDomainApproved = Boolean(authUser && authUser.domainApproved);
  const isStaffLinked = Boolean(authUser && authUser.staffLinked);

  if (dot) {
    dot.style.background = isConnected ? '#2e7d32' : '#c17d11';
    dot.style.boxShadow = isConnected
      ? '0 0 0 4px rgba(46, 125, 50, 0.12)'
      : '0 0 0 4px rgba(193, 125, 17, 0.12)';
  }

  if (title) {
    title.textContent = isConnected
      ? `Connected as ${authUser.email}`
      : 'Google account is not connected';
  }

  if (copy) {
    copy.textContent = isConnected
      ? 'Session is active and profile data is being resolved from staff, timetable, and department tables.'
      : 'Sign in to load your linked staff profile and timetable information.';
  }

  if (checklist) {
    const role = (profileData && profileData.roles && profileData.roles.effective_role) || (authUser && authUser.role) || 'public_access';
    checklist.innerHTML = [
      `Session: ${isConnected ? 'Active' : 'Not active'}`,
      `Domain approval: ${isDomainApproved ? 'Approved' : 'Not approved'}`,
      `Staff CSV link: ${isStaffLinked ? 'Matched' : 'No matching staff record'}`,
      `Effective role: ${role}`
    ].map((line) => `<li>${escapeHtml(line)}</li>`).join('');
  }

  if (actionBtn) {
    actionBtn.disabled = false;
    if (isConnected) {
      actionBtn.textContent = 'Sign Out';
      actionBtn.classList.remove('profile-action-muted');
      actionBtn.onclick = function() {
        fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
          .catch(() => null)
          .finally(() => {
            sessionStorage.removeItem('navbar_user_role');
            window.location.href = 'google_login.html';
          });
      };
    } else {
      actionBtn.textContent = 'Sign In With Google';
      actionBtn.classList.remove('profile-action-muted');
      actionBtn.onclick = function() {
        window.location.href = 'google_login.html';
      };
    }
  }

  setText('factAuthProvider', 'Google Workspace');
  setText('factAuthStatus', isConnected ? 'Connected' : 'Not connected');
  setText('factDomainStatus', isDomainApproved ? 'Approved' : 'Pending approval');
  setText('factSessionSource', isConnected ? 'Google session cookie' : 'No active session');
}

function renderDataLinks(profileData) {
  const container = document.getElementById('profileDataLinks');
  if (!container) return;

  if (!profileData || !profileData.staff) {
    container.innerHTML = '<div class="profile-empty">Staff, Department, and Timetable links will appear after sign-in and profile match.</div>';
    return;
  }

  const department = profileData.department || {};
  const timetable = profileData.timetable || {};
  container.innerHTML = `
    <div class="profile-facts">
      <div class="profile-fact">
        <div class="profile-fact-label">Staff CSV</div>
        <div class="profile-fact-value">Matched by email/code</div>
      </div>
      <div class="profile-fact">
        <div class="profile-fact-label">Department CSV</div>
        <div class="profile-fact-value">${escapeHtml(department.primary || department.all || 'No department match')}</div>
      </div>
      <div class="profile-fact">
        <div class="profile-fact-label">Timetable CSV</div>
        <div class="profile-fact-value">${escapeHtml(timetable.teacher_code || 'No teacher code match')}</div>
      </div>
      <div class="profile-fact">
        <div class="profile-fact-label">Assigned Classes</div>
        <div class="profile-fact-value">${escapeHtml(department.classes || 'Not set')}</div>
      </div>
    </div>
  `;
}

function renderTimetable(profileData) {
  const container = document.getElementById('profileTimetable');
  if (!container) return;

  const week = profileData && profileData.timetable && Array.isArray(profileData.timetable.week)
    ? profileData.timetable.week
    : [];

  if (!week.length) {
    container.innerHTML = '<div class="profile-empty">No timetable rows found for this profile yet.</div>';
    return;
  }

  const rows = week.map((dayRow) => {
    const p1 = (dayRow.periods && dayRow.periods.P1 || []).join(', ');
    const p2 = (dayRow.periods && dayRow.periods.P2 || []).join(', ');
    const p3 = (dayRow.periods && dayRow.periods.P3 || []).join(', ');
    const p4 = (dayRow.periods && dayRow.periods.P4 || []).join(', ');
    const p5 = (dayRow.periods && dayRow.periods.P5 || []).join(', ');
    return `
      <tr>
        <td>${escapeHtml(dayRow.day || '')}</td>
        <td>${escapeHtml(p1 || '-')}</td>
        <td>${escapeHtml(p2 || '-')}</td>
        <td>${escapeHtml(p3 || '-')}</td>
        <td>${escapeHtml(p4 || '-')}</td>
        <td>${escapeHtml(p5 || '-')}</td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <div style="overflow:auto;">
      <table class="styled-table" style="width:100%; min-width:660px;">
        <thead>
          <tr>
            <th>Day</th>
            <th>P1</th>
            <th>P2</th>
            <th>P3</th>
            <th>P4</th>
            <th>P5</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

async function resolveProfileFromUserId(userId) {
  const staffRes = await fetchJson('/api/staff_upload/all');
  if (!staffRes.ok || !Array.isArray(staffRes.data.staff)) return null;
  const staff = staffRes.data.staff.find((entry) => String(entry.id) === String(userId));
  if (!staff || !staff.email_school) return null;
  return String(staff.email_school).trim().toLowerCase();
}

async function fetchAndRenderUserProfile() {
  try {
    const authRes = await fetchJson('/api/auth/me');
    const authUser = authRes.ok && authRes.data && authRes.data.authenticated ? authRes.data.user : null;

    let profileEmail = authUser && authUser.email ? String(authUser.email).toLowerCase() : '';
    if (!profileEmail) {
      const userId = getQueryParam('user');
      if (userId) {
        profileEmail = await resolveProfileFromUserId(userId);
      }
    }

    let profileData = null;
    if (profileEmail) {
      const profileRes = await fetchJson(`/api/user_roles/profile?userType=staff&identifier=${encodeURIComponent(profileEmail)}`);
      if (profileRes.ok && profileRes.data && profileRes.data.success && profileRes.data.isStaff) {
        profileData = profileRes.data;
      }
    }

    const staff = profileData && profileData.staff ? profileData.staff : null;
    const department = profileData && profileData.department ? profileData.department : null;

    if (authUser && authUser.role) {
      try {
        sessionStorage.setItem('navbar_user_role', authUser.role);
      } catch (_) {}
    }

    setHero(staff, authUser, department);
    renderGoogleSection(authUser, profileData);
    renderProfileFacts(staff, authUser, profileData);
    renderTimetable(profileData);
    renderDataLinks(profileData);
  } catch (err) {
    const container = document.getElementById('profileContainer');
    if (container) {
      container.innerHTML = `<div class="profile-error">${escapeHtml(err && err.message ? err.message : 'Failed to load profile.')}</div>`;
    }
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', fetchAndRenderUserProfile);
} else {
  fetchAndRenderUserProfile();
}

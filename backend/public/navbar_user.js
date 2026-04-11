// Dynamically set the username in the navbar and persist a reusable staff context.
// This remains demo-backed for now, but the stored shape is intended to match future auth handoff.

const CURRENT_STAFF_USER_KEY = 'currentStaffUser';
const PREFERRED_ADMIN_EMAIL = 'vanessapringle@westlandhigh.school.nz';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function persistCurrentStaffUser(user) {
  if (!user) return;
  try {
    sessionStorage.setItem(CURRENT_STAFF_USER_KEY, JSON.stringify({
      id: user.id || '',
      code: user.code || '',
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      title: user.title || '',
      email_school: user.email_school || ''
    }));
  } catch (_) {
    // Ignore storage failures and continue rendering navbar user info.
  }
}

function selectPreloginUser(staffRows) {
  if (!Array.isArray(staffRows) || staffRows.length === 0) return null;
  return staffRows.find((user) => normalizeEmail(user.email_school) === PREFERRED_ADMIN_EMAIL) || staffRows[0];
}

function setNavbarUsername() {
  fetch('/api/staff_upload/all')
    .then(res => res.json())
    .then(result => {
      if (result && Array.isArray(result.staff) && result.staff.length > 0) {
        const user = selectPreloginUser(result.staff);
        if (!user) return;
        const username = user.first_name + ' ' + user.last_name;
        const link = document.getElementById('navbarUsername');
        persistCurrentStaffUser(user);
        if (link) {
          link.textContent = username;
          link.href = 'user_profile.html?user=' + encodeURIComponent(user.id);
        }
      }
    });
}

window.addEventListener('DOMContentLoaded', setNavbarUsername);

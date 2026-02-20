// --- Backend Integration Required ---
// Remove demo data. Fetch users and roles from backend API when available.
// Example fetch (to be implemented):
// fetch('/api/user-roles').then(res => res.json()).then(data => renderUserRolesTable(data.users));

function renderUserRolesTable(users = []) {
  const body = document.getElementById('userRolesBody');
  if (!users.length) {
    body.innerHTML = '<tr><td colspan="3" class="text-muted">No users found.</td></tr>';
    return;
  }
  body.innerHTML = users.map(u =>
    `<tr><td>${u.email}</td><td>${u.roles.map(r => `<span class='role-badge'>${r}</span>`).join(' ')}</td><td><button class='delete-btn'>Remove Roles</button></td></tr>`
  ).join('');
}

// Example usage (to be replaced with real data):
// renderUserRolesTable([]);

// --- Backend Integration Required ---
// Remove demo data. Fetch roles and permissions from backend API when available.
// Example fetch (to be implemented):
// fetch('/api/permissions').then(res => res.json()).then(data => renderPermissionsTable(data.roles));

function renderPermissionsTable(roles = []) {
  const body = document.getElementById('permissionsBody');
  if (!roles.length) {
    body.innerHTML = '<tr><td colspan="7" class="text-muted">No roles found.</td></tr>';
    return;
  }
  body.innerHTML = roles.map(role =>
    `<tr><td>${role.name}</td>` +
    role.permissions.map(p => `<td>${p ? '✔️' : ''}</td>`).join('') +
    '</tr>'
  ).join('');
}

// Example usage (to be replaced with real data):
// renderPermissionsTable([]);

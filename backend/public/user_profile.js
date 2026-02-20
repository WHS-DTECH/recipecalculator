// Simple User Profile Page Example
// This demo fetches the first staff_upload user as the profile (replace with real auth/user logic as needed)


function getQueryParam(name) {
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}

async function fetchAndRenderUserProfile() {
  const userId = getQueryParam('user');
  const container = document.getElementById('profileContainer');
  if (!userId) {
    container.innerHTML = '<div class="error">No user specified.</div>';
    return;
  }
  try {
    // Fetch staff_upload user by id
    const staffRes = await fetch('/api/staff_upload/all');
    const staffData = await staffRes.json();
    const user = (staffData.staff || []).find(u => String(u.id) === String(userId));
    if (!user) {
      container.innerHTML = '<div>No user profile found.</div>';
      return;
    }
    // Fetch department info for this user (by first/last name)
    let department = '';
    try {
      const depRes = await fetch('/api/department/all');
      const depData = await depRes.json();
      if (Array.isArray(depData.department)) {
        const depRow = depData.department.find(row =>
          row.First_Name && row.Last_Name &&
          row.First_Name.toLowerCase() === (user.first_name || '').toLowerCase() &&
          row.Last_Name.toLowerCase() === (user.last_name || '').toLowerCase()
        );
        if (depRow && depRow.department) department = depRow.department;
      }
    } catch {}
    let html = '<table class="styled-table">';
    html += `<tr><th>First Name</th><td>${user.first_name || ''}</td></tr>`;
    html += `<tr><th>Last Name</th><td>${user.last_name || ''}</td></tr>`;
    html += `<tr><th>Title</th><td>${user.title || ''}</td></tr>`;
    html += `<tr><th>Email (School)</th><td>${user.email_school || ''}</td></tr>`;
    html += `<tr><th>Code</th><td>${user.code || ''}</td></tr>`;
    if (department) {
      html += `<tr><th>Department</th><td>${department}</td></tr>`;
    }
    html += '</table>';
    container.innerHTML = html;
  } catch {
    container.innerHTML = '<div class="error">Failed to load user profile.</div>';
  }
}

window.addEventListener('DOMContentLoaded', fetchAndRenderUserProfile);

// Dynamically set the username in the navbar and link to the correct user profile
// For demo: use the first staff_upload user (replace with real auth/user logic as needed)

function setNavbarUsername() {
  fetch('/api/staff_upload/all')
    .then(res => res.json())
    .then(result => {
      if (result && Array.isArray(result.staff) && result.staff.length > 0) {
        // For demo, use the first user
        const user = result.staff[0];
        const username = user.first_name + ' ' + user.last_name;
        const link = document.getElementById('navbarUsername');
        if (link) {
          link.textContent = username;
          link.href = 'user_profile.html?user=' + encodeURIComponent(user.id);
        }
      }
    });
}

window.addEventListener('DOMContentLoaded', setNavbarUsername);

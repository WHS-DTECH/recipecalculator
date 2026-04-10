// Role-based navbar visibility handler
// Detects user role and conditionally shows/hides admin sections
// Integrates with the permissions and user roles system

(function() {
  'use strict';

  // Store current user role in sessionStorage for use across pages
  const ROLE_STORAGE_KEY = 'navbar_user_role';
  const SUPPORTED_ROLES = ['admin', 'teacher', 'technician', 'student', 'public_access'];

  function normalizeRole(role) {
    const normalized = String(role || '').trim().toLowerCase();
    return SUPPORTED_ROLES.includes(normalized) ? normalized : '';
  }

  function roleFromUrlOverride() {
    const params = new URLSearchParams(window.location.search);
    return normalizeRole(params.get('role'));
  }

  function detectRoleFromPermissionsEndpoint() {
    return fetch('/api/permissions/all')
      .then(res => {
        if (!res.ok) return '';
        return res.json();
      })
      .then(data => {
        if (!data) return '';
        const permissions = Array.isArray(data.permissions) ? data.permissions : [];
        const hasAdminRole = permissions.some(p => normalizeRole(p && p.role_name) === 'admin');
        return hasAdminRole ? 'admin' : '';
      })
      .catch(() => '');
  }
  
  /**
   * Fetch current user's role from the backend
   * Until real auth identity is available, keep Admin visible by default.
   */
  function detectUserRole() {
    const urlRole = roleFromUrlOverride();
    if (urlRole) {
      setUserRole(urlRole);
      return;
    }

    detectRoleFromPermissionsEndpoint()
      .then(permissionRole => {
        if (permissionRole) {
          setUserRole(permissionRole);
          return;
        }

        const storedRole = getStoredUserRole();
        if (storedRole === 'admin') {
          updateNavbarVisibility(storedRole);
          return;
        }

        setUserRole('admin');
      })
      .catch(() => {
        const storedRole = getStoredUserRole();
        if (storedRole === 'admin') {
          updateNavbarVisibility(storedRole);
          return;
        }
        setUserRole('admin');
      });
  }

  /**
   * Set the user's role and update navbar visibility
   */
  function setUserRole(role) {
    const normalized = normalizeRole(role) || 'admin';
    sessionStorage.setItem(ROLE_STORAGE_KEY, normalized);
    updateNavbarVisibility(normalized);
  }

  /**
   * Get any stored role value from session storage
   */
  function getStoredUserRole() {
    return normalizeRole(sessionStorage.getItem(ROLE_STORAGE_KEY));
  }

  /**
   * Update navbar sections based on user role
   */
  function updateNavbarVisibility(role) {
    const normalized = normalizeRole(role) || 'admin';
    document.documentElement.setAttribute('data-navbar-role', normalized);

    // Hide admin sections if user is not admin
    const adminSections = document.querySelectorAll('[data-role="admin"]');
    adminSections.forEach(section => {
      const isDrawerStateElement = section.id === 'adminManagementDrawer' || section.id === 'adminDrawerBackdrop';

      if (normalized === 'admin') {
        section.style.display = '';
        section.removeAttribute('aria-hidden');
        section.setAttribute('data-user-role', normalized);

        // Keep drawer/backdrop hidden state under navbar_loader.js control.
        if (!isDrawerStateElement) {
          section.hidden = false;
        }
      } else {
        section.hidden = true;
        section.style.display = 'none';
        section.setAttribute('aria-hidden', 'true');
      }
    });
  }

  /**
   * Initialize navbar role detection on page load
   */
  function initializeNavbarRoles() {
    const existingRole = getStoredUserRole();
    if (existingRole === 'admin') {
      updateNavbarVisibility(existingRole);
    }

    // Re-check from backend, but never auto-hide admin based on weak identity heuristics.
    detectUserRole();
  }

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeNavbarRoles);
  } else {
    initializeNavbarRoles();
  }

  // Expose role functions globally for testing/debugging
  window.navbarRoles = {
    setRole: setUserRole,
    getRole: getStoredUserRole,
    updateVisibility: updateNavbarVisibility
  };
})();

// Dynamically loads the enhanced navbar and its assets into #navbar-include.
(function() {
  var NAVBAR_URL = '/navbar_enhanced.html';
  var ASSET_VERSION = '20260410a';
  var STYLE_HREFS = [
    'https://www.w3schools.com/w3css/4/w3.css',
    '/navbar.css'
  ];
  var SCRIPT_SRCS = [
    '/navbar_user.js',
    '/navbar_roles.js',
    '/shared/toast.js'
  ];

  function versionedAssetPath(path) {
    if (!path) return path;
    if (/^https?:\/\//i.test(path) || path.indexOf('//') === 0) return path;
    var separator = path.indexOf('?') === -1 ? '?' : '&';
    return path + separator + 'v=' + ASSET_VERSION;
  }

  function ensureStyles() {
    STYLE_HREFS.forEach(function(href) {
      var assetHref = versionedAssetPath(href);
      var existing = document.querySelector('link[data-navbar-asset="' + assetHref + '"]');
      if (existing) return;
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = assetHref;
      link.setAttribute('data-navbar-asset', assetHref);
      document.head.appendChild(link);
    });
  }

  function ensureScripts() {
    SCRIPT_SRCS.forEach(function(src) {
      var assetSrc = versionedAssetPath(src);
      var existing = document.querySelector('script[data-navbar-asset="' + assetSrc + '"]');
      if (existing) return;
      var script = document.createElement('script');
      script.src = assetSrc;
      script.defer = true;
      script.setAttribute('data-navbar-asset', assetSrc);
      document.body.appendChild(script);
    });
  }

  function initializeNavbarBehavior(container) {
    var toggle = document.querySelector('.navbar-admin-toggle');
    var mobileToggle = document.querySelector('.navbar-mobile-toggle');
    var mobileNav = document.getElementById('primaryNavbarLinks');
    var drawer = document.getElementById('adminManagementDrawer');
    var backdrop = document.getElementById('adminDrawerBackdrop');
    var closeBtn = document.querySelector('.navbar-drawer-close');
    var lastFocusedElement = null;
    if (!toggle || !drawer || !backdrop) return;

    var isOpen = false;

    function getFocusableDrawerItems() {
      return Array.prototype.slice.call(
        drawer.querySelectorAll('button, [href], summary, [tabindex]:not([tabindex="-1"])')
      ).filter(function(el) {
        return !el.hasAttribute('disabled') && !el.hidden;
      });
    }

    function openDrawer() {
      isOpen = true;
      lastFocusedElement = document.activeElement;
      drawer.hidden = false;
      backdrop.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
      var focusable = getFocusableDrawerItems();
      if (focusable.length) {
        focusable[0].focus();
      }
    }

    function closeDrawer() {
      isOpen = false;
      drawer.hidden = true;
      backdrop.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
      if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
        lastFocusedElement.focus();
      }
    }

    function closeMobileNav() {
      if (!mobileToggle || !mobileNav) return;
      mobileToggle.setAttribute('aria-expanded', 'false');
      mobileNav.classList.remove('is-open');
    }

    if (mobileToggle && mobileNav) {
      mobileToggle.addEventListener('click', function() {
        var willOpen = mobileToggle.getAttribute('aria-expanded') !== 'true';
        mobileToggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        mobileNav.classList.toggle('is-open', willOpen);
      });

      mobileNav.querySelectorAll('a').forEach(function(link) {
        link.addEventListener('click', closeMobileNav);
      });
    }

    toggle.addEventListener('click', function() {
      if (isOpen) {
        closeDrawer();
      } else {
        openDrawer();
      }
    });

    if (closeBtn) {
      closeBtn.addEventListener('click', closeDrawer);
    }

    backdrop.addEventListener('click', closeDrawer);

    drawer.querySelectorAll('a').forEach(function(link) {
      link.addEventListener('click', closeDrawer);
    });

    document.addEventListener('keydown', function(event) {
      if (event.key === 'Escape') {
        closeMobileNav();
      }

      if (event.key === 'Escape' && isOpen) {
        closeDrawer();
        return;
      }

      if (event.key === 'Tab' && isOpen) {
        var focusable = getFocusableDrawerItems();
        if (!focusable.length) return;

        var first = focusable[0];
        var last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });
  }

  function normalizePathname(pathname) {
    var clean = String(pathname || '').split('?')[0].split('#')[0];
    if (!clean || clean === '/') return 'index.html';
    return clean.replace(/^\/+/, '');
  }

  function markActiveNavbarLink(container) {
    if (!container) return;
    var currentPath = normalizePathname(window.location.pathname);
    var links = container.querySelectorAll('a[href]');

    links.forEach(function(link) {
      var href = link.getAttribute('href');
      if (!href || href.charAt(0) === '#') return;

      var normalizedHref = normalizePathname(href);
      if (normalizedHref !== currentPath) return;

      link.classList.add('is-active');
      link.setAttribute('aria-current', 'page');

      var drawerGroup = link.closest('.navbar-drawer-group');
      if (drawerGroup) {
        drawerGroup.open = true;
      }
    });
  }

  function loadNavbar() {
    var container = document.getElementById('navbar-include');
    if (!container) return;

    ensureStyles();

    var xhr = new XMLHttpRequest();
    xhr.open('GET', NAVBAR_URL, true);
    xhr.onreadystatechange = function() {
      if (xhr.readyState !== 4) return;
      if (xhr.status === 200) {
        container.innerHTML = xhr.responseText;
        markActiveNavbarLink(container);
        initializeNavbarBehavior(container);
        ensureScripts();
      }
    };
    xhr.send();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadNavbar);
  } else {
    loadNavbar();
  }
})();

// Dynamically loads the enhanced navbar and its assets into #navbar-include.
(function() {
  var ASSET_VERSION = '20260504a';
  var NAVBAR_URL = '/navbar_enhanced.html?v=' + ASSET_VERSION;
  var STYLE_HREFS = [
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
    var mobileToggle = document.querySelector('.navbar-mobile-toggle');
    var mobileNav = document.getElementById('primaryNavbarLinks');
    var drawerConfigs = [
      {
        toggle: document.querySelector('.navbar-admin-toggle[aria-controls="adminManagementDrawer"]'),
        drawer: document.getElementById('adminManagementDrawer'),
        backdrop: document.getElementById('adminDrawerBackdrop')
      },
      {
        toggle: document.querySelector('.navbar-admin-toggle[aria-controls="planningDrawer"]'),
        drawer: document.getElementById('planningDrawer'),
        backdrop: document.getElementById('planningDrawerBackdrop')
      },
      {
        toggle: document.querySelector('.navbar-admin-toggle[aria-controls="ftTeacherDrawer"]'),
        drawer: document.getElementById('ftTeacherDrawer'),
        backdrop: document.getElementById('ftTeacherDrawerBackdrop')
      }
    ].filter(function(cfg) {
      return cfg.toggle && cfg.drawer && cfg.backdrop;
    });

    var drawerState = drawerConfigs.map(function(cfg) {
      return {
        cfg: cfg,
        isOpen: !cfg.drawer.hidden || !cfg.backdrop.hidden,
        lastFocusedElement: null,
        closeBtn: cfg.drawer.querySelector('.navbar-drawer-close')
      };
    });

    function getFocusableDrawerItems(drawer) {
      return Array.prototype.slice.call(
        drawer.querySelectorAll('button, [href], summary, [tabindex]:not([tabindex="-1"])')
      ).filter(function(el) {
        return !el.hasAttribute('disabled') && !el.hidden;
      });
    }

    function isAnyDrawerOpen() {
      return drawerState.some(function(state) { return state.isOpen; });
    }

    function closeDrawer(state, restoreFocus) {
      if (!state) return;
      state.isOpen = false;
      state.cfg.drawer.hidden = true;
      state.cfg.backdrop.hidden = true;
      state.cfg.toggle.setAttribute('aria-expanded', 'false');
      if (!isAnyDrawerOpen()) {
        document.body.style.overflow = '';
      }
      if (restoreFocus && state.lastFocusedElement && typeof state.lastFocusedElement.focus === 'function') {
        state.lastFocusedElement.focus();
      }
    }

    function closeAllDrawers(restoreFocus) {
      drawerState.forEach(function(state) {
        closeDrawer(state, restoreFocus);
      });
    }

    function openDrawer(state) {
      closeAllDrawers(false);
      state.isOpen = true;
      state.lastFocusedElement = document.activeElement;
      state.cfg.drawer.hidden = false;
      state.cfg.backdrop.hidden = false;
      state.cfg.toggle.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
      var focusable = getFocusableDrawerItems(state.cfg.drawer);
      if (focusable.length) {
        focusable[0].focus();
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

    drawerState.forEach(function(state) {
      state.cfg.toggle.addEventListener('click', function() {
        if (state.isOpen) {
          closeDrawer(state, true);
        } else {
          openDrawer(state);
        }
      });

      if (state.closeBtn) {
        state.closeBtn.addEventListener('click', function() {
          closeDrawer(state, true);
        });
      }

      state.cfg.backdrop.addEventListener('click', function() {
        closeDrawer(state, true);
      });

      state.cfg.drawer.querySelectorAll('a').forEach(function(link) {
        link.addEventListener('click', function() {
          closeDrawer(state, false);
        });
      });
    });

    document.addEventListener('keydown', function(event) {
      if (event.key === 'Escape') {
        closeMobileNav();
      }

      var openDrawerState = drawerState.find(function(state) { return state.isOpen; });

      if (event.key === 'Escape' && openDrawerState) {
        closeDrawer(openDrawerState, true);
        return;
      }

      if (event.key === 'Tab' && openDrawerState) {
        var focusable = getFocusableDrawerItems(openDrawerState.cfg.drawer);
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

    // Fallback logout handler to guarantee logout works even if another script fails.
    document.querySelectorAll('.navbar-logout-btn').forEach(function(btn) {
      if (btn.getAttribute('data-logout-bound') === '1') return;
      btn.setAttribute('data-logout-bound', '1');
      btn.addEventListener('click', function(event) {
        event.preventDefault();
        fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
          .catch(function() { return null; })
          .finally(function() {
            try {
              sessionStorage.removeItem('currentStaffUser');
              sessionStorage.removeItem('navbar_user_role');
            } catch (_) {
              // Ignore storage errors and still redirect.
            }
            window.location.href = 'index.html';
          });
      });
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

  function injectFooter() {
    if (document.getElementById('site-footer-global')) return;

    if (!document.querySelector('style[data-footer-styles]')) {
      var style = document.createElement('style');
      style.setAttribute('data-footer-styles', '1');
      style.textContent =
        '.site-footer{text-align:center;padding:1.5rem 1rem;border-top:1px solid #e2e8f0;margin-top:2rem;}' +
        '.footer-suggest-btn{background:#2563eb;color:#fff;border:none;border-radius:8px;padding:.65rem 1.5rem;font-size:1rem;font-weight:600;cursor:pointer;transition:background .18s,transform .12s;}' +
        '.footer-suggest-btn:hover{background:#1d4ed8;transform:translateY(-1px);}' +
        '.footer-suggest-btn:active{transform:translateY(1px);}';
      document.head.appendChild(style);
    }

    var footer = document.createElement('footer');
    footer.id = 'site-footer-global';
    footer.className = 'site-footer';
    footer.innerHTML = '<button id="heroSuggestRecipeButton" class="footer-suggest-btn" type="button">💡 Suggest a Recipe</button>';
    document.body.appendChild(footer);

    var btn = document.getElementById('heroSuggestRecipeButton');
    if (btn) {
      btn.addEventListener('click', function() {
        // On index.html, display_recipe_book.js attaches its own handler — let it handle this.
        if (document.getElementById('inlineSuggestPanel')) return;
        window.location.href = 'suggest_recipe.html';
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      loadNavbar();
      injectFooter();
    });
  } else {
    loadNavbar();
    injectFooter();
  }
})();

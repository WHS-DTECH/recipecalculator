(function() {
  var statusEl = null;
  var ROLE_STORAGE_KEY = 'navbar_user_role';

  function setStatus(message, type) {
    if (!statusEl) statusEl = document.getElementById('loginStatus');
    if (!statusEl) return;
    statusEl.textContent = message || '';
    statusEl.className = 'login-status' + (type ? ' ' + type : '');
  }

  function fetchJson(url, options) {
    return fetch(url, options).then(function(res) {
      return res.json().catch(function() { return {}; }).then(function(data) {
        return { ok: res.ok, status: res.status, data: data };
      });
    });
  }

  function verifySession() {
    return fetchJson('/api/auth/me', { credentials: 'include' }).then(function(meResult) {
      var isAuthenticated = Boolean(
        meResult &&
        meResult.ok &&
        meResult.data &&
        meResult.data.authenticated &&
        meResult.data.user &&
        meResult.data.user.email
      );

      if (!isAuthenticated) {
        throw new Error('Login did not persist. Please allow cookies for this site and try again.');
      }

      return meResult.data.user;
    });
  }

  function rememberRole(user) {
    try {
      var role = String((user && user.role) || '').trim().toLowerCase();
      if (role) sessionStorage.setItem(ROLE_STORAGE_KEY, role);
    } catch (_) {
      // Ignore session storage failures.
    }
  }

  function loadGoogleScript(onLoad) {
    if (window.google && window.google.accounts && window.google.accounts.id) {
      onLoad();
      return;
    }

    var existing = document.querySelector('script[data-google-identity="1"]');
    if (existing) {
      existing.addEventListener('load', onLoad, { once: true });
      return;
    }

    var script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.setAttribute('data-google-identity', '1');
    script.addEventListener('load', onLoad, { once: true });
    document.head.appendChild(script);
  }

  function handleCredentialResponse(response) {
    if (!response || !response.credential) {
      setStatus('Google login failed. Please try again.', 'error');
      return;
    }

    setStatus('Signing you in...', '');

    fetchJson('/api/auth/google/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ idToken: response.credential })
    }).then(function(result) {
      if (!result.ok || !result.data || !result.data.success) {
        throw new Error((result.data && result.data.error) || 'Sign-in failed.');
      }
      return verifySession();
    }).then(function(user) {
      rememberRole(user);
      setStatus('Signed in successfully. Redirecting...', 'success');
      window.location.href = 'index.html';
    }).catch(function(err) {
      setStatus(err.message || 'Sign-in failed.', 'error');
    });
  }

  function startGoogleSignin(clientId) {
    var mount = document.getElementById('googleSigninMount');
    if (!mount) return;

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: handleCredentialResponse,
      ux_mode: 'popup'
    });

    window.google.accounts.id.renderButton(mount, {
      theme: 'outline',
      size: 'large',
      type: 'standard',
      shape: 'pill',
      text: 'signin_with',
      width: 280
    });
  }

  function boot() {
    fetchJson('/api/auth/me', { credentials: 'include' })
      .then(function(meResult) {
        if (meResult.ok && meResult.data && meResult.data.authenticated && meResult.data.user) {
          rememberRole(meResult.data.user);
          setStatus('Already signed in. Redirecting to Recipe Book...', 'success');
          window.location.href = 'index.html';
          return null;
        }

        return fetchJson('/api/auth/google/config', { credentials: 'include' });
      })
      .then(function(configResult) {
        if (!configResult) return;
        if (!configResult.ok || !configResult.data || !configResult.data.clientId) {
          throw new Error((configResult.data && configResult.data.error) || 'Google sign-in is not configured yet.');
        }

        loadGoogleScript(function() {
          startGoogleSignin(configResult.data.clientId);
        });
      })
      .catch(function(err) {
        setStatus(err.message || 'Unable to load Google sign-in.', 'error');
      });
  }

  document.addEventListener('DOMContentLoaded', boot);
})();

(function() {
  var statusEl = null;

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
    fetchJson('/api/auth/google/config', { credentials: 'include' })
      .then(function(result) {
        if (!result.ok || !result.data || !result.data.clientId) {
          throw new Error((result.data && result.data.error) || 'Google sign-in is not configured yet.');
        }

        var clientId = result.data.clientId;
        loadGoogleScript(function() {
          startGoogleSignin(clientId);
        });
      })
      .catch(function(err) {
        setStatus(err.message || 'Unable to load Google sign-in.', 'error');
      });
  }

  document.addEventListener('DOMContentLoaded', boot);
})();

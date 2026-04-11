const jwt = require('jsonwebtoken');

const SESSION_COOKIE_NAME = 'rc_session';
const DEFAULT_SESSION_TTL = '7d';

function getSessionSecret() {
  return String(process.env.SESSION_SECRET || '').trim();
}

function canUseSessions() {
  return Boolean(getSessionSecret());
}

function toBool(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function normalizeSameSite(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'strict' || normalized === 'none' || normalized === 'lax') {
    return normalized;
  }
  return 'lax';
}

function sessionCookieOptions() {
  const isProd = String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
  const configuredSameSite = normalizeSameSite(process.env.SESSION_COOKIE_SAMESITE || (isProd ? 'lax' : 'lax'));
  const secureConfigured = String(process.env.SESSION_COOKIE_SECURE || '').trim();
  const secure = secureConfigured ? toBool(secureConfigured) : isProd;

  // Browsers reject SameSite=None cookies unless Secure is also true.
  const sameSite = configuredSameSite === 'none' && !secure ? 'lax' : configuredSameSite;

  return {
    httpOnly: true,
    secure,
    sameSite,
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000
  };
}

function issueSessionCookie(res, user) {
  if (!canUseSessions()) return false;
  if (!res || !user || !user.email) return false;

  const payload = {
    email: String(user.email || '').trim().toLowerCase(),
    name: String(user.name || '').trim(),
    picture: String(user.picture || '').trim()
  };

  const token = jwt.sign(payload, getSessionSecret(), {
    expiresIn: process.env.SESSION_TTL || DEFAULT_SESSION_TTL
  });

  res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions());
  return true;
}

function clearSessionCookie(res) {
  if (!res) return;
  res.clearCookie(SESSION_COOKIE_NAME, {
    path: '/',
    httpOnly: true,
    sameSite: sessionCookieOptions().sameSite,
    secure: sessionCookieOptions().secure
  });
}

function readSessionToken(req) {
  if (!req || !req.cookies) return '';
  return String(req.cookies[SESSION_COOKIE_NAME] || '').trim();
}

function decodeSessionToken(token) {
  if (!token || !canUseSessions()) return null;
  try {
    return jwt.verify(token, getSessionSecret());
  } catch (_) {
    return null;
  }
}

function attachAuthUser(req, res, next) {
  const token = readSessionToken(req);
  const decoded = decodeSessionToken(token);
  req.authUser = decoded || null;
  req.authUserEmail = decoded && decoded.email ? String(decoded.email).toLowerCase() : '';
  next();
}

module.exports = {
  SESSION_COOKIE_NAME,
  canUseSessions,
  issueSessionCookie,
  clearSessionCookie,
  attachAuthUser,
  toBool
};

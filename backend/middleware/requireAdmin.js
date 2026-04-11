const pool = require('../db');

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function getRequestEmail(req) {
  return normalizeEmail(
    req.headers['x-user-email'] ||
    req.headers['x-staff-email'] ||
    req.query.userEmail ||
    req.body.userEmail
  );
}

function getBootstrapEmails() {
  const configured = String(process.env.ADMIN_BOOTSTRAP_EMAILS || '')
    .split(',')
    .map((entry) => normalizeEmail(entry))
    .filter(Boolean);

  const preferred = normalizeEmail(process.env.PREFERRED_ADMIN_EMAIL || '');
  if (preferred && !configured.includes(preferred)) configured.push(preferred);

  return new Set(configured);
}

async function hasAdminPermission(email) {
  if (!email) return false;

  const additionalRoleMatch = await pool.query(
    `SELECT 1
     FROM user_additional_roles uar
     JOIN role_permissions rp ON rp.role_name = uar.role_name
     WHERE lower(trim(uar.email)) = lower(trim($1))
       AND rp.admin = true
     LIMIT 1`,
    [email]
  );

  if (additionalRoleMatch.rowCount > 0) return true;

  const primaryRoleMatch = await pool.query(
    `SELECT 1
     FROM staff_upload
     WHERE lower(trim(email_school)) = lower(trim($1))
       AND lower(trim(COALESCE(primary_role, ''))) = 'admin'
     LIMIT 1`,
    [email]
  );

  return primaryRoleMatch.rowCount > 0;
}

async function requireAdmin(req, res, next) {
  if (process.env.DISABLE_ADMIN_GUARD === '1') {
    return next();
  }

  const email = getRequestEmail(req);
  if (!email) {
    return res.status(401).json({ success: false, error: 'Missing admin identity (x-user-email).' });
  }

  try {
    const bootstrapEmails = getBootstrapEmails();
    if (bootstrapEmails.has(email)) {
      req.authUserEmail = email;
      return next();
    }

    const permitted = await hasAdminPermission(email);
    if (!permitted) {
      return res.status(403).json({ success: false, error: 'Admin access required.' });
    }

    req.authUserEmail = email;
    return next();
  } catch (err) {
    console.error('[AUTH] requireAdmin failed:', err);
    return res.status(500).json({ success: false, error: 'Authorization check failed.' });
  }
}

module.exports = { requireAdmin };
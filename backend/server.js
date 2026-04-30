

const express = require('express');
const app = express();
const cookieParser = require('cookie-parser');
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cookieParser());
app.use((req, res, next) => {
  // Allow popup auth providers (Google GIS) to communicate with opener windows.
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  next();
});
const fs = require('fs');
const path = require('path');
// --- DEBUG: Log all requests to /api/ingredients/inventory/* ---
app.use('/api/ingredients/inventory', (req, res, next) => {
  console.log(`[SERVER] ${req.method} ${req.originalUrl}`);
  next();
});

const pool = require('./db');
const { requireAdmin } = require('./middleware/requireAdmin');
const { OAuth2Client } = require('google-auth-library');
const nodemailer = require('nodemailer');
const {
  canUseSessions,
  issueSessionCookie,
  clearSessionCookie,
  attachAuthUser
} = require('./middleware/authSession');

app.use(attachAuthUser);

const googleClient = new OAuth2Client();

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function getGoogleClientId() {
  return String(process.env.GOOGLE_CLIENT_ID || '').trim();
}

function isValidEmailFormat(email) {
  const value = String(email || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getAllowedSuggestionEmailDomains() {
  const configured = String(process.env.SUGGESTION_ALLOWED_EMAIL_DOMAINS || '')
    .split(',')
    .map((entry) => String(entry || '').trim().toLowerCase())
    .filter(Boolean);

  const schoolDomain = String(process.env.GOOGLE_ALLOWED_DOMAIN || 'westlandhigh.school.nz').trim().toLowerCase();
  const defaults = [
    schoolDomain,
    'gmail.com',
    'googlemail.com',
    'outlook.com',
    'hotmail.com',
    'live.com',
    'msn.com'
  ].filter(Boolean);

  return new Set([...defaults, ...configured]);
}

function isTrustedSuggestionEmail(email) {
  const normalized = normalizeEmail(email);
  if (!isValidEmailFormat(normalized)) return false;
  const domain = normalized.split('@')[1] || '';
  return getAllowedSuggestionEmailDomains().has(domain);
}

function getBootstrapAdminEmails() {
  const configured = String(process.env.ADMIN_BOOTSTRAP_EMAILS || '')
    .split(',')
    .map((entry) => normalizeEmail(entry))
    .filter(Boolean);

  const preferred = normalizeEmail(process.env.PREFERRED_ADMIN_EMAIL || '');
  if (preferred && !configured.includes(preferred)) configured.push(preferred);

  return new Set(configured);
}

async function resolveEffectiveRoleForEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return { role: 'public_access', staffLinked: false };

  if (getBootstrapAdminEmails().has(normalizedEmail)) {
    return { role: 'admin', staffLinked: true };
  }

  const staffResult = await pool.query(
    `SELECT COALESCE(NULLIF(lower(trim(primary_role)), ''), 'staff') AS primary_role
     FROM staff_upload
     WHERE COALESCE(status, 'Current') = 'Current'
       AND lower(trim(email_school)) = lower(trim($1))
     LIMIT 1`,
    [normalizedEmail]
  );

  const staffLinked = staffResult.rowCount > 0;
  const primaryRole = staffLinked ? String(staffResult.rows[0].primary_role || 'staff') : 'public_access';

  const additionalRolesResult = await pool.query(
    `SELECT lower(trim(role_name)) AS role_name
     FROM user_additional_roles
     WHERE user_type = 'staff'
       AND lower(trim(email)) = lower(trim($1))`,
    [normalizedEmail]
  );

  const roleSet = new Set();
  roleSet.add(primaryRole);
  additionalRolesResult.rows.forEach((row) => {
    const role = String(row.role_name || '').trim().toLowerCase();
    if (role) roleSet.add(role);
  });

  const orderedPriority = ['admin', 'teacher', 'technician', 'student', 'public_access'];
  let role = 'public_access';
  for (const candidate of orderedPriority) {
    if (roleSet.has(candidate)) {
      role = candidate;
      break;
    }
  }

  if (role === 'public_access' && staffLinked) {
    role = 'teacher';
  }

  return { role, staffLinked };
}

function isApprovedGoogleDomain(email) {
  const allowed = String(process.env.GOOGLE_ALLOWED_DOMAIN || 'westlandhigh.school.nz').trim().toLowerCase();
  const normalizedEmail = normalizeEmail(email);
  return Boolean(allowed && normalizedEmail.endsWith(`@${allowed}`));
}

function getSuggestionNotifyRecipients() {
  const configured = String(process.env.SUGGESTION_NOTIFY_TO || process.env.ADMIN_NOTIFICATION_EMAIL || '')
    .split(',')
    .map((entry) => normalizeEmail(entry))
    .filter(Boolean);
  return configured;
}

async function getSuggestionRoleRecipients() {
  const recipients = new Set();

  const configured = getSuggestionNotifyRecipients();
  configured.forEach((entry) => {
    if (isValidEmailFormat(entry)) recipients.add(entry);
  });

  getBootstrapAdminEmails().forEach((email) => {
    if (isValidEmailFormat(email)) recipients.add(email);
  });

  const teacherAdminResult = await pool.query(
    `SELECT DISTINCT lower(trim(email_school)) AS email
     FROM staff_upload
     WHERE COALESCE(status, 'Current') = 'Current'
       AND lower(trim(COALESCE(primary_role, ''))) IN ('teacher', 'admin')
       AND trim(COALESCE(email_school, '')) <> ''`
  );

  teacherAdminResult.rows.forEach((row) => {
    const email = normalizeEmail(row.email);
    if (isValidEmailFormat(email)) recipients.add(email);
  });

  const additionalRolesResult = await pool.query(
    `SELECT DISTINCT lower(trim(uar.email)) AS email
     FROM user_additional_roles uar
     WHERE lower(trim(uar.user_type)) = 'staff'
       AND lower(trim(uar.role_name)) IN ('teacher', 'admin')
       AND trim(COALESCE(uar.email, '')) <> ''`
  );

  additionalRolesResult.rows.forEach((row) => {
    const email = normalizeEmail(row.email);
    if (isValidEmailFormat(email)) recipients.add(email);
  });

  return Array.from(recipients);
}

function getResendConfig() {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  const fromAddress = String(
    process.env.RESEND_FROM ||
    process.env.SUGGESTION_EMAIL_FROM ||
    process.env.SMTP_FROM ||
    process.env.SMTP_USER ||
    ''
  ).trim();
  return { apiKey, fromAddress };
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildSuggestionEmailPayload(suggestion) {
  const appBaseUrl = String(
    process.env.APP_BASE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    'https://recipe-calculator-backend.onrender.com'
  ).trim().replace(/\/+$/, '');
  const suggestionsListUrl = `${appBaseUrl}/admin_suggest_recipe.html`;

  const recipeName = suggestion.recipe_name || 'Untitled Recipe Suggestion';
  const suggester = suggestion.suggested_by || 'Unknown';
  const email = suggestion.email || 'Not provided';
  const date = suggestion.date || '';
  const reason = suggestion.reason || '';
  const url = suggestion.url || '';

  const safeRecipeName = escapeHtml(recipeName);
  const safeSuggester = escapeHtml(suggester);
  const safeEmail = escapeHtml(email);
  const safeDate = escapeHtml(date || 'N/A');
  const safeReason = escapeHtml(reason || 'N/A').replace(/\n/g, '<br>');
  const safeUrl = escapeHtml(url || 'N/A');
  const safeSuggestionsListUrl = escapeHtml(suggestionsListUrl);

  const text = [
    'New recipe suggestion submitted.',
    '',
    `Date: ${date || 'N/A'}`,
    `Recipe: ${recipeName}`,
    `Suggested By: ${suggester}`,
    `Email: ${email}`,
    `URL: ${url || 'N/A'}`,
    `Suggestion List: ${suggestionsListUrl}`,
    '',
    'Reason:',
    reason || 'N/A'
  ].join('\n');

  const html = `
  <div style="font-family:Segoe UI, Arial, sans-serif; background:#f5f8fc; padding:20px; color:#1b2733;">
    <div style="max-width:680px; margin:0 auto; background:#ffffff; border:1px solid #dbe5f0; border-radius:12px; overflow:hidden;">
      <div style="padding:16px 20px; background:linear-gradient(120deg,#1f69ad,#4b91cc); color:#ffffff;">
        <div style="font-size:12px; letter-spacing:0.08em; text-transform:uppercase; opacity:0.9;">Food Room Inventory</div>
        <h2 style="margin:6px 0 0; font-size:22px; line-height:1.2;">New Recipe Suggestion</h2>
      </div>

      <div style="padding:20px;">
        <p style="margin:0 0 14px; font-size:14px; color:#2a3f56;">A new suggestion has been submitted for review.</p>

        <table style="width:100%; border-collapse:collapse; font-size:14px;">
          <tr>
            <td style="padding:8px 10px; width:170px; background:#f7fafc; border:1px solid #e5edf5; font-weight:600;">Date</td>
            <td style="padding:8px 10px; border:1px solid #e5edf5;">${safeDate}</td>
          </tr>
          <tr>
            <td style="padding:8px 10px; background:#f7fafc; border:1px solid #e5edf5; font-weight:600;">Recipe</td>
            <td style="padding:8px 10px; border:1px solid #e5edf5;">${safeRecipeName}</td>
          </tr>
          <tr>
            <td style="padding:8px 10px; background:#f7fafc; border:1px solid #e5edf5; font-weight:600;">Suggested By</td>
            <td style="padding:8px 10px; border:1px solid #e5edf5;">${safeSuggester}</td>
          </tr>
          <tr>
            <td style="padding:8px 10px; background:#f7fafc; border:1px solid #e5edf5; font-weight:600;">Email</td>
            <td style="padding:8px 10px; border:1px solid #e5edf5;">${safeEmail}</td>
          </tr>
          <tr>
            <td style="padding:8px 10px; background:#f7fafc; border:1px solid #e5edf5; font-weight:600;">URL</td>
            <td style="padding:8px 10px; border:1px solid #e5edf5;">${safeUrl}</td>
          </tr>
        </table>

        <div style="margin-top:16px;">
          <div style="font-size:13px; font-weight:700; color:#274867; margin-bottom:6px;">Reason</div>
          <div style="padding:12px; border:1px solid #e3ebf4; border-radius:8px; background:#f9fcff; font-size:14px; line-height:1.45;">${safeReason}</div>
        </div>

        <div style="margin-top:18px; text-align:left;">
          <a href="${safeSuggestionsListUrl}" style="display:inline-block; padding:10px 14px; background:#1f69ad; color:#ffffff; text-decoration:none; border-radius:8px; font-size:14px; font-weight:700;">Open Suggestions List</a>
          <div style="margin-top:8px; font-size:12px; color:#4d657d;">Direct link: <a href="${safeSuggestionsListUrl}" style="color:#1f69ad;">${safeSuggestionsListUrl}</a></div>
        </div>
      </div>
    </div>
  </div>`;

  return {
    subject: `[Recipe Suggestion] ${recipeName}`,
    text,
    html
  };
}

async function sendSuggestionNotificationViaResend(suggestion, recipients) {
  const cfg = getResendConfig();
  if (!cfg.apiKey) {
    return {
      sent: false,
      reason: 'resend_not_configured',
      recipients,
      recipientCount: recipients.length
    };
  }

  if (!cfg.fromAddress) {
    return {
      sent: false,
      reason: 'sender_not_configured',
      recipients,
      recipientCount: recipients.length
    };
  }

  if (typeof fetch !== 'function') {
    return {
      sent: false,
      reason: 'fetch_unavailable',
      recipients,
      recipientCount: recipients.length
    };
  }

  const payload = buildSuggestionEmailPayload(suggestion);

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: cfg.fromAddress,
        to: recipients,
        subject: payload.subject,
        text: payload.text,
        html: payload.html
      })
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      return {
        sent: false,
        reason: 'resend_failed',
        recipients,
        recipientCount: recipients.length,
        error: `HTTP ${response.status} ${response.statusText} ${bodyText}`.trim()
      };
    }

    const payload = await response.json().catch(() => ({}));
    return {
      sent: true,
      reason: 'sent',
      channel: 'resend',
      recipients,
      recipientCount: recipients.length,
      acceptedCount: recipients.length,
      messageId: payload && payload.id ? String(payload.id) : ''
    };
  } catch (err) {
    return {
      sent: false,
      reason: 'resend_failed',
      recipients,
      recipientCount: recipients.length,
      error: err && err.message ? err.message : String(err)
    };
  }
}

function createSuggestionMailer() {
  const host = String(process.env.SMTP_HOST || '').trim();
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || '').trim();
  if (!host || !user || !pass) return null;

  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || '').trim() === '1';
  const connectionTimeout = Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 8000);
  const greetingTimeout = Number(process.env.SMTP_GREETING_TIMEOUT_MS || 8000);
  const socketTimeout = Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 12000);
  return nodemailer.createTransport({
    host,
    port,
    secure,
    connectionTimeout,
    greetingTimeout,
    socketTimeout,
    auth: { user, pass }
  });
}

function getSuggestionSmtpConfigSummary() {
  const host = String(process.env.SMTP_HOST || '').trim() || '(missing)';
  const port = String(process.env.SMTP_PORT || '587').trim();
  const secure = String(process.env.SMTP_SECURE || '').trim() === '1' ? 'true' : 'false';
  const user = String(process.env.SMTP_USER || '').trim() || '(missing)';
  const fromAddress = String(process.env.SUGGESTION_EMAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER || '').trim() || '(missing)';
  return `host=${host} port=${port} secure=${secure} user=${user} from=${fromAddress}`;
}

async function logSuggestionMailerHealthCheck() {
  const transporter = createSuggestionMailer();
  if (!transporter) {
    console.warn('[SUGGESTIONS] SMTP health check skipped. Missing SMTP_HOST/SMTP_USER/SMTP_PASS.');
    return;
  }

  try {
    await transporter.verify();
    console.log('[SUGGESTIONS] SMTP health check passed.', getSuggestionSmtpConfigSummary());
  } catch (err) {
    console.error('[SUGGESTIONS] SMTP health check failed:', err.message, getSuggestionSmtpConfigSummary());
  }
}

async function sendSuggestionNotificationEmail(suggestion) {
  let recipients = [];
  try {
    recipients = await getSuggestionRoleRecipients();
  } catch (recipientErr) {
    console.error('[SUGGESTIONS] Failed to resolve teacher/admin recipients:', recipientErr.message);
    recipients = getSuggestionNotifyRecipients();
  }

  if (!recipients.length) {
    return {
      sent: false,
      reason: 'no_recipients',
      recipients: [],
      recipientCount: 0
    };
  }

  // Prefer API-based delivery when configured, as it is often more reliable on hosted platforms.
  if (String(process.env.RESEND_API_KEY || '').trim()) {
    const resendResult = await sendSuggestionNotificationViaResend(suggestion, recipients);
    if (resendResult.sent) return resendResult;
    console.error('[SUGGESTIONS] Resend delivery failed, falling back to SMTP:', resendResult.error || resendResult.reason);
  }

  const transporter = createSuggestionMailer();
  if (!transporter) {
    console.warn('[SUGGESTIONS] Email skipped: SMTP_HOST/SMTP_USER/SMTP_PASS not configured.');
    return {
      sent: false,
      reason: 'smtp_not_configured',
      recipients,
      recipientCount: recipients.length
    };
  }

  const fromAddress = String(process.env.SUGGESTION_EMAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER || '').trim();
  if (!fromAddress) {
    console.warn('[SUGGESTIONS] Email skipped: no sender address configured.');
    return {
      sent: false,
      reason: 'sender_not_configured',
      recipients,
      recipientCount: recipients.length
    };
  }

  const payload = buildSuggestionEmailPayload(suggestion);

  const sendTimeoutMs = Number(process.env.SUGGESTION_EMAIL_TIMEOUT_MS || 12000);
  const sendPromise = transporter.sendMail({
    from: fromAddress,
    to: recipients.join(','),
    subject: payload.subject,
    text: payload.text,
    html: payload.html
  });

  // Avoid leaving the suggestion API hanging if SMTP is slow/unreachable.
  const info = await Promise.race([
    sendPromise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('EMAIL_SEND_TIMEOUT')), sendTimeoutMs))
  ]).catch((err) => {
    if (String(err && err.message) === 'EMAIL_SEND_TIMEOUT') {
      return { accepted: [], __timedOut: true };
    }
    throw err;
  });

  const accepted = Array.isArray(info && info.accepted) ? info.accepted.length : 0;
  const timedOut = Boolean(info && info.__timedOut);
  return {
    sent: accepted > 0,
    reason: accepted > 0 ? 'sent' : (timedOut ? 'send_timeout' : 'not_accepted'),
    recipients,
    recipientCount: recipients.length,
    acceptedCount: accepted
  };
}

// Compatibility wrapper for legacy SQLite-style db.* calls that still exist in this file.
// This keeps legacy endpoints from throwing ReferenceError while the remaining handlers are migrated.
function normalizeLegacySql(sql) {
  const base = String(sql || '').replace(/\s+COLLATE\s+NOCASE/gi, '');
  let index = 0;
  return base.replace(/\?/g, () => {
    index += 1;
    return `$${index}`;
  });
}

const db = {
  all(sql, params, callback) {
    const cb = typeof params === 'function' ? params : callback;
    const values = Array.isArray(params) ? params : [];
    pool.query(normalizeLegacySql(sql), values)
      .then((result) => cb && cb(null, result.rows || []))
      .catch((err) => cb && cb(err));
  },
  get(sql, params, callback) {
    const cb = typeof params === 'function' ? params : callback;
    const values = Array.isArray(params) ? params : [];
    pool.query(normalizeLegacySql(sql), values)
      .then((result) => cb && cb(null, (result.rows && result.rows[0]) || undefined))
      .catch((err) => cb && cb(err));
  },
  run(sql, params, callback) {
    const cb = typeof params === 'function' ? params : callback;
    const values = Array.isArray(params) ? params : [];
    pool.query(normalizeLegacySql(sql), values)
      .then((result) => {
        if (!cb) return;
        cb.call({
          changes: result.rowCount || 0,
          lastID: result.rows && result.rows[0] && result.rows[0].id ? result.rows[0].id : undefined
        }, null);
      })
      .catch((err) => cb && cb.call({ changes: 0, lastID: undefined }, err));
  }
};

let recipeDisplayImageColumnEnsured = false;

async function ensureRecipeDisplayImageColumn() {
  if (recipeDisplayImageColumnEnsured) return;
  await pool.query('ALTER TABLE recipe_display ADD COLUMN IF NOT EXISTS image_url TEXT');
  recipeDisplayImageColumnEnsured = true;
}

function parseImageDataUrl(dataUrl) {
  const raw = String(dataUrl || '');
  const match = /^data:image\/(png|jpeg|jpg|webp|gif)(?:;charset=[^;,]+)?;base64,(.+)$/i.exec(raw);
  if (!match) return null;
  const type = String(match[1] || '').toLowerCase();
  const ext = type === 'jpeg' || type === 'jpg' ? 'jpg' : type;
  return {
    ext,
    buffer: Buffer.from(match[2], 'base64')
  };
}

function sanitizeImageFileBase(name) {
  const base = String(name || 'recipe-image').trim();
  return base.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'recipe-image';
}

// Load extracted ingredients utility
const { loadExtractedIngredients } = require('./public/load_extracted_ingredients');
// Mount aisleKeywords router (Postgres)
const aisleKeywordsRouter = require('./routes/aisleKeywords');
app.use('/api/aisle_keywords', aisleKeywordsRouter);
// Mount aisleCategory router (Postgres)
const aisleCategoryRouter = require('./routes/aisleCategory');
app.use('/api/aisle_category', aisleCategoryRouter);

const foodBrandsRouter = require('./routes/foodBrands');
app.use('/api/food_brands', foodBrandsRouter);


// Mount extract_rendered_html router for /api/extract-rendered-html (must be after app is defined)
const extractRenderedHtmlRouter = require('./routes/extract_rendered_html');
app.use('/api', extractRenderedHtmlRouter);



// Mount ingredients router for all /api/ingredients endpoints
const ingredientsRouter = require('./routes/ingredients.routes');
app.use('/api/ingredients', ingredientsRouter);

// Global error handler for uncaught errors (should be after routers)
app.use((err, req, res, next) => {
  console.error('[GLOBAL ERROR HANDLER]', err);
  res.status(500).json({ success: false, error: err.message, details: err.stack });
});


// Mount recipes router for all /api/recipes endpoints
const recipesRouter = require('./routes/recipes');
app.use('/api/recipes', recipesRouter);

// Mount upload_url router for /api/recipes/upload-url
const uploadUrlRouter = require('./routes/upload_url');
app.use('/api/recipes', uploadUrlRouter);

// --- Title Solution Endpoint (saves to DB) ---
app.post('/api/title-extractor/solution', async (req, res) => {
  const { recipeId, solution } = req.body;
  console.log('[DEBUG /api/title-extractor/solution] Called with:', { recipeId, solution });
  if (!recipeId || !solution) {
    console.log('[DEBUG /api/title-extractor/solution] Missing recipeId or solution');
    return res.status(400).json({ error: 'Recipe ID and solution are required.' });
  }
  try {
    // Save to the "title_extracted" column (create if not exists) or fallback to "name"
    // If you have a title_extracted column:
    // const result = await pool.query('UPDATE recipes SET title_extracted = $1 WHERE id = $2', [solution, recipeId]);
    // If not, fallback to updating the name:
    const result = await pool.query('UPDATE recipes SET name = $1 WHERE id = $2', [solution, recipeId]);
    if (result.rowCount === 0) {
      console.log('[DEBUG /api/title-extractor/solution] No recipe found for id:', recipeId);
      return res.status(404).json({ error: 'Recipe not found.' });
    }
    console.log('[DEBUG /api/title-extractor/solution] Successfully updated title for recipe id:', recipeId);
    res.json({ success: true });
  } catch (err) {
    console.error('[DEBUG /api/title-extractor/solution] Failed to save title solution:', err.message);
    return res.status(500).json({ error: err.message });
  }
});



// Modular uploads router
const uploadsRouter = require('./routes/api/uploads');
app.use('/api/uploads', uploadsRouter);

const staffUploadRouter = require('./routes/staff_upload');
app.use('/api/staff_upload', staffUploadRouter);

const bookingsRouter = require('./routes/bookings');
app.use('/api/bookings', bookingsRouter);

const classesRouter = require('./routes/classes');
app.use('/api/classes', classesRouter);

const uploadTimetableRouter = require('./routes/upload_timetable');
app.use('/api/upload_timetable', uploadTimetableRouter);

const recipeCalendarPdfRouter = require('./routes/recipe_calendar_pdf');
app.use('/api/recipe_calendar_pdf', recipeCalendarPdfRouter);

const studentUploadRouter = require('./routes/student_upload');
app.use('/api/student_upload', studentUploadRouter);

const departmentRouter = require('./routes/department');
app.use('/api/department', departmentRouter);

const permissionsRouter = require('./routes/permissions');
app.use('/api/permissions', permissionsRouter);

const userRolesRouter = require('./routes/user_roles');
app.use('/api/user_roles', userRolesRouter);

// --- Google Auth API ---
app.get('/api/auth/google/config', (req, res) => {
  const clientId = getGoogleClientId();
  if (!clientId) {
    return res.status(503).json({ success: false, error: 'Google Sign-In is not configured.' });
  }
  return res.json({ success: true, clientId });
});

app.post('/api/auth/google/login', async (req, res) => {
  const clientId = getGoogleClientId();
  if (!clientId) {
    return res.status(503).json({ success: false, error: 'Google Sign-In is not configured.' });
  }

  if (!canUseSessions()) {
    return res.status(503).json({ success: false, error: 'Session secret is not configured.' });
  }

  const idToken = String(req.body && req.body.idToken ? req.body.idToken : '').trim();
  if (!idToken) {
    return res.status(400).json({ success: false, error: 'Missing Google token.' });
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: clientId
    });
    const payload = ticket.getPayload() || {};
    const email = normalizeEmail(payload.email);
    if (!email) {
      return res.status(400).json({ success: false, error: 'Google account email is required.' });
    }

    const roleInfo = await resolveEffectiveRoleForEmail(email);

    issueSessionCookie(res, {
      email,
      name: payload.name || email,
      picture: payload.picture || ''
    });

    return res.json({
      success: true,
      user: {
        email,
        name: payload.name || email,
        picture: payload.picture || '',
        role: roleInfo.role,
        staffLinked: roleInfo.staffLinked,
        domainApproved: isApprovedGoogleDomain(email)
      }
    });
  } catch (err) {
    console.error('[AUTH] Google login failed:', err.message);
    return res.status(401).json({ success: false, error: 'Invalid Google sign-in token.' });
  }
});

app.get('/api/auth/me', (req, res) => {
  if (!req.authUserEmail) {
    return res.json({ success: true, authenticated: false, user: null });
  }

  return resolveEffectiveRoleForEmail(req.authUserEmail)
    .then((roleInfo) => {
      return res.json({
        success: true,
        authenticated: true,
        user: {
          email: req.authUserEmail,
          name: (req.authUser && req.authUser.name) || req.authUserEmail,
          picture: (req.authUser && req.authUser.picture) || '',
          role: roleInfo.role,
          staffLinked: roleInfo.staffLinked,
          domainApproved: isApprovedGoogleDomain(req.authUserEmail)
        }
      });
    })
    .catch(() => {
      return res.json({
        success: true,
        authenticated: true,
        user: {
          email: req.authUserEmail,
          name: (req.authUser && req.authUser.name) || req.authUserEmail,
          picture: (req.authUser && req.authUser.picture) || '',
          role: 'public_access',
          staffLinked: false,
          domainApproved: isApprovedGoogleDomain(req.authUserEmail)
        }
      });
    });
});

app.post('/api/auth/logout', (req, res) => {
  clearSessionCookie(res);
  return res.json({ success: true });
});

// --- Suggestions API ---
app.get('/api/suggestions', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM suggestions ORDER BY date DESC, id DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post('/api/suggestions', async (req, res) => {
  const authEmail = normalizeEmail(req.authUserEmail || '');
  const authName = String(req.authUser && req.authUser.name ? req.authUser.name : '').trim();
  const date = String(req.body.date || '').trim();
  const recipe_name = String(req.body.recipe_name || '').trim();
  const suggested_by_input = String(req.body.suggested_by || '').trim();
  const email_input = normalizeEmail(req.body.email || '');
  const suggested_by = authName || suggested_by_input || (authEmail ? authEmail.split('@')[0] : '');
  const email = authEmail || email_input;
  const url = String(req.body.url || '').trim();
  const reason = String(req.body.reason || '').trim();

  if (!recipe_name || !reason) {
    return res.status(400).json({ error: 'Recipe name and reason are required.' });
  }

  if (!suggested_by) {
    return res.status(400).json({ error: 'Name is required.' });
  }

  if (!email) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  if (authEmail && email_input && email_input !== authEmail) {
    return res.status(400).json({ error: 'When logged in, suggestion email must match your signed-in account.' });
  }

  if (!isTrustedSuggestionEmail(email)) {
    return res.status(400).json({ error: 'Please use a valid school/work email (Google or Microsoft).' });
  }

  const normalizedUrl = url && !/^https?:\/\//i.test(url) ? `https://${url}` : url;

  const doInsert = () => pool.query(
    'INSERT INTO suggestions (date, recipe_name, suggested_by, email, url, reason) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [date, recipe_name, suggested_by, email, normalizedUrl, reason]
  );
  try {
    const result = await doInsert();
    let notification = { sent: false, reason: 'unknown', recipients: [], recipientCount: 0 };
    try {
      notification = await sendSuggestionNotificationEmail({ date, recipe_name, suggested_by, email, url: normalizedUrl, reason });
    } catch (mailErr) {
      console.error('[SUGGESTIONS] Email notification failed:', mailErr.message);
      notification = {
        sent: false,
        reason: 'send_failed',
        recipients: [],
        recipientCount: 0,
        error: mailErr.message
      };
    }

    res.json({ success: true, id: result.rows[0].id, notification });
  } catch (err) {
    if (err.code === '23505' && err.constraint === 'suggestions_pkey') {
      try {
        await pool.query(`SELECT setval(pg_get_serial_sequence('suggestions','id'), COALESCE((SELECT MAX(id) FROM suggestions), 0))`);
        const result = await doInsert();
        let notification = { sent: false, reason: 'unknown', recipients: [], recipientCount: 0 };
        try {
          notification = await sendSuggestionNotificationEmail({ date, recipe_name, suggested_by, email, url: normalizedUrl, reason });
        } catch (mailErr) {
          console.error('[SUGGESTIONS] Email notification failed:', mailErr.message);
          notification = {
            sent: false,
            reason: 'send_failed',
            recipients: [],
            recipientCount: 0,
            error: mailErr.message
          };
        }

        return res.json({ success: true, id: result.rows[0].id, notification });
      } catch (retryErr) {
        return res.status(500).json({ error: retryErr.message });
      }
    }
    res.status(500).json({ error: err.message });
  }
});

// --- Cleanup Instructions API ---
app.post('/api/recipes/cleanup-instructions', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, instructions FROM recipes');
    let updated = 0;
    for (const row of result.rows) {
      if (!row.instructions) continue;
      // Remove <p>, </p>, <br>, <br/>, <br /> and all HTML tags
      let cleaned = row.instructions
        .replace(/<\/?p>/gi, ' ')
        .replace(/<br\s*\/?\s*>/gi, ' ')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ') // collapse whitespace
        .trim();
      await pool.query('UPDATE recipes SET instructions = $1 WHERE id = $2', [cleaned, row.id]);
      updated++;
    }
    res.json({ success: true, updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Set default port if not defined
const PORT = process.env.PORT || 4000;

// RawDataTXT HTML Preview Route (must come BEFORE express.static)
// const fs = require('fs'); // Already declared above

app.put('/api/uploads/:id/raw', async (req, res) => {
  const { id } = req.params;
  let { recipe_id, raw_data } = req.body;
  console.log('[DEBUG /api/uploads/:id/raw] Called with:', { id, recipe_id, raw_data_length: raw_data ? raw_data.length : undefined });
  // Fallback: if recipe_id is not provided, use id
  if (!recipe_id) {
    recipe_id = id;
    console.log('[DEBUG /api/uploads/:id/raw] recipe_id missing, falling back to id:', id);
  }
  if (!raw_data) {
    console.log('[DEBUG /api/uploads/:id/raw] Missing raw_data');
    return res.json({ success: false, error: 'Missing raw_data' });
  }
  const rawDataDir = path.join(__dirname, 'public', 'RawDataTXT');
  // Ensure directory exists
  if (!fs.existsSync(rawDataDir)) {
    fs.mkdirSync(rawDataDir, { recursive: true });
  }
  // Always use recipe_id for file naming if possible
  const fileName = `${recipe_id}.txt`;
  const filePath = path.join(rawDataDir, fileName);
  console.log('[DEBUG /api/uploads/:id/raw] Attempting to write file to:', filePath);
  try {
    await pool.query('UPDATE uploads SET raw_data = $1 WHERE id = $2', [raw_data, id]);
  } catch (err) {
    console.log('[DEBUG /api/uploads/:id/raw] Failed to update uploads table:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to update uploads table', details: err.message });
  }
  // Save raw data to file
  fs.writeFile(filePath, raw_data, async (fileErr) => {
    if (fileErr) {
      console.log('[DEBUG /api/uploads/:id/raw] Failed to write raw data file:', fileErr.message);
      console.log('[DEBUG /api/uploads/:id/raw] Tried to write to:', filePath);
      return res.json({ success: true, file: false, fileError: fileErr.message, filePath });
    }
    console.log('[DEBUG /api/uploads/:id/raw] Successfully updated uploads table and wrote file for recipe_id:', recipe_id, 'id:', id);
    console.log('[DEBUG /api/uploads/:id/raw] File written to:', filePath);
    // Now split ingredient quantities (existing logic)
    let rows;
    try {
      const result = await pool.query('SELECT id, ingredient_name FROM ingredients_inventory WHERE recipe_id = $1', [recipe_id]);
      rows = result.rows;
    } catch (err) {
      console.log('[Split Quantity] DB error selecting:', err);
      return res.json({ success: false, error: err.message });
    }
    if (!rows.length) {
      // console.log('[Split Quantity] No ingredients found for recipe_id:', recipe_id);
      return res.json({ success: true, file: true, updated: 0, failed: 0, note: 'No ingredients found.' });
    }
    let done = 0, failed = 0;
    for (const row of rows) {
      let quantity = '', fooditem = '';
      console.log(`[Split Quantity] Processing row id=${row.id}, ingredient_name='${row.ingredient_name}'`);
      const match = row.ingredient_name.match(/^([\d\s\/.¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]+\s*(?:cup|cups|tbsp|tablespoon|tablespoons|tsp|teaspoon|teaspoons|g|gram|grams|kg|kilogram|kilograms|ml|l|litre|litres|liter|liters|oz|ounce|ounces|lb|pound|pounds|pinch|dash|clove|cloves|can|cans|slice|slices|stick|sticks|packet|packets|piece|pieces|egg|eggs|drop|drops|block|blocks|sheet|sheets|bunch|bunches|sprig|sprigs|head|heads|filet|filets|fillet|fillets|bag|bags|jar|jars|bottle|bottles|container|containers|box|boxes|bar|bars|roll|rolls|strip|strips|cm|mm|inch|inches|pinches|handful|handfuls|dozen|leaves|stalks|ribs|segments|cubes|sprinkles|splashes|litre|litres|millilitre|millilitres|quart|quarts|pint|pints|gallon|gallons)\b)\s*(.*)$/i);
      if (match) {
        quantity = match[1].trim();
        fooditem = match[2].trim();
        console.log(`[Split Quantity] Regex matched. quantity='${quantity}', fooditem='${fooditem}'`);
      } else {
        fooditem = row.ingredient_name.trim();
        console.log(`[Split Quantity] Regex did not match. fooditem='${fooditem}'`);
      }
      try {
        await pool.query('UPDATE ingredients_inventory SET quantity = $1, fooditem = $2 WHERE id = $3', [quantity, fooditem, row.id]);
        done++;
      } catch (err2) {
        failed++;
        console.log(`[Split Quantity] Failed to update row id=${row.id}:`, err2.message);
      }
    }
    // All updates attempted
    console.log(`[Split Quantity] Finished. Updated: ${done}, Failed: ${failed}`);
    res.json({ success: failed === 0, file: true, updated: done, failed });
  });
});

// --- Transfer Instructions Extracted to Instructions ---
app.post('/api/recipes/:id/transfer-instructions', (req, res) => {
  const { id } = req.params;
  db.get('SELECT instructions_extracted FROM recipes WHERE id = ?', [id], (err, row) => {
    if (err || !row) {
      return res.status(404).json({ success: false, error: 'Recipe not found.' });
    }
    db.run('UPDATE recipes SET instructions = ? WHERE id = ?', [row.instructions_extracted, id], function(err2) {
      if (err2) {
        return res.status(500).json({ success: false, error: err2.message });
      }
      res.json({ success: true });
    });
  });
});


// --- Ingredients Solution Endpoint (saves to DB) ---
app.post('/api/ingredients-extractor/solution', (req, res) => {
  const { recipeId, solution } = req.body;
  console.log('[DEBUG /api/ingredients-extractor/solution] Called with:', { recipeId, solution });
  if (!recipeId || !solution) {
    console.log('[DEBUG /api/ingredients-extractor/solution] Missing recipeId or solution');
    return res.status(400).json({ error: 'Recipe ID and solution are required.' });
  }
  // Use Postgres pool.query
  pool.query('UPDATE recipes SET extracted_ingredients = $1 WHERE id = $2', [solution, recipeId], (err, result) => {
    if (err) {
      console.error('[DEBUG /api/ingredients-extractor/solution] Failed to save ingredients solution:', err.message);
      return res.status(500).json({ error: err.message });
    }
    if (result.rowCount === 0) {
      console.log('[DEBUG /api/ingredients-extractor/solution] No recipe found for id:', recipeId);
      return res.status(404).json({ error: 'Recipe not found.' });
    }
    console.log('[DEBUG /api/ingredients-extractor/solution] Successfully updated ingredients for recipe id:', recipeId);
    res.json({ success: true });
  });
});


const fetch = require('node-fetch');
// Endpoint to fetch HTML from a URL (server-side, avoids CORS)
app.post('/api/fetch-html', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'Missing url' });
  // Set a timeout (in ms)
  const FETCH_TIMEOUT = 7000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!response.ok) {
      return res.status(500).json({
        error: 'This web address does not work with our system. Please try a different recipe website.'
      });
    }
    const html = await response.text();
    res.json({ html });
  } catch (err) {
    clearTimeout(timeout);
    let userMessage = 'This web address does not work with our system. Please try a different recipe website.';
    if (err.name === 'AbortError') {
      userMessage = 'This web address is taking too long to respond and may not work with our system. Please try a different recipe website.';
    }
    res.status(500).json({
      error: userMessage
    });
  }
});


// Delete an upload record by ID
app.delete('/api/uploads/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM uploads WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Upload record not found.' });
    }
    res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to delete upload record.' });
  }
});



// --- Recipe Search Endpoint ---
// Returns recipes matching a query (by name)
app.get('/api/search/recipes', (req, res) => {
  const q = (req.query.q || '').trim();
  let sql = 'SELECT id, name FROM recipes';
  let params = [];
  if (q) {
    sql += ' WHERE name LIKE ?';
    params = [`%${q}%`];
  }
  sql += ' ORDER BY name COLLATE NOCASE';
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ recipes: rows });
  });
});
// --- Staff Search Endpoint ---
// Returns staff/teachers matching a query (by name or code)
app.get('/api/search/staff', async (req, res) => {
  const q = (req.query.q || '').trim();
  let sql = 'SELECT DISTINCT "Teacher", "Teacher_Name" as "TeacherName" FROM kamar_timetable WHERE COALESCE(status, \'Current\') = \'Current\'';
  let params = [];
  if (q) {
    sql += ' AND ("Teacher" ILIKE $1 OR "Teacher_Name" ILIKE $2)';
    params = [`%${q}%`, `%${q}%`];
  }
  sql += ' ORDER BY "TeacherName"';
  try {
    const result = await pool.query(sql, params);
    res.json({ staff: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Class Upload Endpoints ---

let classUploadSchemaEnsured = false;

async function ensureClassUploadSchema() {
  if (classUploadSchemaEnsured) return;
  await pool.query('ALTER TABLE class_upload ADD COLUMN IF NOT EXISTS upload_year INTEGER');
  await pool.query('ALTER TABLE class_upload ADD COLUMN IF NOT EXISTS upload_term TEXT');
  await pool.query('ALTER TABLE class_upload ADD COLUMN IF NOT EXISTS upload_date DATE');
  await pool.query(`
    UPDATE class_upload
    SET upload_year = 2026,
        upload_term = 'Term 1',
        upload_date = DATE '2026-04-01'
    WHERE COALESCE(status, 'Current') = 'Current'
      AND upload_year IS NULL
      AND COALESCE(trim(upload_term), '') = ''
      AND upload_date IS NULL
  `);
  classUploadSchemaEnsured = true;
}

function parseClassUploadDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const dmy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return null;
}

function normalizeCsvHeader(value) {
  return (value || '').toString().trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getHeaderIndex(headers, aliases) {
  const normalized = (headers || []).map(normalizeCsvHeader);
  for (const alias of aliases) {
    const idx = normalized.indexOf(normalizeCsvHeader(alias));
    if (idx >= 0) return idx;
  }
  return -1;
}

// POST /api/class-upload: Upload class CSV data
app.post('/api/class-upload', async (req, res) => {
  const { classes, headers = [] } = req.body;
  await ensureClassUploadSchema();
  const uploadYearRaw = Number(req.body.uploadYear);
  const uploadYear = Number.isInteger(uploadYearRaw) ? uploadYearRaw : new Date().getFullYear();
  const uploadTerm = String(req.body.uploadTerm || '').trim() || 'Term 1';
  const uploadDate = parseClassUploadDate(req.body.uploadDate) || new Date().toISOString().slice(0, 10);
  if (!Array.isArray(classes) || classes.length === 0) {
    return res.status(400).json({ success: false, error: 'No class data provided.' });
  }

  const ttcodeIdx = getHeaderIndex(headers, ['ttcode', 'tt code', 'code']);
  const levelIdx = getHeaderIndex(headers, ['level', 'year level', 'year_level']);
  const nameIdx = getHeaderIndex(headers, ['name', 'class name', 'classname']);
  const qualificationIdx = getHeaderIndex(headers, ['qualification', 'year']);
  const departmentIdx = getHeaderIndex(headers, ['department']);
  const subDepartmentIdx = getHeaderIndex(headers, ['sub department', 'sub_department']);
  const teacherIdx = getHeaderIndex(headers, ['teacher_in_charge', 'teacher in charge', 'teacher code', 'teachercode']);
  const descriptionIdx = getHeaderIndex(headers, ['description', 'notes']);
  const starIdx = getHeaderIndex(headers, ['star']);

  const useHeaderMapping = Array.isArray(headers) && headers.length > 0 && ttcodeIdx >= 0;

  const byCode = new Map();
  let skippedNoTtcode = 0;
  for (const row of classes) {
    if (!Array.isArray(row)) continue;
    const ttcode = (useHeaderMapping && ttcodeIdx >= 0 ? row[ttcodeIdx] : row[0] || '').toString().trim();
    if (!ttcode) {
      skippedNoTtcode++;
      continue;
    }
    const level = (useHeaderMapping && levelIdx >= 0 ? row[levelIdx] : row[1] || '').toString().trim();
    const name = (useHeaderMapping && nameIdx >= 0 ? row[nameIdx] : row[2] || '').toString().trim();
    const qualification = (useHeaderMapping && qualificationIdx >= 0 ? row[qualificationIdx] : row[3] || '').toString().trim();
    const department = (useHeaderMapping && departmentIdx >= 0 ? row[departmentIdx] : row[4] || '').toString().trim();
    const subDepartment = (useHeaderMapping && subDepartmentIdx >= 0 ? row[subDepartmentIdx] : row[5] || '').toString().trim();
    const teacherInCharge = (useHeaderMapping && teacherIdx >= 0 ? row[teacherIdx] : row[6] || '').toString().trim();
    const description = (useHeaderMapping && descriptionIdx >= 0 ? row[descriptionIdx] : row[7] || '').toString().trim();
    const star = (useHeaderMapping && starIdx >= 0 ? row[starIdx] : row[8] || '').toString().trim();

    byCode.set(ttcode.toUpperCase(), {
      ttcode,
      level,
      name,
      qualification,
      department,
      subDepartment,
      teacherInCharge,
      description,
      star
    });
  }

  const deduped = Array.from(byCode.values());
  const duplicateTtcodesInUpload = Math.max(0, classes.length - skippedNoTtcode - deduped.length);
  if (deduped.length === 0) {
    return res.status(400).json({ success: false, error: 'No valid rows with TTCode were found.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query("UPDATE class_upload SET status = 'Not Current'");

    let inserted = 0;
    let updated = 0;
    for (const row of deduped) {
      const updateResult = await client.query(
        `UPDATE class_upload
         SET year_level = $2,
             class_name = $3,
             year = $4,
             department = $5,
             extra1 = $6,
             teacher_code = $7,
             notes = $8,
             extra2 = $9,
             upload_year = $10,
             upload_term = $11,
             upload_date = $12::date,
             status = 'Current'
         WHERE upper(trim(code)) = upper(trim($1))`,
        [
          row.ttcode,
          row.level,
          row.name,
          row.qualification,
          row.department,
          row.subDepartment,
          row.teacherInCharge,
          row.description,
          row.star,
          uploadYear,
          uploadTerm,
          uploadDate
        ]
      );

      if (updateResult.rowCount > 0) {
        updated += updateResult.rowCount;
      } else {
        await client.query(
          `INSERT INTO class_upload
            (code, year_level, class_name, year, department, extra1, teacher_code, notes, extra2, upload_year, upload_term, upload_date, status)
           VALUES
            ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::date, 'Current')`,
          [
            row.ttcode,
            row.level,
            row.name,
            row.qualification,
            row.department,
            row.subDepartment,
            row.teacherInCharge,
            row.description,
            row.star,
            uploadYear,
            uploadTerm,
            uploadDate
          ]
        );
        inserted++;
      }
    }

    const inactiveResult = await client.query("SELECT COUNT(*)::int AS count FROM class_upload WHERE status = 'Not Current'");
    const markedNotCurrent = inactiveResult.rows[0]?.count || 0;

    await client.query('COMMIT');
    res.json({
      success: true,
      inserted,
      updated,
      marked_not_current: markedNotCurrent,
      skipped_no_ttcode: skippedNoTtcode,
      duplicate_ttcodes_in_upload: duplicateTtcodesInUpload,
      processed: deduped.length,
      upload_year: uploadYear,
      upload_term: uploadTerm,
      upload_date: uploadDate
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

// GET /api/class_upload/all: Fetch all class records
app.get('/api/class_upload/all', async (req, res) => {
  try {
    await ensureClassUploadSchema();
    const result = await pool.query(`
      SELECT
        id,
        code AS ttcode,
        year_level AS level,
        class_name AS name,
        year AS qualification,
        department,
        extra1 AS sub_department,
        teacher_code AS teacher_in_charge,
        notes AS description,
        extra2 AS star,
        upload_year,
        upload_term,
        upload_date,
        COALESCE(status, 'Current') AS status
      FROM class_upload
      ORDER BY class_name
    `);
    res.json({ classes: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch class upload data.' });
  }
});

// DELETE /api/class-upload/all: Delete all class records
app.delete('/api/class-upload/all', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM class_upload');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to delete class records.' });
  }
});


// --- Timetable Table Fetch Endpoint ---
app.get('/api/timetable/all', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM kamar_timetable');
    res.json({ timetable: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch timetable data.' });
  }
});
    // --- Instructions Solution Endpoint (saves to DB) ---
    app.post('/api/instructions-extractor/solution', async (req, res) => {
      const { recipeId, solution } = req.body;
      if (!recipeId || !solution) {
        return res.status(400).json({ error: 'Recipe ID and solution are required.' });
      }
      try {
        const result = await pool.query('UPDATE recipes SET instructions_extracted = $1, instructions = $2 WHERE id = $3', [solution, solution, recipeId]);
        if (result.rowCount === 0) {
          return res.status(404).json({ error: 'Recipe not found.' });
        }
        res.json({ success: true });
      } catch (err) {
        console.error('Failed to save instructions solution:', err.message);
        return res.status(500).json({ error: err.message });
      }
    });


    // --- Ingredients Inventory Endpoints ---




        // --- Sync Uploaded Recipes to Recipes Table ---
    app.post('/api/recipes/sync-from-uploads', async (req, res) => {
      try {
        const uploadsResult = await pool.query('SELECT * FROM uploads');
        const uploads = uploadsResult.rows;
        let inserted = 0;
        if (!uploads.length) return res.json({ success: true, inserted: 0 });
        for (const upload of uploads) {
          const recipeResult = await pool.query('SELECT * FROM recipes WHERE uploaded_recipe_id = $1', [upload.id]);
          if (recipeResult.rows.length === 0) {
            await pool.query('INSERT INTO recipes (uploaded_recipe_id, name, url) VALUES ($1, $2, $3)', [upload.id, upload.recipe_title, upload.source_url]);
            inserted++;
          }
        }
        res.json({ success: true, inserted });
      } catch (err) {
        console.error('[DEBUG /api/recipes/sync-from-uploads] Error:', err);
        res.status(500).json({ success: false, error: err.message });
      }
    });




    // POST: Sync ingredients_inventory from main ingredients table (with quantity)
    app.post('/api/ingredients-inventory/sync', (req, res) => {
      db.run('DELETE FROM ingredients_inventory', [], function(err) {
        if (err) return res.status(500).json({ success: false, error: err.message });
        db.all('SELECT * FROM ingredients_inventory', [], (err2, rows) => {
          if (err2) return res.status(500).json({ success: false, error: err2.message });
          if (!rows.length) return res.json({ success: true, inserted: 0 });
          let done = 0, inserted = 0;
          // Helper to convert unicode and vulgar fractions to float
          function parseFraction(str) {
            const vulgarMap = {
              '¼': 0.25, '½': 0.5, '¾': 0.75,
              '⅐': 1/7, '⅑': 1/9, '⅒': 0.1, '⅓': 1/3, '⅔': 2/3, '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8, '⅙': 1/6, '⅚': 5/6, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875
            };
            str = str.trim();
            // Replace vulgar fractions
            str = str.replace(/[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, m => ' ' + vulgarMap[m]);
            // Handle mixed numbers (e.g., 1 1/2)
            let parts = str.split(' ');
            let total = 0;
            for (let part of parts) {
              if (/^\d+$/.test(part)) total += parseInt(part);
              else if (/^\d+\/\d+$/.test(part)) {
                let [n, d] = part.split('/');
                total += parseInt(n) / parseInt(d);
              } else if (!isNaN(parseFloat(part))) {
                total += parseFloat(part);
              }
            }
            return total || null;
          }
          // Accept common units
          const units = [
            'cup', 'cups', 'tbsp', 'tablespoon', 'tablespoons', 'tsp', 'teaspoon', 'teaspoons',
            'g', 'gram', 'grams', 'kg', 'kilogram', 'kilograms', 'ml', 'l', 'litre', 'litres', 'liter', 'liters',
            'oz', 'ounce', 'ounces', 'lb', 'pound', 'pounds', 'pinch', 'dash', 'clove', 'cloves', 'can', 'cans', 'slice', 'slices', 'stick', 'sticks', 'packet', 'packets', 'piece', 'pieces', 'egg', 'eggs', 'drop', 'drops', 'block', 'blocks', 'sheet', 'sheets', 'bunch', 'bunches', 'sprig', 'sprigs', 'head', 'heads', 'filet', 'filets', 'fillet', 'fillets', 'bag', 'bags', 'jar', 'jars', 'bottle', 'bottles', 'container', 'containers', 'box', 'boxes', 'bar', 'bars', 'roll', 'rolls', 'strip', 'strips', 'cm', 'mm', 'inch', 'inches', 'pinches', 'handful', 'handfuls', 'dozen', 'sheet', 'sheets', 'leaf', 'leaves', 'stalk', 'stalks', 'rib', 'ribs', 'segment', 'segments', 'piece', 'pieces', 'cube', 'cubes', 'drop', 'drops', 'sprinkle', 'sprinkles', 'dash', 'dashes', 'splash', 'splashes', 'liter', 'liters', 'milliliter', 'millilitres', 'millilitre', 'millilitres', 'quart', 'quarts', 'pint', 'pints', 'gallon', 'gallons', 'ml', 'l', 'dl', 'cl', 'mg', 'mcg', 'µg', 'kg', 'g', 'lb', 'oz', 'cup', 'cups', 'tbsp', 'tsp', 'teaspoon', 'tablespoon', 'pinch', 'dash', 'drop', 'handful', 'stick', 'slice', 'piece', 'clove', 'can', 'bunch', 'sprig', 'head', 'filet', 'fillet', 'block', 'sheet', 'bag', 'jar', 'bottle', 'container', 'box', 'bar', 'roll', 'strip', 'cm', 'mm', 'inch', 'pinches', 'handfuls', 'dozen', 'leaves', 'stalks', 'ribs', 'segments', 'cubes', 'sprinkles', 'splashes', 'litre', 'litres', 'millilitre', 'millilitres', 'quart', 'quarts', 'pint', 'pints', 'gallon', 'gallons'
          ];
          const unitPattern = units.join('|');
          const regex = new RegExp(`^([\d\s\/\.¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]+)\s*(${unitPattern})\b\s*(.*)$`, 'i');
          rows.forEach(row => {
            let measure_qty = null, measure_unit = null;
            if (row.quantity) {
              const match = row.quantity.match(regex);
              if (match) {
                measure_qty = parseFraction(match[1]);
                measure_unit = match[2];
              }
            }
            db.run('INSERT INTO ingredients_inventory (ingredient_name, recipe_id, quantity, measure_qty, measure_unit) VALUES (?, ?, ?, ?, ?)', [row.ingredient_name, row.recipe_id, row.quantity, measure_qty, measure_unit], function(err3) {
              done++;
              if (!err3) inserted++;
              if (done === rows.length) {
                res.json({ success: true, inserted });
              }
            });
          });
        });
      });
    });
    // GET all ingredients inventory
    app.get('/api/ingredients-inventory', async (req, res) => {
      try {
        const result = await pool.query('SELECT * FROM ingredients_inventory');
        res.json(result.rows);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // --- Aliases for legacy/misnamed frontend endpoints ---
    // /api/ingredients/inventory/all
    app.get('/api/ingredients/inventory/all', async (req, res) => {
      try {
        const result = await pool.query('SELECT * FROM ingredients_inventory');
        res.json(result.rows);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // /api/ingredients/inventory_table/all
    app.get('/api/ingredients/inventory_table/all', async (req, res) => {
      try {
        const result = await pool.query('SELECT * FROM ingredients_inventory');
        res.json(result.rows);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // /api/ingredients/inventory_table
    app.get('/api/ingredients/inventory_table', async (req, res) => {
      try {
        const result = await pool.query('SELECT * FROM ingredients_inventory');
        res.json(result.rows);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // DELETE all ingredients inventory
    app.delete('/api/ingredients-inventory', requireAdmin, async (req, res) => {
      try {
        await pool.query('DELETE FROM ingredients_inventory');
        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // POST: Reformat/Parse all ingredients (parse quantity into measure_qty and measure_unit, and trim/lowercase name)
    app.post('/api/ingredients-inventory/reformat', (req, res) => {
      db.all('SELECT * FROM ingredients_inventory', [], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        let updates = 0;
        let done = 0;
        if (rows.length === 0) return res.json({ success: true });
        rows.forEach(row => {
          // Parse quantity into measure_qty and measure_unit
          let measure_qty = null, measure_unit = null;
          if (row.quantity) {
            const match = row.quantity.match(/([\d.]+)\s*([a-zA-Z]+)\s*(.*)/);
            if (match) {
              measure_qty = parseFloat(match[1]);
              measure_unit = match[2];
            }
          }
          db.run('UPDATE ingredients_inventory SET measure_qty = ?, measure_unit = ? WHERE id = ?', [measure_qty, measure_unit, row.id], function(err2) {
            done++;
            if (!err2) updates++;
            if (done === rows.length) {
              res.json({ success: true, updated: updates });
            }
          });
        });
      });
    });

    // Endpoint to extract raw HTML/text from a given URL
    app.post('/api/extract-raw', async (req, res) => {
      try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'No URL provided.' });

        const response = await fetch(url);
        if (!response.ok) {
          console.error('Failed to fetch URL:', url, 'Status:', response.status, response.statusText);
          return res.status(500).json({ error: 'Failed to fetch URL.', status: response.status, statusText: response.statusText });
        }

        const html = await response.text();
        res.json({ raw: html });
      } catch (err) {
        console.error('Error in /api/extract-raw:', err);
        res.status(500).json({ error: 'Failed to extract data from URL.', details: err.message });
      }
    });

    // Get a single upload by ID
    app.get('/api/uploads/:id', async (req, res) => {
      const { id } = req.params;
      try {
        const result = await pool.query('SELECT * FROM uploads WHERE id = $1', [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Upload not found.' });
        res.json(result.rows[0]);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });


// Legacy duplicate endpoint retained under a non-production path for reference only.
app.put('/api/_legacy/uploads/:id/raw', (req, res) => {
  const { id } = req.params;
  const { recipe_id, raw_data } = req.body;
  // (Removed old db.run call, now using pool.query above)
  if (!fs.existsSync(rawDataDir)) {
    fs.mkdirSync(rawDataDir, { recursive: true });
  }
  const filePath = path.join(rawDataDir, `${id}.txt`);
  console.log('[DEBUG /api/uploads/:id/raw] Attempting to write file to:', filePath);
  db.run('UPDATE uploads SET raw_data = ? WHERE id = ?', [raw_data, id], function(err) {
    if (err) {
      console.log('[DEBUG /api/uploads/:id/raw] Failed to update uploads table:', err.message);
      return res.status(500).json({ success: false, error: 'Failed to update uploads table', details: err.message });
    }
    // Save raw data to file
    fs.writeFile(filePath, raw_data, (fileErr) => {
      if (fileErr) {
        console.log('[DEBUG /api/uploads/:id/raw] Failed to write raw data file:', fileErr.message);
        console.log('[DEBUG /api/uploads/:id/raw] Tried to write to:', filePath);
        return res.json({ success: true, file: false, fileError: fileErr.message, filePath });
      }
      console.log('[DEBUG /api/uploads/:id/raw] Successfully updated uploads table and wrote file for id:', id);
      console.log('[DEBUG /api/uploads/:id/raw] File written to:', filePath);
      // Now split ingredient quantities (existing logic)
      db.all('SELECT id, ingredient_name FROM ingredients_inventory WHERE recipe_id = ?', [recipe_id], (err, rows) => {
        if (err) {
          console.log('[Split Quantity] DB error selecting:', err);
          return res.json({ success: false, error: err.message });
        }
        if (!rows.length) {
          // console.log('[Split Quantity] No ingredients found for recipe_id:', recipe_id);
          return res.json({ success: true, file: true, updated: 0, failed: 0, note: 'No ingredients found.' });
        }
        let done = 0, failed = 0;
        rows.forEach(row => {
          let quantity = '', fooditem = '';
          console.log(`[Split Quantity] Processing row id=${row.id}, ingredient_name='${row.ingredient_name}'`);
          const match = row.ingredient_name.match(/^([\d\s\/.¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]+\s*(?:cup|cups|tbsp|tablespoon|tablespoons|tsp|teaspoon|teaspoons|g|gram|grams|kg|kilogram|kilograms|ml|l|litre|litres|liter|liters|oz|ounce|ounces|lb|pound|pounds|pinch|dash|clove|cloves|can|cans|slice|slices|stick|sticks|packet|packets|piece|pieces|egg|eggs|drop|drops|block|blocks|sheet|sheets|bunch|bunches|sprig|sprigs|head|heads|filet|filets|fillet|fillets|bag|bags|jar|jars|bottle|bottles|container|containers|box|boxes|bar|bars|roll|rolls|strip|strips|cm|mm|inch|inches|pinches|handful|handfuls|dozen|leaves|stalks|ribs|segments|cubes|sprinkles|splashes|litre|litres|millilitre|millilitres|quart|quarts|pint|pints|gallon|gallons)\b)\s*(.*)$/i);
          if (match) {
            quantity = match[1].trim();
            fooditem = match[2].trim();
            console.log(`[Split Quantity] Regex matched. quantity='${quantity}', fooditem='${fooditem}'`);
          } else {
            fooditem = row.ingredient_name.trim();
            console.log(`[Split Quantity] Regex did not match. fooditem='${fooditem}'`);
          }
          db.run('UPDATE ingredients_inventory SET quantity = ?, fooditem = ? WHERE id = ?', [quantity, fooditem, row.id], function(err2) {
            if (err2) {
              failed++;
              console.log(`[Split Quantity] Failed to update row id=${row.id}:`, err2.message);
            } else {
              done++;
            }
            if (done + failed === rows.length) {
              // All updates attempted
              console.log(`[Split Quantity] Finished. Updated: ${done}, Failed: ${failed}`);
              res.json({ success: failed === 0, file: true, updated: done, failed });
            }
          });
        });
      });
    });
  });
});

    // --- Auto-parse and insert ingredients when recipe is loaded ---
    function parseIngredients(rawText) {
      let lines;
      try {
        lines = JSON.parse(rawText);
        if (!Array.isArray(lines)) throw new Error();
      } catch {
        lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      }
      // Helper to convert unicode and vulgar fractions to float
      function parseFraction(str) {
        const vulgarMap = {
          '¼': 0.25, '½': 0.5, '¾': 0.75,
          '⅐': 1/7, '⅑': 1/9, '⅒': 0.1, '⅓': 1/3, '⅔': 2/3, '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8, '⅙': 1/6, '⅚': 5/6, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875
        };
        str = str.trim();
        // Replace vulgar fractions
        str = str.replace(/[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, m => ' ' + vulgarMap[m]);
        // Handle mixed numbers (e.g., 1 1/2)
        let parts = str.split(' ');
        let total = 0;
        for (let part of parts) {
          if (/^\d+$/.test(part)) total += parseInt(part);
          else if (/^\d+\/\d+$/.test(part)) {
            let [n, d] = part.split('/');
            total += parseInt(n) / parseInt(d);
          } else if (!isNaN(parseFloat(part))) {
            total += parseFloat(part);
          }
        }
        return total || null;
      }

      // Accept common units
      const units = [
        'cup', 'cups', 'tbsp', 'tablespoon', 'tablespoons', 'tsp', 'teaspoon', 'teaspoons',
        'g', 'gram', 'grams', 'kg', 'kilogram', 'kilograms', 'ml', 'l', 'litre', 'litres', 'liter', 'liters',
        'oz', 'ounce', 'ounces', 'lb', 'pound', 'pounds', 'pinch', 'dash', 'clove', 'cloves', 'can', 'cans', 'slice', 'slices', 'stick', 'sticks', 'packet', 'packets', 'piece', 'pieces', 'egg', 'eggs', 'drop', 'drops', 'block', 'blocks', 'sheet', 'sheets', 'bunch', 'bunches', 'sprig', 'sprigs', 'head', 'heads', 'filet', 'filets', 'fillet', 'fillets', 'bag', 'bags', 'jar', 'jars', 'bottle', 'bottles', 'container', 'containers', 'box', 'boxes', 'bar', 'bars', 'roll', 'rolls', 'strip', 'strips', 'cm', 'mm', 'inch', 'inches', 'pinches', 'handful', 'handfuls', 'dozen', 'sheet', 'sheets', 'leaf', 'leaves', 'stalk', 'stalks', 'rib', 'ribs', 'segment', 'segments', 'piece', 'pieces', 'cube', 'cubes', 'drop', 'drops', 'sprinkle', 'sprinkles', 'dash', 'dashes', 'splash', 'splashes', 'liter', 'liters', 'milliliter', 'millilitres', 'millilitre', 'millilitres', 'quart', 'quarts', 'pint', 'pints', 'gallon', 'gallons', 'ml', 'l', 'dl', 'cl', 'mg', 'mcg', 'µg', 'kg', 'g', 'lb', 'oz', 'cup', 'cups', 'tbsp', 'tsp', 'teaspoon', 'tablespoon', 'pinch', 'dash', 'drop', 'handful', 'stick', 'slice', 'piece', 'clove', 'can', 'bunch', 'sprig', 'head', 'filet', 'fillet', 'block', 'sheet', 'bag', 'jar', 'bottle', 'container', 'box', 'bar', 'roll', 'strip', 'cm', 'mm', 'inch', 'pinches', 'handfuls', 'dozen', 'leaves', 'stalks', 'ribs', 'segments', 'cubes', 'sprinkles', 'splashes', 'litre', 'litres', 'millilitre', 'millilitres', 'quart', 'quarts', 'pint', 'pints', 'gallon', 'gallons'
      ];
      const unitPattern = units.join('|');
      const regex = new RegExp(`^([\d\s\/\.¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]+)\s*(${unitPattern})\b\s*(.*)$`, 'i');

      return lines.map(line => {
        const match = line.match(regex);
        if (match) {
          const qty = parseFraction(match[1]);
          return {
            quantity: match[1].trim(),
            unit: match[2].trim(),
            name: match[3].trim(),
            measure_qty: qty,
            measure_unit: match[2].trim()
          };
        } else {
          return { quantity: '', unit: '', name: line, measure_qty: null, measure_unit: null };
        }
      });
    }

    // When a recipe is loaded by ID, auto-parse and insert ingredients
    app.get('/api/recipes/:id', async (req, res) => {
      const { id } = req.params;
      try {
        const recipeResult = await pool.query('SELECT * FROM recipes WHERE id = $1', [id]);
        if (recipeResult.rows.length === 0) return res.status(404).json({ error: 'Recipe not found.' });
        const recipe = recipeResult.rows[0];
        let rawIngredients = recipe.ingredients;
        if (!rawIngredients) return res.json(recipe); // nothing to parse
        let parsed = [];
        try {
          parsed = parseIngredients(rawIngredients);
        } catch (parseErr) {
          // If parsing fails, just return the recipe
          console.error('[parseIngredients error]', parseErr);
          return res.json(recipe);
        }
        try {
          await pool.query('DELETE FROM ingredients_inventory WHERE recipe_id = $1', [id]);
          if (parsed.length > 0) {
            for (const ing of parsed) {
              await pool.query('INSERT INTO ingredients_inventory (recipe_id, ingredient_name, quantity, measure_qty, measure_unit) VALUES ($1, $2, $3, $4, $5)', [id, ing.name, ing.quantity, ing.measure_qty, ing.measure_unit]);
            }
          }
        } catch (dbErr) {
          // If DB update fails, log and return recipe
          console.error('[DB update error]', dbErr);
          return res.json(recipe);
        }
        res.json(recipe);
      } catch (err) {
        console.error('[GET /api/recipes/:id error]', err);
        res.status(500).json({ error: err.message });
      }
    });

// ...existing code...

// --- POST /api/ingredients/inventory/save-bulk ---
app.post('/api/ingredients/inventory/save-bulk', async (req, res) => {
  try {
    const { ingredients } = req.body;
    if (!Array.isArray(ingredients) || ingredients.length === 0) {
      console.error('[save-bulk] No ingredients array provided or array is empty:', req.body);
      return res.status(400).json({ success: false, error: 'No ingredients array provided.' });
    }
    let inserted = 0;
    let errors = [];
    for (const ing of ingredients) {
      // Log each ingredient for debugging
      console.log('[save-bulk] Inserting:', ing);
      // Validate required fields
      if (!ing.recipe_id || !ing.ingredient_name || !ing.ingredient_name.trim()) {
        errors.push({ error: 'Missing recipe_id or ingredient_name', ingredient: ing });
        continue;
      }
      // Convert empty string to null for quantity and measure_qty
      const safeQuantity = (ing.quantity === '' || ing.quantity === undefined) ? null : ing.quantity;
      const safeMeasureQty = (ing.measure_qty === '' || ing.measure_qty === undefined) ? null : ing.measure_qty;
      try {
        await pool.query(
          'INSERT INTO ingredients_inventory (recipe_id, ingredient_name, quantity, measure_qty, measure_unit, fooditem, stripfooditem, aisle_category_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
          [
            ing.recipe_id,
            ing.ingredient_name,
            safeQuantity,
            safeMeasureQty,
            ing.measure_unit || '',
            ing.fooditem || '',
            ing.stripFoodItem || '',
            ing.aisle_category_id || null
          ]
        );
        inserted++;
      } catch (err) {
        errors.push({ error: err.message, ingredient: ing });
        console.error('[save-bulk] Insert error:', err.message, ing);
      }
    }
    if (inserted === 0) {
      return res.status(500).json({ success: false, error: 'No ingredients inserted.', details: errors });
    }
    res.json({ success: true, inserted, errors });
  } catch (err) {
    console.error('[save-bulk] Fatal error:', err);
    res.status(500).json({ error: err.message });
  }
});




// --- POST /api/ingredients/inventory/split-quantity ---
app.post('/api/ingredients/inventory/split-quantity', async (req, res) => {
  // This is a stub implementation. You can add logic to split a single quantity as needed.
  try {
    // Example: just return success for now
    res.json({ success: true, message: 'Split quantity endpoint hit (stub).' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// --- POST /api/ingredients/inventory/save-parsed ---
app.post('/api/ingredients/inventory/save-parsed', async (req, res) => {
  // This is a stub implementation. You can add logic to save parsed data as needed.
  try {
    // Example: just return success for now
    res.json({ success: true, message: 'Save parsed endpoint hit (stub).' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

    // ...all other route definitions (recipes, ingredients, classes, uploads, shopping lists, etc.) go here...

    // Example API endpoint
    app.get('/api/status', (req, res) => {
      res.json({ status: 'Backend is running', db: 'SQLite connected' });
    });

    // --- Recipes ---
    // Return all recipes in recipe_display table for frontend
    app.get('/api/recipes/display-table', async (req, res) => {
      const sql = `SELECT id, name, description, ingredients, serving_size, url, instructions, recipeid, image_url FROM recipe_display ORDER BY id DESC`;
      console.log('[DISPLAY_TABLE][HIT] /api/recipes/display-table endpoint called');
      console.log('[DISPLAY_TABLE][SQL]', sql);
      try {
        await ensureRecipeDisplayImageColumn();
        const result = await pool.query(sql);
        res.json(result.rows);
      } catch (err) {
        console.error('[DISPLAY_TABLE][ERROR]', err);
        if (err.stack) console.error('[DISPLAY_TABLE][STACK]', err.stack);
        res.status(500).json({ error: err.message, stack: err.stack });
      }
    });
    // Display recipe: copy to recipe_display table
    app.post('/api/recipes/:id/display', async (req, res) => {
      const { id } = req.params;
      try {
        await ensureRecipeDisplayImageColumn();
        // Fetch recipe by ID
        const recipeResult = await pool.query('SELECT * FROM recipes WHERE id = $1', [id]);
        if (recipeResult.rows.length === 0) return res.status(404).json({ error: 'Recipe not found.' });
        const recipe = recipeResult.rows[0];
        // Upsert into recipe_display table (update if exists, insert if not)
        const upsertSql = `
          INSERT INTO recipe_display (name, description, ingredients, serving_size, url, instructions, recipeid, image_url)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (recipeid) DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            ingredients = EXCLUDED.ingredients,
            serving_size = EXCLUDED.serving_size,
            url = EXCLUDED.url,
            instructions = EXCLUDED.instructions,
            image_url = COALESCE(recipe_display.image_url, EXCLUDED.image_url)
          RETURNING id`;
        const upsertResult = await pool.query(upsertSql, [
          recipe.name,
          recipe.description,
          recipe.ingredients_display, // ingredients = ingredients_display
          recipe.serving_size,
          recipe.url,
          recipe.instructions,
          recipe.id, // recipeID
          recipe.image_url || null
        ]);
        res.json({ success: true, display_id: upsertResult.rows[0].id });
      } catch (err) {
        console.error('[DISPLAY][ERROR]', err);
        res.status(500).json({ error: err.message });
      }
    });

    // Admin image management for recipe_display cards/details.
    app.get('/api/admin/recipe-images', requireAdmin, async (req, res) => {
      try {
        await ensureRecipeDisplayImageColumn();
        const result = await pool.query(
          `SELECT id, recipeid, name, url, image_url
           FROM recipe_display
           ORDER BY lower(name), id`
        );
        res.json({ success: true, recipes: result.rows });
      } catch (err) {
        console.error('[ADMIN_RECIPE_IMAGES][LIST][ERROR]', err);
        res.status(500).json({ success: false, error: err.message });
      }
    });

    app.put('/api/admin/recipe-images/:id', requireAdmin, async (req, res) => {
      const { id } = req.params;
      const imageUrl = String((req.body && req.body.image_url) || '').trim();

      if (imageUrl && !/^https?:\/\//i.test(imageUrl) && !/^\/images\//i.test(imageUrl)) {
        return res.status(400).json({ success: false, error: 'Image URL must start with http(s):// or /images/.' });
      }

      try {
        await ensureRecipeDisplayImageColumn();
        const result = await pool.query(
          `UPDATE recipe_display
           SET image_url = $1
           WHERE id = $2
           RETURNING id, recipeid, name, url, image_url`,
          [imageUrl || null, id]
        );

        if (!result.rowCount) {
          return res.status(404).json({ success: false, error: 'Recipe not found in display table.' });
        }

        res.json({ success: true, recipe: result.rows[0] });
      } catch (err) {
        console.error('[ADMIN_RECIPE_IMAGES][SET_URL][ERROR]', err);
        res.status(500).json({ success: false, error: err.message });
      }
    });

    app.post('/api/admin/recipe-images/:id/upload', requireAdmin, async (req, res) => {
      const { id } = req.params;
      const imageData = req.body && req.body.image_data;
      const parsed = parseImageDataUrl(imageData);

      if (!parsed || !parsed.buffer || !parsed.buffer.length) {
        return res.status(400).json({ success: false, error: 'Invalid image payload. Expected PNG/JPG/WEBP/GIF data URL.' });
      }

      if (parsed.buffer.length > 8 * 1024 * 1024) {
        return res.status(400).json({ success: false, error: 'Image is too large. Use an image under 8MB.' });
      }

      try {
        await ensureRecipeDisplayImageColumn();

        const dir = path.join(__dirname, 'public', 'images', 'recipe_user_uploads');
        await fs.promises.mkdir(dir, { recursive: true });

        const baseName = sanitizeImageFileBase(req.body && req.body.file_name);
        const stamp = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
        const fileName = `${baseName}_${stamp}.${parsed.ext}`;
        const filePath = path.join(dir, fileName);

        await fs.promises.writeFile(filePath, parsed.buffer);

        const publicImageUrl = `/images/recipe_user_uploads/${encodeURIComponent(fileName)}`;
        const updateResult = await pool.query(
          `UPDATE recipe_display
           SET image_url = $1
           WHERE id = $2
           RETURNING id, recipeid, name, url, image_url`,
          [publicImageUrl, id]
        );

        if (!updateResult.rowCount) {
          return res.status(404).json({ success: false, error: 'Recipe not found in display table.' });
        }

        res.json({ success: true, recipe: updateResult.rows[0] });
      } catch (err) {
        console.error('[ADMIN_RECIPE_IMAGES][UPLOAD][ERROR]', err);
        res.status(500).json({ success: false, error: err.message });
      }
    });
    app.get('/api/recipes', async (req, res) => {
      // Return all main fields including uploaded_recipe_id for table display
      const sql = `
        SELECT id, uploaded_recipe_id, name, description, ingredients, serving_size, url,
        instructions, instructions_extracted, ingredients_display, extracted_ingredients, extracted_serving_size, extracted_instructions
        FROM recipes
        ORDER BY id DESC
      `;
      console.log('[DEBUG /api/recipes] SQL:', sql);
      try {
        const result = await pool.query(sql);
       //console.log('[DEBUG /api/recipes] Result:', result.rows);
        res.json(result.rows);
      } catch (err) {
        console.error('[DEBUG /api/recipes] Error:', err);
        res.status(500).json({ error: err.message });
      }
    });

    app.post('/api/recipes', (req, res) => {
      const { name, description } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'Recipe name is required.' });
      }
      db.run('INSERT INTO recipes (name, description) VALUES (?, ?)', [name, description], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, name, description });
      });
    });

    // Update recipe
    app.put('/api/recipes/:id', (req, res) => {
      const { id } = req.params;
      const { name, description } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'Recipe name is required.' });
      }
      db.run('UPDATE recipes SET name = ?, description = ? WHERE id = ?', [name, description, id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Recipe not found.' });
        res.json({ id, name, description });
      });
    });

    // Delete recipe
    app.delete('/api/recipes/:id', (req, res) => {
      const { id } = req.params;
      pool.query('DELETE FROM recipes WHERE id = $1', [id])
        .then(result => {
          if (result.rowCount === 0) return res.status(404).json({ error: 'Recipe not found.' });
          res.json({ success: true });
        })
        .catch(err => {
          res.status(500).json({ error: err.message });
        });
    });

    // --- Ingredients ---
    app.get('/api/ingredients', (req, res) => {
      db.all('SELECT * FROM ingredients_inventory', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
      });
    });

    app.post('/api/ingredients', (req, res) => {
  const { recipe_id, ingredient_name, quantity, measure_qty, measure_unit } = req.body;
  if (!recipe_id || !ingredient_name) {
    return res.status(400).json({ error: 'Recipe ID and ingredient name are required.' });
  }
  db.run('INSERT INTO ingredients_inventory (recipe_id, ingredient_name, quantity, measure_qty, measure_unit) VALUES (?, ?, ?, ?, ?)', [recipe_id, ingredient_name, quantity, measure_qty, measure_unit], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, recipe_id, ingredient_name, quantity, measure_qty, measure_unit });
  });
});

    // Update ingredient
    app.put('/api/ingredients/:id', (req, res) => {
      const { id } = req.params;
      const { recipe_id, ingredient_name, quantity, measure_qty, measure_unit } = req.body;
      if (!recipe_id || !ingredient_name) {
        return res.status(400).json({ error: 'Recipe ID and ingredient name are required.' });
      }
      db.run('UPDATE ingredients_inventory SET recipe_id = ?, ingredient_name = ?, quantity = ?, measure_qty = ?, measure_unit = ? WHERE id = ?', [recipe_id, ingredient_name, quantity, measure_qty, measure_unit, id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Ingredient not found.' });
        res.json({ id, recipe_id, ingredient_name, quantity, measure_qty, measure_unit });
      });
    });

    // Delete ingredient
    app.delete('/api/ingredients/:id', async (req, res) => {
      const { id } = req.params;
      try {
        const result = await pool.query('DELETE FROM ingredients_inventory WHERE id = $1', [id]);
        if (result.rowCount === 0) {
          return res.status(404).json({ error: 'Ingredient not found.' });
        }
        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // --- Classes ---
    app.get('/api/classes', (req, res) => {
      db.all('SELECT * FROM classes', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
      });
    });

    app.post('/api/classes', (req, res) => {
      const { name, description } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'Class name is required.' });
      }
      db.run('INSERT INTO classes (name, description) VALUES (?, ?)', [name, description], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, name, description });
      });
    });

    // Update class
    app.put('/api/classes/:id', (req, res) => {
      const { id } = req.params;
      const { name, description } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'Class name is required.' });
      }
      db.run('UPDATE classes SET name = ?, description = ? WHERE id = ?', [name, description, id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Class not found.' });
        res.json({ id, name, description });
      });
    });

    // Delete class
    app.delete('/api/classes/:id', (req, res) => {
      const { id } = req.params;
      db.run('DELETE FROM classes WHERE id = ?', [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Class not found.' });
        res.json({ success: true });
      });
    });

    // --- Shopping Lists ---
    app.get('/api/shopping-lists', (req, res) => {
      db.all('SELECT * FROM shopping_lists', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
      });
    });

    app.post('/api/shopping-lists', (req, res) => {
      const { name, recipe_ids } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'Shopping list name is required.' });
      }
      db.run('INSERT INTO shopping_lists (name, recipe_ids) VALUES (?, ?)', [name, recipe_ids], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, name, recipe_ids });
      });
    });

    // Update shopping list
    app.put('/api/shopping-lists/:id', (req, res) => {
      const { id } = req.params;
      const { name, recipe_ids } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'Shopping list name is required.' });
      }
      db.run('UPDATE shopping_lists SET name = ?, recipe_ids = ? WHERE id = ?', [name, recipe_ids, id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Shopping list not found.' });
        res.json({ id, name, recipe_ids });
      });
    });

    // Delete shopping list
    app.delete('/api/shopping-lists/:id', (req, res) => {
      const { id } = req.params;
      db.run('DELETE FROM shopping_lists WHERE id = ?', [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Shopping list not found.' });
        res.json({ success: true });
      });
    });

// --- Serving Size Solution Endpoint (saves to DB) ---
app.post('/api/serving-size/solution', (req, res) => {
  const { recipeId, solution } = req.body;
  if (!recipeId || !solution) {
    return res.status(400).json({ error: 'Recipe ID and solution are required.' });
  }
  pool.query('UPDATE recipes SET serving_size = $1 WHERE id = $2', [solution, recipeId])
    .then(result => {
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Recipe not found.' });
      }
      res.json({ success: true });
    })
    .catch(err => {
      console.error('Failed to save serving size solution:', err.message);
      return res.status(500).json({ error: err.message });
    });
});

// --- Uploads ---
// Deprecated duplicate route kept under explicit deprecated path to avoid collisions.
app.put('/api/_deprecated/uploads/:id/raw', async (req, res) => {
  const { id } = req.params;
  const { recipe_id, raw_data } = req.body;
  console.log('[DEBUG /api/uploads/:id/raw] Called with:', { id, recipe_id, raw_data_length: raw_data ? raw_data.length : undefined });
  if (!recipe_id) {
    console.log('[DEBUG /api/uploads/:id/raw] Missing recipe_id');
    return res.json({ success: false, error: 'Missing recipe_id' });
  }
  if (!raw_data) {
    console.log('[DEBUG /api/uploads/:id/raw] Missing raw_data');
    return res.json({ success: false, error: 'Missing raw_data' });
  }
  const rawDataDir = path.join(__dirname, 'public', 'RawDataTXT');
  // Ensure directory exists
  if (!fs.existsSync(rawDataDir)) {
    fs.mkdirSync(rawDataDir, { recursive: true });
  }
  const filePath = path.join(rawDataDir, `${id}.txt`);
  console.log('[DEBUG /api/uploads/:id/raw] Attempting to write file to:', filePath);
  try {
    await pool.query('UPDATE uploads SET raw_data = $1 WHERE id = $2', [raw_data, id]);
    // Save raw data to file
    fs.writeFile(filePath, raw_data, (fileErr) => {
      if (fileErr) {
        console.log('[DEBUG /api/uploads/:id/raw] Failed to write raw data file:', fileErr.message);
        console.log('[DEBUG /api/uploads/:id/raw] Tried to write to:', filePath);
        return res.status(500).json({ success: false, error: 'Failed to write raw data file', details: fileErr.message });
      }
      console.log('[DEBUG /api/uploads/:id/raw] Successfully updated uploads table and wrote file for id:', id);
      console.log('[DEBUG /api/uploads/:id/raw] File written to:', filePath);
      res.json({ success: true });
    });
  } catch (err) {
    console.log('[DEBUG /api/uploads/:id/raw] Failed to update uploads table:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to update uploads table', details: err.message });
  }
});

    // Start server only after DB is ready
    // =========================
    // Debug/Utility Endpoints
    // =========================
    // DEBUG: Dump all rows from ingredients_inventory
    app.get('/api/debug/ingredients-inventory', (req, res) => {
      db.all('SELECT * FROM ingredients_inventory', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
      });
    });


// =========================
// RawDataTXT HTML Preview Route
// =========================

// Serve raw HTML file as text/plain (no preview wrapper)
app.get('/RawDataTXT/:file', (req, res, next) => {
  const fileName = req.params.file;
  const filePath = path.join(__dirname, 'public', 'RawDataTXT', fileName);
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) return next(); // Pass to 404 handler if not found
    res.type('text/plain').send(data);
  });
});


// Serve static files from backend/public
app.use('/SavedPDFs', express.static(path.join(__dirname, 'SavedPDFs')));
app.use(express.static(path.join(__dirname, 'public')));

// 404 Handler (should be last middleware)
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});


// Catch-all logger for unhandled requests (for debugging routing issues)
app.use((req, res, next) => {
  console.log('[UNHANDLED REQUEST]', req.method, req.originalUrl);
  next();
});

// =========================
// Start Server
// =========================

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  logSuggestionMailerHealthCheck().catch((err) => {
    console.error('[SUGGESTIONS] SMTP health check error:', err.message);
  });
});

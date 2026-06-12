'use strict';

const express = require('express');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const pool = require('../db');

const router = express.Router();

let schemaReady = false;

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getSiteUrl() {
  return String(process.env.SITE_URL || process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || 'https://recipe-calculator-backend.onrender.com').replace(/\/$/, '');
}

function getFromAddress() {
  return String(process.env.DIGEST_EMAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER || '').trim();
}

function createMailer() {
  const host = String(process.env.SMTP_HOST || '').trim();
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || '').trim();
  if (!host || !user || !pass) return null;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || '').trim() === '1';
  return nodemailer.createTransport({
    host,
    port,
    secure,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    auth: { user, pass }
  });
}

async function verifyMailer(mailer, timeoutMs) {
  if (!mailer) {
    return { smtpReady: false, smtpError: 'SMTP settings are incomplete.' };
  }

  const timeout = Math.max(1000, Number(timeoutMs || 12000));
  const verifyPromise = mailer.verify();
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('SMTP verification timed out.')), timeout);
  });

  try {
    await Promise.race([verifyPromise, timeoutPromise]);
    return { smtpReady: true, smtpError: '' };
  } catch (err) {
    return { smtpReady: false, smtpError: err && err.message ? err.message : 'SMTP verification failed.' };
  }
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

function getRequestEmail(req) {
  return normalizeEmail(
    (req && req.authUserEmail) ||
    (req && req.authUser && req.authUser.email) ||
    (req && req.headers && (req.headers['x-user-email'] || req.headers['x-staff-email'])) ||
    ''
  );
}

function isAdminRequest(req) {
  const email = getRequestEmail(req);
  return Boolean(email && getBootstrapAdminEmails().has(email));
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function randomToken() {
  return crypto.randomBytes(32).toString('hex');
}

function parseItemsFromState(state) {
  const parsed = state && typeof state === 'object' ? state : {};
  const columns = Array.isArray(parsed.columns) ? parsed.columns : [];
  const out = [];
  for (const col of columns) {
    const categories = Array.isArray(col) ? col : [];
    for (const category of categories) {
      const sections = Array.isArray(category && category.sections) ? category.sections : [];
      for (const section of sections) {
        const items = Array.isArray(section && section.items) ? section.items : [];
        for (const item of items) {
          const clean = String(item || '').trim();
          if (clean) out.push(clean);
        }
      }
    }
  }
  return out;
}

function parseAddedItemsText(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => String(line || '').trim())
    .filter(Boolean);
}

function ensureCategoryAndSection(parsedState) {
  const next = parsedState && typeof parsedState === 'object' ? parsedState : {};
  if (!Array.isArray(next.columns)) next.columns = [[], []];
  if (!Array.isArray(next.columns[0])) next.columns[0] = [];
  if (!Array.isArray(next.columns[1])) next.columns[1] = [];

  if (!next.columns[0].length) {
    next.columns[0].push({ name: 'Additional Items', sections: [] });
  }

  if (!next.columns[0][0] || typeof next.columns[0][0] !== 'object') {
    next.columns[0][0] = { name: 'Additional Items', sections: [] };
  }

  if (!Array.isArray(next.columns[0][0].sections)) next.columns[0][0].sections = [];
  if (!next.columns[0][0].sections.length) {
    next.columns[0][0].sections.push({ label: 'General', sublabel: 'Email additions', items: [] });
  }

  if (!next.columns[0][0].sections[0] || typeof next.columns[0][0].sections[0] !== 'object') {
    next.columns[0][0].sections[0] = { label: 'General', sublabel: 'Email additions', items: [] };
  }
  if (!Array.isArray(next.columns[0][0].sections[0].items)) next.columns[0][0].sections[0].items = [];

  return next;
}

function mergeEmailAdditionsIntoState(parsedState, addedItems, note) {
  const state = ensureCategoryAndSection(parsedState);
  const existing = new Set(parseItemsFromState(state).map((item) => item.toLowerCase()));

  for (const raw of Array.isArray(addedItems) ? addedItems : []) {
    const item = String(raw || '').trim();
    if (!item) continue;
    const key = item.toLowerCase();
    if (existing.has(key)) continue;
    state.columns[0][0].sections[0].items.push(item);
    existing.add(key);
  }

  if (note && String(note).trim()) {
    if (!Array.isArray(state.email_review_notes)) state.email_review_notes = [];
    state.email_review_notes.push({
      added_at: new Date().toISOString(),
      note: String(note).trim()
    });
  }

  return state;
}

function buildShoppingReviewEmailHtml(payload) {
  const safeTitle = esc(payload.title || 'Shopping List');
  const safeWeekInfo = esc(payload.weekInfo || 'Upcoming week');
  const approveLink = payload.approveLink;
  const requestChangesLink = payload.requestChangesLink;
  const token = payload.token;
  const previewItems = Array.isArray(payload.previewItems) ? payload.previewItems.slice(0, 24) : [];

  const itemsHtml = previewItems.length
    ? previewItems.map((item) => `<li style="margin-bottom:4px;">${esc(item)}</li>`).join('')
    : '<li>No items found in this saved shopping list yet.</li>';

  return `
    <div style="font-family:Arial,sans-serif;max-width:760px;margin:0 auto;color:#1f2937;line-height:1.45;">
      <h2 style="margin:0 0 8px;">Weekly Shopping Review</h2>
      <p style="margin:0 0 12px;">Please review and confirm this shopping list for <strong>${safeWeekInfo}</strong>.</p>

      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin:0 0 14px;">
        <div style="font-weight:700;margin:0 0 6px;">${safeTitle}</div>
        <div style="font-size:13px;color:#475569;">Week Info: ${safeWeekInfo}</div>
      </div>

      <div style="margin:0 0 12px;">
        <a href="${approveLink}" style="display:inline-block;background:#166534;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;font-weight:700;margin-right:8px;">Approve</a>
        <a href="${requestChangesLink}" style="display:inline-block;background:#b45309;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;font-weight:700;">Request Changes</a>
      </div>

      <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin:0 0 16px;">
        <div style="font-size:14px;font-weight:700;margin:0 0 8px;">Current Known Items (sample)</div>
        <ul style="margin:0;padding-left:18px;font-size:13px;">${itemsHtml}</ul>
      </div>

      <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:12px 14px;">
        <div style="font-size:14px;font-weight:700;margin:0 0 8px;">Add Items / Notes</div>
        <p style="margin:0 0 8px;font-size:12px;color:#7c2d12;">Email clients vary. If the form is blocked, use the Request Changes link above.</p>
        <form method="POST" action="${payload.respondPostUrl}">
          <input type="hidden" name="token" value="${esc(token)}">
          <input type="hidden" name="action" value="request_changes">
          <label style="display:block;font-size:12px;font-weight:700;margin:0 0 4px;">Add items (one per line)</label>
          <textarea name="add_items" rows="5" style="width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-family:Arial,sans-serif;font-size:12px;margin-bottom:8px;"></textarea>
          <label style="display:block;font-size:12px;font-weight:700;margin:0 0 4px;">Change notes</label>
          <textarea name="change_notes" rows="4" style="width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-family:Arial,sans-serif;font-size:12px;margin-bottom:10px;"></textarea>
          <button type="submit" style="background:#b45309;color:#fff;border:none;border-radius:7px;padding:9px 12px;font-size:12px;font-weight:700;cursor:pointer;">Submit Changes</button>
        </form>
      </div>
    </div>
  `;
}

function buildRespondResultHtml(title, message, type) {
  const colour = type === 'ok' ? '#166534' : '#b91c1c';
  return `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:36px auto;padding:18px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;">
      <h2 style="margin:0 0 8px;">${esc(title)}</h2>
      <p style="margin:0;color:${colour};">${esc(message)}</p>
    </div>
  `;
}

router.get('/status', async (req, res) => {
  if (!isAdminRequest(req)) {
    return res.status(403).json({ success: false, error: 'Admin access required.' });
  }

  try {
    await ensureSchema();
    const fromAddress = getFromAddress();
    const mailerStatus = await verifyMailer(createMailer(), 12000);
    return res.json({
      success: true,
      smtpReady: Boolean(fromAddress) && Boolean(mailerStatus.smtpReady),
      smtpError: fromAddress ? String(mailerStatus.smtpError || '') : 'Email sender is not configured (SMTP_FROM/SMTP_USER).',
      fromAddress: fromAddress || '',
      testRecipient: normalizeEmail(process.env.SHOPPING_REVIEW_TEST_RECIPIENT || 'vanessapringle@westlandhigh.school.nz')
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Unable to load shopping review email status.' });
  }
});

async function ensureSchema() {
  if (schemaReady) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS shopping_email_review_requests (
      id SERIAL PRIMARY KEY,
      saved_list_id INTEGER NOT NULL REFERENCES saved_shopping_lists(id) ON DELETE CASCADE,
      recipient_email TEXT NOT NULL,
      recipient_name TEXT NOT NULL DEFAULT 'Lead Teacher',
      token_hash TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'sent',
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      completed_at TIMESTAMPTZ,
      latest_action TEXT,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS shopping_email_review_responses (
      id SERIAL PRIMARY KEY,
      request_id INTEGER NOT NULL REFERENCES shopping_email_review_requests(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      add_items_text TEXT NOT NULL DEFAULT '',
      change_notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      source_ip TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT ''
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS shopping_email_review_schedules (
      id SERIAL PRIMARY KEY,
      saved_list_id INTEGER NOT NULL REFERENCES saved_shopping_lists(id) ON DELETE CASCADE,
      recipient_email TEXT NOT NULL,
      trigger_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_by_email TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sent_at TIMESTAMPTZ,
      request_id INTEGER REFERENCES shopping_email_review_requests(id) ON DELETE SET NULL,
      last_error TEXT NOT NULL DEFAULT ''
    )
  `);

  await pool.query('CREATE INDEX IF NOT EXISTS shopping_email_review_requests_status_idx ON shopping_email_review_requests(status, expires_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS shopping_email_review_responses_request_idx ON shopping_email_review_responses(request_id, created_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS shopping_email_review_schedules_status_idx ON shopping_email_review_schedules(status, trigger_at ASC)');

  schemaReady = true;
}

async function resolveSavedList(savedListId) {
  if (Number.isInteger(savedListId) && savedListId > 0) {
    const byId = await pool.query(
      `SELECT id, title, week_info, parsed_state
       FROM saved_shopping_lists
       WHERE id = $1
       LIMIT 1`,
      [savedListId]
    );
    if (byId.rowCount) return byId.rows[0];
  }

  const latest = await pool.query(
    `SELECT id, title, week_info, parsed_state
     FROM saved_shopping_lists
     ORDER BY updated_at DESC, id DESC
     LIMIT 1`
  );
  return latest.rowCount ? latest.rows[0] : null;
}

async function sendShoppingReviewEmail(options = {}) {
  await ensureSchema();

  const forcedRecipient = normalizeEmail(process.env.SHOPPING_REVIEW_TEST_RECIPIENT || 'vanessapringle@westlandhigh.school.nz');
  const requestedRecipient = normalizeEmail(options.recipientEmail);
  const recipientEmail = requestedRecipient || forcedRecipient;
  if (recipientEmail !== forcedRecipient) {
    throw new Error(`Test emails are locked to ${forcedRecipient}.`);
  }

  const list = await resolveSavedList(Number(options.savedListId));
  if (!list) {
    throw new Error('No saved shopping list found. Upload and save one first.');
  }

  const token = randomToken();
  const tokenHash = hashToken(token);
  const triggerEmail = normalizeEmail(options.triggerEmail);
  const triggerSource = String(options.triggerSource || 'manual').trim();

  const requestInsert = await pool.query(
    `INSERT INTO shopping_email_review_requests (
       saved_list_id, recipient_email, recipient_name, token_hash, status, expires_at, payload
     ) VALUES ($1, $2, $3, $4, 'sent', NOW() + INTERVAL '7 days', $5::jsonb)
     RETURNING id`,
    [
      list.id,
      recipientEmail,
      'Vanessa',
      tokenHash,
      JSON.stringify({
        trigger_email: triggerEmail,
        trigger_source: triggerSource,
        created_at: new Date().toISOString()
      })
    ]
  );

  const requestId = Number(requestInsert.rows[0].id);
  const siteUrl = getSiteUrl();
  const approveLink = `${siteUrl}/api/shopping-workflow-email/respond?action=approve&token=${encodeURIComponent(token)}`;
  const requestChangesLink = `${siteUrl}/api/shopping-workflow-email/review-form?token=${encodeURIComponent(token)}`;
  const respondPostUrl = `${siteUrl}/api/shopping-workflow-email/respond`;

  const previewItems = parseItemsFromState(list.parsed_state || {});
  const html = buildShoppingReviewEmailHtml({
    title: list.title,
    weekInfo: list.week_info,
    approveLink,
    requestChangesLink,
    respondPostUrl,
    token,
    previewItems
  });

  const from = getFromAddress();
  if (!from) {
    throw new Error('Email sender is not configured (SMTP_FROM/SMTP_USER).');
  }

  const mailer = createMailer();
  if (!mailer) {
    throw new Error('SMTP is not configured.');
  }

  await mailer.sendMail({
    from,
    to: recipientEmail,
    subject: `Shopping List Review: ${String(list.title || 'Weekly Shopping List')}`,
    html
  });

  return {
    requestId,
    recipientEmail,
    savedListId: list.id,
    approveLink,
    requestChangesLink
  };
}

async function findRequestByToken(rawToken) {
  const token = String(rawToken || '').trim();
  if (!token) return null;

  const tokenHash = hashToken(token);
  const result = await pool.query(
    `SELECT req.id, req.saved_list_id, req.recipient_email, req.recipient_name, req.status, req.expires_at, req.completed_at,
            list.title, list.week_info, list.parsed_state
       FROM shopping_email_review_requests req
       JOIN saved_shopping_lists list ON list.id = req.saved_list_id
      WHERE req.token_hash = $1
      LIMIT 1`,
    [tokenHash]
  );

  if (!result.rowCount) return null;
  return result.rows[0];
}

async function recordResponseAndApplyChanges(requestRow, action, addItemsText, changeNotes, reqMeta) {
  const requestId = Number(requestRow.id);
  const cleanAction = String(action || '').trim().toLowerCase() === 'approve' ? 'approve' : 'request_changes';
  const cleanAddText = String(addItemsText || '').trim();
  const cleanNotes = String(changeNotes || '').trim();

  await pool.query(
    `INSERT INTO shopping_email_review_responses (request_id, action, add_items_text, change_notes, source_ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [requestId, cleanAction, cleanAddText, cleanNotes, String(reqMeta.ip || ''), String(reqMeta.userAgent || '')]
  );

  const addedItems = parseAddedItemsText(cleanAddText);
  if (cleanAction === 'request_changes' || addedItems.length || cleanNotes) {
    const nextParsedState = mergeEmailAdditionsIntoState(
      requestRow.parsed_state && typeof requestRow.parsed_state === 'object' ? requestRow.parsed_state : {},
      addedItems,
      cleanNotes
    );

    await pool.query(
      `UPDATE saved_shopping_lists
          SET parsed_state = $2::jsonb,
              updated_at = NOW()
        WHERE id = $1`,
      [requestRow.saved_list_id, JSON.stringify(nextParsedState)]
    );
  }

  const nextStatus = cleanAction === 'approve' ? 'approved' : 'changes_requested';
  await pool.query(
    `UPDATE shopping_email_review_requests
        SET status = $2,
            latest_action = $3,
            completed_at = NOW()
      WHERE id = $1`,
    [requestId, nextStatus, cleanAction]
  );

  return { action: cleanAction, status: nextStatus, addedItemsCount: addedItems.length };
}

router.post('/send-test', async (req, res) => {
  if (!isAdminRequest(req)) {
    return res.status(403).json({ success: false, error: 'Admin access required.' });
  }

  try {
    const sent = await sendShoppingReviewEmail({
      savedListId: Number(req.body && req.body.savedListId),
      recipientEmail: req.body && req.body.recipientEmail,
      triggerEmail: getRequestEmail(req),
      triggerSource: 'manual_api'
    });
    return res.json(Object.assign({ success: true }, sent));
  } catch (err) {
    const status = /not configured|locked/i.test(String(err && err.message || '')) ? 503 : 500;
    return res.status(status).json({ success: false, error: err.message || 'Failed to send shopping review email.' });
  }
});

router.get('/schedules', async (req, res) => {
  if (!isAdminRequest(req)) {
    return res.status(403).json({ success: false, error: 'Admin access required.' });
  }

  try {
    await ensureSchema();
    const result = await pool.query(
      `SELECT s.id, s.saved_list_id, s.recipient_email, s.trigger_at, s.status,
              s.created_by_email, s.created_at, s.updated_at, s.sent_at, s.last_error,
              l.title, l.week_info
       FROM shopping_email_review_schedules s
       LEFT JOIN saved_shopping_lists l ON l.id = s.saved_list_id
       ORDER BY s.trigger_at DESC, s.id DESC
       LIMIT 100`
    );
    return res.json({ success: true, schedules: result.rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Unable to load schedules.' });
  }
});

router.post('/schedules', async (req, res) => {
  if (!isAdminRequest(req)) {
    return res.status(403).json({ success: false, error: 'Admin access required.' });
  }

  try {
    await ensureSchema();

    const forcedRecipient = normalizeEmail(process.env.SHOPPING_REVIEW_TEST_RECIPIENT || 'vanessapringle@westlandhigh.school.nz');
    const savedListId = Number(req.body && req.body.savedListId);
    const triggerAtRaw = String(req.body && req.body.triggerAt || '').trim();
    const triggerDate = new Date(triggerAtRaw);

    if (!Number.isInteger(savedListId) || savedListId <= 0) {
      return res.status(400).json({ success: false, error: 'savedListId is required.' });
    }

    if (!triggerAtRaw || Number.isNaN(triggerDate.getTime())) {
      return res.status(400).json({ success: false, error: 'A valid triggerAt date/time is required.' });
    }

    if (triggerDate.getTime() <= Date.now() + 30000) {
      return res.status(400).json({ success: false, error: 'Trigger time must be at least 30 seconds in the future.' });
    }

    const list = await resolveSavedList(savedListId);
    if (!list) {
      return res.status(404).json({ success: false, error: 'Saved shopping list not found.' });
    }

    const insert = await pool.query(
      `INSERT INTO shopping_email_review_schedules (
         saved_list_id, recipient_email, trigger_at, status, created_by_email
       ) VALUES ($1, $2, $3::timestamptz, 'pending', $4)
       RETURNING id, saved_list_id, recipient_email, trigger_at, status, created_by_email, created_at`,
      [savedListId, forcedRecipient, triggerAtRaw, getRequestEmail(req)]
    );

    return res.status(201).json({ success: true, schedule: insert.rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Unable to create schedule.' });
  }
});

router.post('/schedules/:id/cancel', async (req, res) => {
  if (!isAdminRequest(req)) {
    return res.status(403).json({ success: false, error: 'Admin access required.' });
  }

  try {
    await ensureSchema();
    const scheduleId = Number(req.params.id);
    if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
      return res.status(400).json({ success: false, error: 'Valid schedule id is required.' });
    }

    const update = await pool.query(
      `UPDATE shopping_email_review_schedules
          SET status = 'cancelled', updated_at = NOW()
        WHERE id = $1 AND status = 'pending'
        RETURNING id, status, updated_at`,
      [scheduleId]
    );

    if (!update.rowCount) {
      return res.status(404).json({ success: false, error: 'Pending schedule not found.' });
    }

    return res.json({ success: true, schedule: update.rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Unable to cancel schedule.' });
  }
});

router.post('/schedules/:id/run-now', async (req, res) => {
  if (!isAdminRequest(req)) {
    return res.status(403).json({ success: false, error: 'Admin access required.' });
  }

  try {
    await ensureSchema();
    const scheduleId = Number(req.params.id);
    if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
      return res.status(400).json({ success: false, error: 'Valid schedule id is required.' });
    }

    const lookup = await pool.query(
      `SELECT * FROM shopping_email_review_schedules WHERE id = $1 LIMIT 1`,
      [scheduleId]
    );
    if (!lookup.rowCount) {
      return res.status(404).json({ success: false, error: 'Schedule not found.' });
    }

    const row = lookup.rows[0];
    if (String(row.status || '').toLowerCase() !== 'pending') {
      return res.status(400).json({ success: false, error: 'Only pending schedules can run now.' });
    }

    const sent = await sendShoppingReviewEmail({
      savedListId: Number(row.saved_list_id),
      recipientEmail: row.recipient_email,
      triggerEmail: getRequestEmail(req),
      triggerSource: 'schedule_run_now'
    });

    await pool.query(
      `UPDATE shopping_email_review_schedules
          SET status = 'sent', sent_at = NOW(), updated_at = NOW(), request_id = $2, last_error = ''
        WHERE id = $1`,
      [scheduleId, sent.requestId]
    );

    return res.json({ success: true, scheduleId, sent });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Unable to run schedule now.' });
  }
});

async function processDueSchedules(limit = 5) {
  await ensureSchema();

  const dueResult = await pool.query(
    `SELECT *
     FROM shopping_email_review_schedules
     WHERE status = 'pending'
       AND trigger_at <= NOW()
     ORDER BY trigger_at ASC, id ASC
     LIMIT $1`,
    [Math.max(1, Number(limit) || 5)]
  );

  let processed = 0;
  for (const row of dueResult.rows) {
    try {
      const sent = await sendShoppingReviewEmail({
        savedListId: Number(row.saved_list_id),
        recipientEmail: row.recipient_email,
        triggerEmail: row.created_by_email,
        triggerSource: 'scheduled'
      });

      await pool.query(
        `UPDATE shopping_email_review_schedules
            SET status = 'sent', sent_at = NOW(), updated_at = NOW(), request_id = $2, last_error = ''
          WHERE id = $1`,
        [row.id, sent.requestId]
      );
      processed += 1;
    } catch (err) {
      await pool.query(
        `UPDATE shopping_email_review_schedules
            SET status = 'failed', updated_at = NOW(), last_error = $2
          WHERE id = $1`,
        [row.id, String(err && err.message || 'Unknown schedule send error')]
      );
    }
  }

  return processed;
}

router.get('/review-form', async (req, res) => {
  try {
    await ensureSchema();
    const token = String(req.query && req.query.token || '').trim();
    const requestRow = await findRequestByToken(token);
    if (!requestRow) {
      return res.status(404).send(buildRespondResultHtml('Review Link Invalid', 'This review link is invalid or no longer exists.', 'error'));
    }

    if (new Date(requestRow.expires_at).getTime() < Date.now()) {
      return res.status(410).send(buildRespondResultHtml('Review Link Expired', 'This review link has expired. Please request a new review email.', 'error'));
    }

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:760px;margin:24px auto;padding:14px;border:1px solid #e2e8f0;border-radius:10px;">
        <h2 style="margin:0 0 8px;">Shopping Review Form</h2>
        <p style="margin:0 0 8px;"><strong>List:</strong> ${esc(requestRow.title || 'Shopping List')}</p>
        <p style="margin:0 0 14px;"><strong>Week:</strong> ${esc(requestRow.week_info || 'Upcoming week')}</p>
        <form method="POST" action="/api/shopping-workflow-email/respond">
          <input type="hidden" name="token" value="${esc(token)}">
          <div style="margin-bottom:10px;">
            <label style="display:block;font-weight:700;font-size:13px;margin-bottom:4px;">Add items (one per line)</label>
            <textarea name="add_items" rows="8" style="width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:7px;padding:8px;"></textarea>
          </div>
          <div style="margin-bottom:12px;">
            <label style="display:block;font-weight:700;font-size:13px;margin-bottom:4px;">Change notes</label>
            <textarea name="change_notes" rows="5" style="width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:7px;padding:8px;"></textarea>
          </div>
          <button type="submit" name="action" value="request_changes" style="background:#b45309;color:#fff;border:none;border-radius:7px;padding:9px 12px;font-weight:700;cursor:pointer;margin-right:8px;">Submit Changes</button>
          <button type="submit" name="action" value="approve" style="background:#166534;color:#fff;border:none;border-radius:7px;padding:9px 12px;font-weight:700;cursor:pointer;">Approve</button>
        </form>
      </div>
    `;

    return res.status(200).send(html);
  } catch (err) {
    return res.status(500).send(buildRespondResultHtml('Review Error', err.message || 'Unable to load review form.', 'error'));
  }
});

router.all('/respond', async (req, res) => {
  try {
    await ensureSchema();
    const token = String((req.body && req.body.token) || (req.query && req.query.token) || '').trim();
    const action = String((req.body && req.body.action) || (req.query && req.query.action) || '').trim();
    const addItemsText = String((req.body && req.body.add_items) || (req.query && req.query.add_items) || '').trim();
    const changeNotes = String((req.body && req.body.change_notes) || (req.query && req.query.change_notes) || '').trim();

    const requestRow = await findRequestByToken(token);
    if (!requestRow) {
      return res.status(404).send(buildRespondResultHtml('Review Link Invalid', 'This review link is invalid or no longer exists.', 'error'));
    }

    if (new Date(requestRow.expires_at).getTime() < Date.now()) {
      return res.status(410).send(buildRespondResultHtml('Review Link Expired', 'This review link has expired. Please request a new review email.', 'error'));
    }

    if (String(requestRow.status || '').toLowerCase() === 'approved') {
      return res.status(200).send(buildRespondResultHtml('Already Approved', 'This shopping list has already been approved.', 'ok'));
    }

    const applyResult = await recordResponseAndApplyChanges(requestRow, action, addItemsText, changeNotes, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] || ''
    });

    if (applyResult.action === 'approve') {
      return res.status(200).send(buildRespondResultHtml('Approved', 'Thank you. The shopping list is now marked as approved.', 'ok'));
    }

    return res.status(200).send(buildRespondResultHtml(
      'Changes Saved',
      `Thanks. Your changes were saved to the shopping list (${applyResult.addedItemsCount} new item${applyResult.addedItemsCount === 1 ? '' : 's'} added).`,
      'ok'
    ));
  } catch (err) {
    return res.status(500).send(buildRespondResultHtml('Review Error', err.message || 'Unable to process review response.', 'error'));
  }
});

module.exports = router;
module.exports.processDueSchedules = processDueSchedules;

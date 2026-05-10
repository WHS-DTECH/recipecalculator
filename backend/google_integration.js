const { google } = require('googleapis');
const cron = require('node-cron');
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const pool = require('./db');

// Load client secrets from a local file
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');

let oAuth2Client;
let configuredRedirectUri = '';
let plannerSyncTask = null;

function readJsonFile(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadGoogleCredentials() {
    const raw = String(process.env.GOOGLE_CREDENTIALS || '').trim();
    if (raw) {
        return JSON.parse(raw);
    }
    return readJsonFile(CREDENTIALS_PATH);
}

function loadStoredToken() {
    const envToken = String(process.env.GOOGLE_TOKEN_JSON || '').trim();
    if (envToken) {
        return JSON.parse(envToken);
    }
    if (fs.existsSync(TOKEN_PATH)) {
        return readJsonFile(TOKEN_PATH);
    }
    return null;
}

function getRedirectUriFromEnvOrRuntime(configRedirectUris = []) {
    const explicit = String(process.env.GOOGLE_OAUTH_REDIRECT_URI || '').trim();
    if (explicit) {
        return explicit;
    }

    const renderBase = String(process.env.RENDER_EXTERNAL_URL || '').trim().replace(/\/$/, '');
    if (renderBase) {
        return `${renderBase}/google/oauth2callback`;
    }

    return Array.isArray(configRedirectUris) ? String(configRedirectUris[0] || '').trim() : '';
}

async function ensureGooglePlannerSyncSchema() {
    await pool.query("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS source_document_id TEXT");
    await pool.query("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS source_document_title TEXT");
    await pool.query("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS source_document_revision_id TEXT");
    await pool.query("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS source_document_synced_at TIMESTAMPTZ");
}

function getConfiguredPlannerDocIds() {
    const raw = String(process.env.GOOGLE_PLANNER_DOC_IDS || '').trim();
    if (!raw) {
        return [];
    }
    return raw
        .split(',')
        .map((entry) => String(entry || '').trim())
        .filter(Boolean);
}

function normalizeHeaderKey(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
}

function extractTextFromStructuralElement(element) {
    if (!element) {
        return '';
    }
    if (element.paragraph && Array.isArray(element.paragraph.elements)) {
        return element.paragraph.elements
            .map((part) => String(part && part.textRun && part.textRun.content ? part.textRun.content : ''))
            .join('')
            .replace(/\s+/g, ' ')
            .trim();
    }
    if (element.table) {
        return element.table.tableRows
            .map((row) => row.tableCells.map((cell) => extractTextFromStructuralElement(cell)).join(' | '))
            .join('\n');
    }
    if (element.tableCell && Array.isArray(element.tableCell.content)) {
        return element.tableCell.content
            .map((child) => extractTextFromStructuralElement(child))
            .filter(Boolean)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
    }
    if (element.tableRow && Array.isArray(element.tableRow.tableCells)) {
        return element.tableRow.tableCells
            .map((cell) => extractTextFromStructuralElement(cell))
            .join(' | ');
    }
    if (Array.isArray(element.content)) {
        return element.content
            .map((child) => extractTextFromStructuralElement(child))
            .filter(Boolean)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
    }
    return '';
}

function parseGooglePlannerDate(value) {
    const text = String(value || '').trim();
    if (!text) {
        return '';
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        return text;
    }

    const slashMatch = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
    if (slashMatch) {
        const day = String(slashMatch[1]).padStart(2, '0');
        const month = String(slashMatch[2]).padStart(2, '0');
        let year = String(slashMatch[3]);
        if (year.length === 2) {
            year = Number(year) < 70 ? `20${year}` : `19${year}`;
        }
        return `${year}-${month}-${day}`;
    }

    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) {
        const year = parsed.getFullYear();
        const month = String(parsed.getMonth() + 1).padStart(2, '0');
        const day = String(parsed.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    return '';
}

function inferPlannerStreamFromText(value) {
    const text = String(value || '').trim().toUpperCase();
    if (!text) {
        return 'Middle';
    }
    if (text.includes('HOSP')) {
        return 'Senior';
    }
    if (text.includes('JFOOD') || text.includes('VEFOOD') || text.includes('MMFOOD') || text.includes('SDFOOD') || text.includes('PIFOOD') || text.includes('SRFOOD') || text.includes('MFOOD')) {
        return text.includes('MFOOD') ? 'Middle' : 'Junior';
    }
    return 'Middle';
}

function parseNumericValue(value) {
    const text = String(value || '').trim();
    if (!text) {
        return null;
    }
    const parsed = Number(text.replace(/[^0-9.]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
}

function parsePlannerRowsFromDocument(document, documentId) {
    const rows = [];
    const content = document && document.body && Array.isArray(document.body.content)
        ? document.body.content
        : [];

    const tables = content.filter((part) => part && part.table);
    for (const tableBlock of tables) {
        const table = tableBlock.table;
        const tableRows = Array.isArray(table && table.tableRows) ? table.tableRows : [];
        if (!tableRows.length) {
            continue;
        }

        const rowValues = tableRows.map((tableRow) => {
            const cells = Array.isArray(tableRow.tableCells) ? tableRow.tableCells : [];
            return cells.map((cell) => extractTextFromStructuralElement(cell)).map((text) => String(text || '').trim());
        });

        const headers = rowValues[0] || [];
        const headerIndex = new Map();
        headers.forEach((header, index) => {
            const key = normalizeHeaderKey(header);
            if (key && !headerIndex.has(key)) {
                headerIndex.set(key, index);
            }
        });

        const getValue = (row, keys) => {
            for (const key of keys) {
                const idx = headerIndex.get(key);
                if (idx != null && row[idx] != null && String(row[idx]).trim()) {
                    return String(row[idx]).trim();
                }
            }
            return '';
        };

        for (const row of rowValues.slice(1)) {
            const bookingDate = parseGooglePlannerDate(getValue(row, ['bookingdate', 'date', 'day', 'weekdate']));
            const className = getValue(row, ['classname', 'class', 'classcode', 'code', 'subject']);
            const recipe = getValue(row, ['recipe', 'meal', 'dish', 'activity']);
            const recipeUrl = getValue(row, ['recipeurl', 'url', 'link']);
            const recipeId = parseNumericValue(getValue(row, ['recipeid', 'id']));
            const classSize = parseNumericValue(getValue(row, ['classsize', 'size', 'roll', 'students']));
            const plannerStream = getValue(row, ['plannerstream', 'stream']) || inferPlannerStreamFromText(className);
            const period = getValue(row, ['period']) || 'Planner';
            const staffId = getValue(row, ['staffid', 'teacherid', 'staffcode']);
            const staffName = getValue(row, ['staffname', 'teacher', 'teachername']);

            if (!bookingDate || !className || !recipe) {
                continue;
            }

            rows.push({
                staff_id: staffId,
                staff_name: staffName,
                class_name: className,
                booking_date: bookingDate,
                period,
                recipe,
                recipe_url: recipeUrl,
                recipe_id: recipeId,
                class_size: classSize,
                planner_stream: plannerStream,
                source_document_id: documentId,
                source_document_title: String(document && document.title ? document.title : '').trim(),
                source_document_revision_id: String(document && document.revisionId ? document.revisionId : '').trim()
            });
        }
    }

    return rows;
}

async function syncPlannerDocument(documentId) {
    if (!oAuth2Client) {
        throw new Error('Google client is not initialized.');
    }

    const docs = google.docs({ version: 'v1', auth: oAuth2Client });
    const response = await docs.documents.get({ documentId });
    const document = response && response.data ? response.data : response;
    const parsedRows = parsePlannerRowsFromDocument(document, documentId);

    if (!parsedRows.length) {
        return {
            documentId,
            title: String(document && document.title ? document.title : '').trim(),
            parsedRows: 0,
            inserted: 0,
            skipped: true,
            reason: 'No planner rows were parsed from the document.'
        };
    }

    await ensureGooglePlannerSyncSchema();
    await pool.query(
        "DELETE FROM bookings WHERE period = 'Planner' AND coalesce(source_document_id, '') = $1",
        [documentId]
    );

    let inserted = 0;
    const seenKeys = new Set();
    for (const row of parsedRows) {
        const dedupeKey = `${row.booking_date}|${row.planner_stream}|${row.class_name}`.toLowerCase();
        if (seenKeys.has(dedupeKey)) {
            continue;
        }
        seenKeys.add(dedupeKey);

        await pool.query(
            `INSERT INTO bookings (
                staff_id, staff_name, class_name, booking_date, period,
                recipe, recipe_url, recipe_id, class_size, planner_stream,
                source_document_id, source_document_title, source_document_revision_id, source_document_synced_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())`,
            [
                row.staff_id || null,
                row.staff_name || null,
                row.class_name,
                row.booking_date,
                row.period || 'Planner',
                row.recipe,
                row.recipe_url || '',
                row.recipe_id || null,
                row.class_size || null,
                row.planner_stream || 'Middle',
                row.source_document_id,
                row.source_document_title || null,
                row.source_document_revision_id || null
            ]
        );
        inserted += 1;
    }

    return {
        documentId,
        title: String(document && document.title ? document.title : '').trim(),
        parsedRows: parsedRows.length,
        inserted
    };
}

async function syncConfiguredPlannerDocs() {
    const documentIds = getConfiguredPlannerDocIds();
    if (!documentIds.length) {
        return { success: true, synced: [], skipped: true, reason: 'No planner document IDs configured.' };
    }

    const synced = [];
    for (const documentId of documentIds) {
        const result = await syncPlannerDocument(documentId);
        synced.push(result);
    }

    return { success: true, synced, skipped: false };
}

function startPlannerSyncScheduler() {
    if (plannerSyncTask) {
        return;
    }

    const cronExpression = String(process.env.GOOGLE_PLANNER_SYNC_CRON || '*/15 * * * *').trim();
    const documentIds = getConfiguredPlannerDocIds();
    if (!documentIds.length || !cron.validate(cronExpression)) {
        return;
    }

    plannerSyncTask = cron.schedule(cronExpression, () => {
        syncConfiguredPlannerDocs().catch((err) => {
            console.error('[Google Planner Sync] Scheduled sync failed:', err.message);
        });
    }, {
        timezone: String(process.env.GOOGLE_PLANNER_SYNC_TIMEZONE || 'Pacific/Auckland').trim()
    });

    console.log(`[Google Planner Sync] Scheduled sync started (${cronExpression}) for ${documentIds.length} document(s).`);
}

function getPlannerSyncConfigSummary() {
    const cronExpression = String(process.env.GOOGLE_PLANNER_SYNC_CRON || '*/15 * * * *').trim();
    const timezone = String(process.env.GOOGLE_PLANNER_SYNC_TIMEZONE || 'Pacific/Auckland').trim();
    const docIds = getConfiguredPlannerDocIds();
    const requiresToken = Boolean(String(process.env.GOOGLE_PLANNER_SYNC_TOKEN || '').trim());

    return {
        configuredDocs: docIds.length,
        cronExpression,
        timezone,
        schedulerActive: Boolean(plannerSyncTask),
        requiresToken
    };
}

// Initialize Google OAuth2 client
async function initializeGoogleClient() {
    const credentials = loadGoogleCredentials();
    const config = credentials.installed || credentials.web;

    if (!config) {
        throw new Error('Google credentials must contain an "installed" or "web" object.');
    }

    const { client_secret, client_id, redirect_uris = [] } = config;
    const redirectUri = getRedirectUriFromEnvOrRuntime(redirect_uris);

    if (!client_id || !client_secret || !redirectUri) {
        throw new Error('Missing Google OAuth values: client_id, client_secret, or redirect URI.');
    }

    console.log('[Google OAuth] Using redirect URI:', redirectUri);

    configuredRedirectUri = redirectUri;
    oAuth2Client = new google.auth.OAuth2(client_id, client_secret, configuredRedirectUri);

    // Check if we have previously stored a token
    const token = loadStoredToken();
    if (token) {
        oAuth2Client.setCredentials(token);
    } else {
        console.log('No token found. Please authenticate with Google.');
    }

    startPlannerSyncScheduler();
}

// Generate authentication URL
router.get('/auth', async (req, res) => {
    if (!oAuth2Client) {
        return res.status(500).json({ error: 'Google client is not initialized.' });
    }

    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        redirect_uri: configuredRedirectUri,
        scope: [
            'https://www.googleapis.com/auth/drive',
            'https://www.googleapis.com/auth/documents'
        ]
    });
    res.redirect(authUrl);
});

// Handle OAuth2 callback
router.get('/oauth2callback', async (req, res) => {
    try {
        if (!oAuth2Client) {
            return res.status(500).json({ error: 'Google client is not initialized.' });
        }

        const code = String(req.query.code || '').trim();
        if (!code) {
            return res.status(400).json({ error: 'Missing OAuth code.' });
        }

        const { tokens } = await oAuth2Client.getToken(code);
        oAuth2Client.setCredentials(tokens);

        // Store the token to disk for later program executions.
        // Render instances can be ephemeral, so GOOGLE_TOKEN_JSON can be used instead.
        try {
            fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
        } catch (err) {
            console.warn('Unable to persist token to disk:', err.message);
        }

        res.send('Authentication successful! You can close this tab.');
    } catch (err) {
        console.error('OAuth callback failed:', err.message);
        res.status(500).json({ error: 'Google OAuth callback failed.' });
    }
});

function isPlannerSyncAuthorized(req) {
    const expectedToken = String(process.env.GOOGLE_PLANNER_SYNC_TOKEN || '').trim();
    if (!expectedToken) {
        return true;
    }

    const providedToken = String(req.get('x-planner-sync-token') || req.query.token || '').trim();
    return providedToken === expectedToken;
}

router.post('/webhook', async (req, res) => {
    try {
        if (!isPlannerSyncAuthorized(req)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const resourceId = String(req.body && req.body.resourceId ? req.body.resourceId : '').trim();
        if (resourceId) {
            const documentIds = getConfiguredPlannerDocIds();
            if (documentIds.includes(resourceId)) {
                const result = await syncPlannerDocument(resourceId);
                return res.status(200).json({ success: true, result });
            }
        }

        const result = await syncConfiguredPlannerDocs();
        res.status(200).json(result);
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/sync-planners', async (req, res) => {
    try {
        if (!isPlannerSyncAuthorized(req)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const result = await syncConfiguredPlannerDocs();
        res.status(200).json(result);
    } catch (error) {
        console.error('Planner sync error:', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/sync-config', async (req, res) => {
    try {
        const summary = getPlannerSyncConfigSummary();
        res.status(200).json({ success: true, ...summary });
    } catch (error) {
        console.error('Planner sync config error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = { initializeGoogleClient, router, syncConfiguredPlannerDocs, syncPlannerDocument };
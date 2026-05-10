const { google } = require('googleapis');
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// Load client secrets from a local file
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');

let oAuth2Client;
let configuredRedirectUri = '';

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

// Webhook to listen for Google Doc updates
router.post('/webhook', async (req, res) => {
    const { resourceId } = req.body;

    // Fetch updated content from Google Docs
    const docs = google.docs({ version: 'v1', auth: oAuth2Client });
    const document = await docs.documents.get({ documentId: resourceId });

    // Process the updated content and update your system
    console.log('Updated content:', document.data);

    res.status(200).send('Webhook received and processed.');
});

module.exports = { initializeGoogleClient, router };
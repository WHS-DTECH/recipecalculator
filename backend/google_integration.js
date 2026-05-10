const { google } = require('googleapis');
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// Load client secrets from a local file
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');

let oAuth2Client;

// Initialize Google OAuth2 client
async function initializeGoogleClient() {
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
    const { client_secret, client_id, redirect_uris } = credentials.installed;
    oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    // Check if we have previously stored a token
    if (fs.existsSync(TOKEN_PATH)) {
        const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
        oAuth2Client.setCredentials(token);
    } else {
        console.log('No token found. Please authenticate with Google.');
    }
}

// Generate authentication URL
router.get('/auth', async (req, res) => {
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: [
            'https://www.googleapis.com/auth/drive',
            'https://www.googleapis.com/auth/documents'
        ]
    });
    res.redirect(authUrl);
});

// Handle OAuth2 callback
router.get('/oauth2callback', async (req, res) => {
    const code = req.query.code;
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);

    // Store the token to disk for later program executions
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
    res.send('Authentication successful! You can close this tab.');
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
// Route: /api/extract-rendered-html?url=...
const express = require('express');
const router = express.Router();
const { execFile } = require('child_process');
const path = require('path');

// GET /api/extract-rendered-html?url=...
router.get('/extract-rendered-html', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'Missing url parameter' });
  // Call the puppeteer script as a child process
  const scriptPath = path.join(__dirname, '../public/extractor_raw_puppeteer.js');
  execFile('node', [scriptPath, url], { timeout: 30000 }, (err, stdout, stderr) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to extract rendered HTML', details: stderr || err.message });
    }
    res.type('text/html').send(stdout);
  });
});

module.exports = router;

const express = require('express');
const router = express.Router();
const pdfParse = require('pdf-parse');

// Months for date parsing (NZ date formats)
const MONTH_MAP = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  january: 0, february: 1, march: 2, april: 3, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11
};

function parseMonthDay(monthStr, dayStr, year) {
  const m = MONTH_MAP[String(monthStr || '').toLowerCase().trim()];
  if (m === undefined) return null;
  const d = parseInt(dayStr, 10);
  if (isNaN(d)) return null;
  const date = new Date(year, m, d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function normalizeRecipeFragment(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function mergeScore(left, right) {
  const a = normalizeRecipeFragment(left);
  const b = normalizeRecipeFragment(right);
  if (!a || !b) return 999;

  let score = 0;

  // Strong continuation signals.
  if (/^\(/.test(b)) score -= 8;
  if (/^[a-z]/.test(b)) score -= 7;
  if (/^[)\]}/.test(b)) score -= 7;
  if (/\($/.test(a)) score -= 7;
  if (/[:;,]$/.test(a)) score -= 6;
  if (/[:;,]$/.test(b)) score -= 3;
  if (a.split(' ').length === 1 && b.split(' ').length === 1 && /^[A-Z]/.test(a) && /^[A-Z]/.test(b)) score -= 8;
  if (a.split(' ').length === 1 && /^[A-Z]/.test(a) && /^[A-Z][a-z]/.test(b)) score -= 6;
  if (/\b(and|with|of|the|a|an|to|for|in|on|at)\b$/i.test(a)) score -= 5;
  if (/\b(and|with|of|the|a|an|to|for|in|on|at)\b/i.test(b)) score -= 4;
  if (a.split(' ').length === 1) score -= 3;
  if (b.split(' ').length === 1) score -= 2;

  // Likely boundary signals.
  if (/[.!?)]$/.test(a)) score += 4;
  if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+$/.test(b)) score += 1;
  if (/^(Week|TERM|Content|Assessment|ATL)$/i.test(b)) score += 12;

  return score;
}

function condenseRecipeFragments(fragments, targetCount) {
  let entries = (Array.isArray(fragments) ? fragments : [])
    .map(normalizeRecipeFragment)
    .filter(Boolean);

  if (!Number.isInteger(targetCount) || targetCount <= 0) return entries;
  if (entries.length <= targetCount) return entries;

  let guard = 0;
  while (entries.length > targetCount && guard < 2000) {
    let bestIndex = 0;
    let bestScore = Infinity;

    for (let i = 0; i < entries.length - 1; i++) {
      const score = mergeScore(entries[i], entries[i + 1]);
      if (score < bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    const merged = normalizeRecipeFragment(`${entries[bestIndex]} ${entries[bestIndex + 1]}`);
    entries.splice(bestIndex, 2, merged);
    guard += 1;
  }

  return entries;
}

/**
 * Parse the raw PDF text extracted from the year planner PDF.
 * Strategy: scan for TERM markers, then Week N + date range patterns,
 * then extract recipes from the "Practical Lessons" section.
 * Returns an array of { term, weekNum, dateRange, startDate, recipe, notes }
 */
function parseCalendarText(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const results = [];

  // Detect the year from "Calendar - YYYY" or similar
  let year = new Date().getFullYear();
  const yearMatch = text.match(/\b(202\d)\b/);
  if (yearMatch) year = Number(yearMatch[1]);

  // Parse week-level info. We'll scan the full text for patterns like:
  // "Week 2 Feb 1 - Feb 5" or "Week 3 Feb 9 - Feb 13"
  // Date pattern: Month day - [Month] day
  const weekDatePattern = /Week\s+(\d+)\s+([A-Za-z]+)\s+(\d+)\s*[-–]\s*(?:([A-Za-z]+)\s+)?(\d+)/gi;
  const weekEntries = [];
  let m;
  while ((m = weekDatePattern.exec(text)) !== null) {
    const weekNum = parseInt(m[1], 10);
    const startMonth = m[2];
    const startDay = m[3];
    const endMonth = m[4] || startMonth;
    const endDay = m[5];
    const startDate = parseMonthDay(startMonth, startDay, year);
    const endDate = parseMonthDay(endMonth, endDay, year);
    const dateRange = startDate && endDate
      ? `${startMonth} ${startDay} - ${endMonth ? endMonth + ' ' : ''}${endDay}`
      : null;
    weekEntries.push({ weekNum, startDate, dateRange });
  }

  // Determine term boundaries by finding "TERM N" markers in the text.
  // We'll track which TERM each week belongs to by position in text.
  const termPositions = [];
  const termPattern = /TERM\s+(\d)/gi;
  while ((m = termPattern.exec(text)) !== null) {
    termPositions.push({ term: parseInt(m[1], 10), index: m.index });
  }

  // Also capture the WEEK positions in the raw text to assign terms
  const weekDatePatternForPos = /Week\s+(\d+)\s+([A-Za-z]+)\s+(\d+)\s*[-–]\s*(?:([A-Za-z]+)\s+)?(\d+)/gi;
  const weekPositions = [];
  while ((m = weekDatePatternForPos.exec(text)) !== null) {
    weekPositions.push({ weekNum: parseInt(m[1], 10), index: m.index });
  }

  function getTermForIndex(idx) {
    let term = 1;
    for (const tp of termPositions) {
      if (tp.index <= idx) term = tp.term;
    }
    return term;
  }

  // Assign terms to week entries using their positions in the original text
  const weekPosMap = new Map();
  for (const wp of weekPositions) {
    weekPosMap.set(wp.weekNum + '_' + wp.index, { term: getTermForIndex(wp.index), ...wp });
  }

  // Now extract recipes from the "Practical Lessons" row.
  // The pattern: after "Practical" | "Practical Lessons", there's a sequence of recipe names
  // separated by newlines or large whitespace until the next section/table heading.
  const practicalSections = [];
  const practicalPattern = /Practica[l]?\s+[Ll]esso[n]?s?\s*([\s\S]*?)(?=(?:Content|Assessment|TERM\s+\d|$))/gi;
  while ((m = practicalPattern.exec(text)) !== null) {
    const block = String(m[1] || '').trim();
    if (block) practicalSections.push(block);
  }

  // Also try "Practical\nLessons" multiline form
  const practicalPattern2 = /Practica\s*l\s+[Ll]esso\s*n\s*s\s*([\s\S]*?)(?=Content|Assessment|TERM\s+\d|$)/gi;
  while ((m = practicalPattern2.exec(text)) !== null) {
    const block = String(m[1] || '').trim();
    if (block && !practicalSections.includes(block)) practicalSections.push(block);
  }

  // For each practical section, split into individual recipe names.
  // They're separated by newlines. Ignore noise words.
  const noiseWords = new Set(['N/A', 'n/a', 'Assessment', 'ATL', 'Content', 'Week', 'TERM', 'Practical', 'Lessons', '']);
  const allRecipes = [];
  const sectionRecipeLists = [];
  for (const section of practicalSections) {
    const parts = section.split(/\n+/)
      .map(s => s.trim())
      .filter(s => s && !noiseWords.has(s) && !/^(TERM|Week\s+\d|Assessment|Content|ATL)/i.test(s));
    const sectionRecipes = [];
    for (const p of parts) {
      // Split by common separators that pdf-parse might insert between cells
      const subParts = p.split(/\s{3,}/).map(s => s.trim()).filter(Boolean);
      for (const sp of subParts) {
        if (!noiseWords.has(sp) && sp.length > 1) {
          allRecipes.push(sp);
          sectionRecipes.push(sp);
        }
      }
    }
    if (sectionRecipes.length) sectionRecipeLists.push(sectionRecipes);
  }

  // Match weekly entries to recipes. We have weekEntries sorted by weekNum per term.
  // Group again but with term info.
  const termWeekMap = new Map(); // termNum -> sorted list of weekEntry
  for (let i = 0; i < weekEntries.length; i++) {
    const we = weekEntries[i];
    const posEntry = weekPositions[i];
    const term = posEntry ? getTermForIndex(posEntry.index) : 1;
    const key = term;
    if (!termWeekMap.has(key)) termWeekMap.set(key, []);
    termWeekMap.get(key).push({ ...we, term });
  }

  // Flatten weeks in term order
  const sortedTerms = Array.from(termWeekMap.keys()).sort((a, b) => a - b);
  const allWeeks = [];
  for (const term of sortedTerms) {
    const weeks = termWeekMap.get(term).sort((a, b) => a.weekNum - b.weekNum);
    for (const w of weeks) allWeeks.push({ ...w, term });
  }

  // PDFs often split one recipe cell across several lines (for example,
  // "Food Truck foods:" becoming "Food", "Truck", "foods:").
  // Prefer condensing per term so merges stay aligned with each term's week count.
  let condensedRecipes = [];
  if (sectionRecipeLists.length >= sortedTerms.length && sortedTerms.length > 0) {
    for (let i = 0; i < sortedTerms.length; i++) {
      const term = sortedTerms[i];
      const termWeeks = (termWeekMap.get(term) || []).length;
      const sectionRecipes = sectionRecipeLists[i] || [];
      const termCondensed = condenseRecipeFragments(sectionRecipes, termWeeks);
      condensedRecipes.push(...termCondensed);
    }
  }

  if (!condensedRecipes.length) {
    condensedRecipes = condenseRecipeFragments(allRecipes, allWeeks.length);
  }

  // Zip weeks and recipes
  for (let i = 0; i < allWeeks.length; i++) {
    const w = allWeeks[i];
    results.push({
      term: w.term,
      weekNum: w.weekNum,
      dateRange: w.dateRange || '',
      startDate: w.startDate || '',
      recipe: condensedRecipes[i] || '',
      confidence: condensedRecipes[i] ? 'auto' : 'missing'
    });
  }

  return results;
}

/**
 * POST /api/recipe_calendar_pdf/parse
 * Body: { pdfDataUrl: 'data:application/pdf;base64,...' }
 * Returns: { weeks: [...] }
 */
router.post('/parse', async (req, res) => {
  const rawDataUrl = String(req.body && req.body.pdfDataUrl ? req.body.pdfDataUrl : '');
  if (!rawDataUrl) {
    return res.status(400).json({ error: 'pdfDataUrl is required.' });
  }

  // Accept data:application/pdf;base64,<data> or bare base64
  let pdfBuffer;
  const dataUrlMatch = /^data:application\/pdf(?:;[^,]*)?;base64,(.+)$/i.exec(rawDataUrl);
  if (dataUrlMatch) {
    pdfBuffer = Buffer.from(dataUrlMatch[1], 'base64');
  } else if (/^[A-Za-z0-9+/]+=*$/.test(rawDataUrl.replace(/\s/g, ''))) {
    pdfBuffer = Buffer.from(rawDataUrl.replace(/\s/g, ''), 'base64');
  } else {
    return res.status(400).json({ error: 'pdfDataUrl must be a base64-encoded PDF or data URL.' });
  }

  if (pdfBuffer.length > 20 * 1024 * 1024) {
    return res.status(413).json({ error: 'PDF file too large (max 20 MB).' });
  }

  try {
    const parsed = await pdfParse(pdfBuffer);
    const rawText = parsed.text || '';
    const weeks = parseCalendarText(rawText);
    res.json({ weeks, rawText: rawText.slice(0, 3000) }); // rawText preview for debugging
  } catch (err) {
    res.status(500).json({ error: 'Failed to parse PDF: ' + (err.message || String(err)) });
  }
});

module.exports = router;

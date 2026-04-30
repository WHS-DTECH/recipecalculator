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

function extractWeeksWithPositions(text, year) {
  const matches = [];

  // Pattern A: Week 2 Feb 1 - Feb 5
  const patternMonthDay = /Week\s+(\d+)\s+([A-Za-z]+)\s+(\d+)\s*[-–]\s*(?:([A-Za-z]+)\s+)?(\d+)/gi;
  let m;
  while ((m = patternMonthDay.exec(text)) !== null) {
    const weekNum = parseInt(m[1], 10);
    const startMonth = m[2];
    const startDay = m[3];
    const endMonth = m[4] || startMonth;
    const endDay = m[5];
    const startDate = parseMonthDay(startMonth, startDay, year);
    const endDate = parseMonthDay(endMonth, endDay, year);
    const dateRange = startDate && endDate
      ? `${startMonth} ${startDay} - ${endMonth ? endMonth + ' ' : ''}${endDay}`
      : '';
    matches.push({ weekNum, startDate, dateRange, index: m.index });
  }

  // Pattern B: Week 2 1 Feb - 5 Feb
  const patternDayMonth = /Week\s+(\d+)\s+(\d{1,2})\s+([A-Za-z]+)\s*[-–]\s*(\d{1,2})\s+([A-Za-z]+)/gi;
  while ((m = patternDayMonth.exec(text)) !== null) {
    const weekNum = parseInt(m[1], 10);
    const startDay = m[2];
    const startMonth = m[3];
    const endDay = m[4];
    const endMonth = m[5];
    const startDate = parseMonthDay(startMonth, startDay, year);
    const endDate = parseMonthDay(endMonth, endDay, year);
    const dateRange = startDate && endDate
      ? `${startDay} ${startMonth} - ${endDay} ${endMonth}`
      : '';
    matches.push({ weekNum, startDate, dateRange, index: m.index });
  }

  // Deduplicate same week/date starts captured by both patterns, preserving first seen order.
  matches.sort((a, b) => a.index - b.index);
  const deduped = [];
  const seen = new Set();
  for (const item of matches) {
    const key = `${item.index}:${item.weekNum}:${item.startDate || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

function normalizeRecipeFragment(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\b([A-Za-z]{2,})\s+([A-Za-z])\b/g, '$1$2')
    .trim();
}

function mergeScore(left, right) {
  const a = normalizeRecipeFragment(left);
  const b = normalizeRecipeFragment(right);
  if (!a || !b) return 999;

  let score = 0;

  // Strong continuation signals.
  if (/^\(/.test(b)) score -= 8;
  if (/^[a-z]/.test(b)) score -= 7;
  if (/^[)\]}]/.test(b)) score -= 7;
  if (/\($/.test(a)) score -= 7;
  // A trailing colon often marks a complete cell label in planner exports.
  if (/:$/.test(a)) score += 10;
  if (/[;,]$/.test(a)) score -= 2;
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

function isNonRecipeToken(token) {
  const value = String(token || '').trim();
  if (!value) return true;
  if (/^(TERM\s+\d+|Week\s+\d+)$/i.test(value)) return true;
  if (/^(Content|Assessment|ATL|Theory|Resources?|Notes?)$/i.test(value)) return true;
  if (/^[A-Za-z]+\s+\d{1,2}\s*[-–]\s*(?:[A-Za-z]+\s*)?\d{1,2}$/i.test(value)) return true;
  if (/^\d{1,2}\s+[A-Za-z]+\s*[-–]\s*\d{1,2}\s+[A-Za-z]+$/i.test(value)) return true;
  if (/^(Monday|Tuesday|Wednesday|Thursday|Friday)$/i.test(value)) return true;
  return false;
}

function mergeObviousRecipeFragments(fragments) {
  let entries = (Array.isArray(fragments) ? fragments : []).map(normalizeRecipeFragment).filter(Boolean);
  if (entries.length < 2) return entries;

  let changed = true;
  let guard = 0;
  while (changed && guard < 2000) {
    changed = false;
    for (let i = 0; i < entries.length - 1; i++) {
      const score = mergeScore(entries[i], entries[i + 1]);
      // Very strong continuation pair; merge even if counts already line up.
      if (score <= -8) {
        const merged = normalizeRecipeFragment(`${entries[i]} ${entries[i + 1]}`);
        entries.splice(i, 2, merged);
        changed = true;
        break;
      }
    }
    guard += 1;
  }
  return entries;
}

function extractPracticalSections(termBlocks, fullText, getTermForIndex) {
  const sections = [];
  let m;

  // Primary matcher: explicit "Practical Lessons" text within each term block.
  for (const block of termBlocks) {
    const practicalPattern = /Practical\s*Lessons?\s*([\s\S]*?)(?=(?:\n\s*(?:Content|Assessment|ATL|Theory|Resources?)\b|TERM\s+\d|$))/gi;
    while ((m = practicalPattern.exec(block.text)) !== null) {
      const section = String(m[1] || '').trim();
      if (section) sections.push({ term: block.term, section });
    }
  }

  if (sections.length) return sections;

  // Fallback matcher: tolerate OCR/text-fragmented variants like
  // "Practica l Lesso n s" by matching loosened character spacing.
  const looseHeaderPattern = /P\s*r\s*a\s*c\s*t\s*i\s*c\s*a\s*l\s*L\s*e\s*s\s*s\s*o\s*n\s*s?/gi;
  while ((m = looseHeaderPattern.exec(fullText)) !== null) {
    const headerEnd = m.index + m[0].length;
    const tail = fullText.slice(headerEnd);
    const boundaryMatch = /(?:\n\s*(?:Content|Assessment|ATL|Theory|Resources?)\b|TERM\s+\d)/i.exec(tail);
    const sectionEnd = boundaryMatch ? headerEnd + boundaryMatch.index : fullText.length;
    const section = String(fullText.slice(headerEnd, sectionEnd) || '').trim();
    if (!section) continue;
    sections.push({ term: getTermForIndex(m.index), section });
  }

  return sections;
}

/**
 * Parse the raw PDF text extracted from the year planner PDF.
 * Strategy: scan for TERM markers, then Week N + date range patterns,
 * then extract recipes from the "Practical Lessons" section.
 * Returns an array of { term, weekNum, dateRange, startDate, recipe, notes }
 */
function parseCalendarText(text) {
  const results = [];

  // Detect the year from "Calendar - YYYY" or similar
  let year = new Date().getFullYear();
  const yearMatch = text.match(/\b(202\d)\b/);
  if (yearMatch) year = Number(yearMatch[1]);

  // Parse week-level info from common planner date formats.
  const weekEntries = extractWeeksWithPositions(text, year);

  // Determine term boundaries by finding "TERM N" markers in the text.
  // We'll track which TERM each week belongs to by position in text.
  const termPositions = [];
  const termPattern = /TERM\s+(\d)/gi;
  let m;
  while ((m = termPattern.exec(text)) !== null) {
    termPositions.push({ term: parseInt(m[1], 10), index: m.index });
  }

  function getTermForIndex(idx) {
    let term = 1;
    for (const tp of termPositions) {
      if (tp.index <= idx) term = tp.term;
    }
    return term;
  }

  // Extract recipes from "Practical Lessons" rows in each term block.
  // This keeps recipes aligned with week groups in that same term.
  const sortedTermPositions = termPositions.slice().sort((a, b) => a.index - b.index);
  const termBlocks = [];
  if (sortedTermPositions.length) {
    for (let i = 0; i < sortedTermPositions.length; i++) {
      const start = sortedTermPositions[i].index;
      const end = i + 1 < sortedTermPositions.length ? sortedTermPositions[i + 1].index : text.length;
      termBlocks.push({ term: sortedTermPositions[i].term, text: text.slice(start, end) });
    }
  } else {
    termBlocks.push({ term: 1, text });
  }

  const practicalSections = extractPracticalSections(termBlocks, text, getTermForIndex);

  // For each practical section, split into individual recipe names.
  // They're usually separated by newlines or large spaces. Ignore non-recipe tokens.
  const noiseWords = new Set(['N/A', 'n/a', 'Assessment', 'ATL', 'Content', 'Week', 'TERM', 'Practical', 'Lessons', '', '-']);
  const allRecipes = [];
  const sectionRecipeListsByTerm = new Map();
  for (const entry of practicalSections) {
    const parts = entry.section.split(/\n+/)
      .map(s => s.trim())
      .filter(s => s && !noiseWords.has(s) && !isNonRecipeToken(s));
    const sectionRecipes = [];
    for (const p of parts) {
      // Split by common separators that pdf-parse might insert between cells
      const subParts = p.split(/\s{3,}/).map(s => s.trim()).filter(Boolean);
      for (const sp of subParts) {
        if (!noiseWords.has(sp) && sp.length > 1 && !isNonRecipeToken(sp)) {
          allRecipes.push(sp);
          sectionRecipes.push(sp);
        }
      }
    }
    if (sectionRecipes.length) {
      const mergedStrong = mergeObviousRecipeFragments(sectionRecipes);
      if (!sectionRecipeListsByTerm.has(entry.term)) sectionRecipeListsByTerm.set(entry.term, []);
      sectionRecipeListsByTerm.get(entry.term).push(...mergedStrong);
    }
  }

  // Match weekly entries to recipes. We have weekEntries sorted by weekNum per term.
  // Group again but with term info.
  const termWeekMap = new Map(); // termNum -> sorted list of weekEntry
  for (const we of weekEntries) {
    const term = getTermForIndex(we.index);
    const key = term;
    if (!termWeekMap.has(key)) termWeekMap.set(key, []);
    termWeekMap.get(key).push({ ...we, term });
  }

  // If a term's earliest week number is > 1, the PDF has no date header for the
  // leading week(s) (e.g. orientation/powhiri week). Inject synthetic week entries
  // so that recipe count and week count stay aligned during condensing.
  for (const [term, entries] of termWeekMap) {
    const sorted = entries.sort((a, b) => a.weekNum - b.weekNum);
    const minWeek = sorted[0].weekNum;
    if (minWeek > 1) {
      const sectionRecipes = sectionRecipeListsByTerm.get(term) || [];
      const premerged = mergeObviousRecipeFragments(sectionRecipes);
      const missing = Math.min(minWeek - 1, Math.max(0, premerged.length - sorted.length));
      for (let w = minWeek - missing; w < minWeek; w++) {
        // Calculate date as 7*(minWeek - w) days before the first known week's date
        let syntheticDate = '';
        if (sorted[0].startDate) {
          const d = new Date(sorted[0].startDate);
          d.setDate(d.getDate() - 7 * (minWeek - w));
          syntheticDate = d.toISOString().slice(0, 10);
        }
        entries.unshift({ weekNum: w, startDate: syntheticDate, dateRange: '', index: sorted[0].index, term });
      }
    }
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
  if (sortedTerms.length > 0) {
    for (const term of sortedTerms) {
      const termWeeks = (termWeekMap.get(term) || []).length;
      const sectionRecipes = sectionRecipeListsByTerm.get(term) || [];
      const strongMerged = mergeObviousRecipeFragments(sectionRecipes);
      const termCondensed = condenseRecipeFragments(strongMerged, termWeeks);
      if (termCondensed.length) condensedRecipes.push(...termCondensed);
    }
  }

  if (!condensedRecipes.length) {
    condensedRecipes = condenseRecipeFragments(mergeObviousRecipeFragments(allRecipes), allWeeks.length);
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

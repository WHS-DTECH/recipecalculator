// Automated keyboard navigation test
// This script counts interactive elements and verifies focus handling

const http = require('http');
const cheerio = require('cheerio');

const pages = [
  'http://localhost:4000/quick_add.html',
  'http://localhost:4000/add_recipe.html',
  'http://localhost:4000/book_a_class.html',
  'http://localhost:4000/book_the_shopping.html',
  'http://localhost:4000/ingredients_directory.html',
  'http://localhost:4000/recipe_publish.html'
];

async function fetchPage(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function getStylesheetUrls($, pageUrl) {
  return $('link[rel="stylesheet"]')
    .map((_, el) => $(el).attr('href'))
    .get()
    .filter(Boolean)
    .filter(href => !href.startsWith('http://') && !href.startsWith('https://'))
    .map(href => new URL(href, pageUrl).href);
}

async function pageHasFocusStyles(html, $, pageUrl) {
  if (html.includes(':focus-visible') || html.includes(':focus')) {
    return true;
  }

  const stylesheets = getStylesheetUrls($, pageUrl);
  for (const stylesheetUrl of stylesheets) {
    try {
      const css = await fetchPage(stylesheetUrl);
      if (css.includes(':focus-visible') || css.includes(':focus')) {
        return true;
      }
    } catch (_) {
      // Ignore stylesheet fetch failures so audit can continue.
    }
  }

  return false;
}

async function analyzeAccessibility(url) {
  try {
    const html = await fetchPage(url);
    const $ = cheerio.load(html);
    
    const pageName = url.split('/').pop();
    console.log(`\n=== ${pageName} ===`);
    
    // Count interactive elements
    const buttons = $('button').length;
    const inputs = $('input').length;
    const selects = $('select').length;
    const links = $('a').not('[href^="#"]').length;
    const totalInteractive = buttons + inputs + selects + links;
    
    // Check for labels
    const labels = $('label').length;
    const inputsWithoutLabel = $('input[type!="hidden"]').filter(function() {
      const id = $(this).attr('id');
      return !id || !$(`label[for="${id}"]`).length;
    }).length;
    
    // Check focus handling in inline HTML and linked CSS.
    const focusStyles = await pageHasFocusStyles(html, $, url);
    
    // Check semantic HTML
    const tables = $('table').length;
    const tableHeaders = $('th').length;
    const forms = $('form').length;
    const headings = $('h1, h2, h3').length;
    
    console.log(`Buttons: ${buttons}, Inputs: ${inputs}, Selects: ${selects}, Links: ${links}`);
    console.log(`Total interactive elements: ${totalInteractive}`);
    console.log(`\nForm elements:`);
    console.log(`  Labels: ${labels}, Inputs without labels: ${inputsWithoutLabel}`);
    console.log(`  Forms: ${forms}`);
    console.log(`\nSemantic elements:`);
    console.log(`  Tables: ${tables}, Table headers: ${tableHeaders}`);
    console.log(`  Headings: ${headings}`);
    console.log(`\nFocus handling: ${focusStyles ? '✓ CSS focus styles found' : '✗ No focus styles found'}`);
    
    // Warnings
    const warnings = [];
    if (inputsWithoutLabel > 0) warnings.push(`${inputsWithoutLabel} inputs missing labels`);
    if (buttons + inputs + selects > 30) warnings.push('Many interactive elements (>30) - verify Tab order');
    
    if (warnings.length > 0) {
      console.log(`\n⚠️  Issues:`);
      warnings.forEach(w => console.log(`  - ${w}`));
    } else {
      console.log(`\n✓ No flagged accessibility issues`);
    }
    
  } catch (error) {
    console.error(`Error analyzing ${url}:`, error.message);
  }
}

(async () => {
  console.log('=== KEYBOARD NAVIGATION & SEMANTIC HTML ANALYSIS ===');
  for (const page of pages) {
    await analyzeAccessibility(page);
  }
})();

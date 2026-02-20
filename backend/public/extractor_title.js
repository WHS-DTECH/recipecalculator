// Demo strategies/results for Title Text Extractor
const strategies = [
  { name: 'Is there matching words from the URL in the Raw Data?', applied: false, result: '—', solved: false },
  { name: 'Not a section header', applied: false, result: '—', solved: false },
  { name: 'Not all lowercase', applied: false, result: '—', solved: false },
  { name: 'Not too short (≥4 chars)', applied: false, result: '—', solved: false },
  { name: 'Not only digits/symbols', applied: false, result: '—', solved: false },
  { name: 'Prefers larger/bold lines', applied: false, result: '—', solved: false },
  { name: 'NLP noun phrase/WORK_OF_ART', applied: false, result: '—', solved: false },
  { name: 'Fallback: Uppercase start, not junk word', applied: false, result: '—', solved: false },
  { name: 'Up to 5 lines above first ingredient', applied: false, result: '—', solved: false },
  { name: 'Prefers food words from ingredient block', applied: false, result: '—', solved: false },
  { name: 'Closest non-empty line above ingredient block', applied: false, result: '—', solved: false },
  { name: 'If none, returns "Unknown Recipe"', applied: false, result: '—', solved: false }
];

const rawData = `<!doctype html><html lang="en"><head>\n<meta charset="utf-8">\n<!-- Meta Title Logic -->\n<title>Vanilla Cupcakes with Buttercream Icing Recipe | Chelsea Sugar</title>\n<link rel="shortcut icon" href="https://www.chelsea.co.nz/hubfs/Chelsea%20Logo%20on%20Frame.svg">\n<!-- Meta Description Logic -->\n<meta name="description" content="Light, fluffy vanilla cupcakes with melt-in-your-mouth buttercream icing. Add sprinkles and decorative flowers to make them just a little bit fancy!">\n<style>@font-face { font-family: 'Open Sans'; font-weight: 300; font-style: normal; font-display: swap; src: url('/_cms/googlefonts/Open_Sans/300.woff2') format('woff2'), url('/_cms/googlefonts/Open_Sans/300.woff') format('woff'); }`;

document.getElementById('rawDataBox').textContent = rawData;
function renderTitleExtractorTable() {
  const tbody = document.getElementById('titleExtractorTableBody');
  tbody.innerHTML = strategies.map(s => `
    <tr>
      <td>${s.name}</td>
      <td>${s.applied ? '✓' : '—'}</td>
      <td class='extractor-result'>${s.result}</td>
      <td>${s.solved ? "<span class='extractor-status'>✔</span>" : "<span class='extractor-status unsolved'>✗</span>"}</td>
    </tr>
  `).join('');
}
renderTitleExtractorTable();

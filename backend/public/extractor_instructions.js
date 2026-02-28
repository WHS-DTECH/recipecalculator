// JS for Instructions Extractor, modeled after Serving Size Extractor

document.addEventListener('DOMContentLoaded', function () {
  const recipeSelect = document.getElementById('recipeSelect');
  const startStepBtn = document.getElementById('startStepBtn');
  const strategyTable = document.getElementById('strategyTable').getElementsByTagName('tbody')[0];
  const solutionBox = document.getElementById('solutionBox');
  const sendSolutionBtn = document.getElementById('sendSolutionBtn');
  // const showRawBtn = document.getElementById('showRawBtn');
  const rawDataBox = document.getElementById('rawDataBox');

  let currentRecipeId = null;
  let rawData = '';
  // Disable Start Step-by-step until rawData is loaded
  startStepBtn.disabled = true;

  // Fetch recipes for dropdown
  fetch('/api/recipes')
    .then(res => res.json())
    .then(recipes => {
      recipes.forEach(recipe => {
        const opt = document.createElement('option');
        opt.value = recipe.id;
        // Only show the URL as the label
        opt.textContent = recipe.url && recipe.url.trim() ? recipe.url : `Recipe #${recipe.id}`;
        recipeSelect.appendChild(opt);
      });
    });

  function showRawDataPopup(rawData) {
    const win = window.open('', '_blank', 'width=900,height=700,resizable,scrollbars');
    if (!win) return;
    win.document.write(`
      <html><head><title>Raw Data</title>
      <style>
      body { font-family: monospace; background: #f8f8ff; margin: 0; padding: 1.5em; }
      pre { white-space: pre-wrap; word-break: break-word; font-size: 1.08em; background: #fff; border: 1px solid #ddd; border-radius: 6px; padding: 1em; }
      button { margin-top: 1.5em; padding: 0.5em 1.2em; background: #1976d2; color: #fff; border: none; border-radius: 4px; font-size: 1em; cursor: pointer; }
      </style></head><body>
      <h2>Raw Data (from Upload)</h2>
      <pre>"${String(rawData).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '\n')}"</pre>
      <button onclick="window.close()">Close</button>
      </body></html>
    `);
    win.document.close();
  }


  recipeSelect.addEventListener('change', function () {
    currentRecipeId = recipeSelect.value;
    rawData = '';
    startStepBtn.disabled = true;
    if (!currentRecipeId) {
      return;
    }
    // Always use recipeID for file path
    fetch(`/RawDataTXT/${currentRecipeId}.txt`)
      .then(res => res.ok ? res.text() : '')
      .then(text => {
        rawData = text || '';
        console.log('[DEBUG] rawData loaded. Length:', rawData.length, 'Preview:', rawData.slice(0, 300));
        startStepBtn.disabled = false;
      });
  });


  // Show raw data in a new window when button is clicked
  document.getElementById('showRawBtn').addEventListener('click', function() {
    showRawDataPopup(rawData);
  });

  // Removed Show in Separate Window button and its event listener

  // Step-by-step strategies logic (like Serving Size Extractor)
  const stepControls = document.getElementById('stepControls');
  const currentStrategyName = document.getElementById('currentStrategyName');
  const currentStrategyResult = document.getElementById('currentStrategyResult');
  const acceptResultBtn = document.getElementById('acceptResultBtn');
  const continueBtn = document.getElementById('continueBtn');
  let stepStrategies = [];
  let stepIndex = 0;

  // Utility to decode HTML entities
  function htmlUnescape(str) {
    const temp = document.createElement('textarea');
    temp.innerHTML = str;
    return temp.value;
  }

  const strategies = [
    {
      name: 'Look for ordered list',
      fn: raw => {
        const unescapedData = htmlUnescape(raw).replace(/<img[^>]*>/gi, '');
        const match = unescapedData.match(/<ol[^>]*>([\s\S]*?)<\/ol>/i);
        return match ? match[1].replace(/<li[^>]*>/g, '').replace(/<\/li>/g, '\n').trim() : '';
      }
    },
    {
      name: 'Look for numbered steps',
      fn: raw => {
        const unescapedData = htmlUnescape(raw).replace(/<img[^>]*>/gi, '');
        const lines = unescapedData.split(/\n|<br\s*\/\?\s*>/i);
        const steps = lines.filter(line => /^\d+\./.test(line.trim()));
        return steps.length ? steps.join('\n') : '';
      }
    },
    {
      name: "Find 'method' and nearest list",
      fn: raw => {
        const unescapedData = htmlUnescape(raw).replace(/<img[^>]*>/gi, '');
        const methodIndex = unescapedData.toLowerCase().indexOf('method');
        if (methodIndex === -1) return '';
        const after = unescapedData.substring(methodIndex);
        // Search for the nearest <ol> or <ul> anywhere after 'method'
        let listMatch = after.match(/<(ol|ul)[^>]*>([\s\S]*?)<\/\1>/i);
        if (!listMatch) {
          // Fallback: search for <div class="wysiwyg"> containing a list anywhere in the raw HTML
          const wysiwygBlocks = [...unescapedData.matchAll(/<div[^>]*class=["'][^"']*wysiwyg[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi)];
          for (const block of wysiwygBlocks) {
            const list = block[1].match(/<(ol|ul)[^>]*>([\s\S]*?)<\/\1>/i);
            if (list) {
              listMatch = list;
              break;
            }
          }
        }
        if (listMatch) {
          const items = [...listMatch[2].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean);
          return items.length ? items : '';
        }
        return '';
      }
    },
    {
      name: 'Look for "recipeInstructions" as plain string',
      fn: raw => {
        // Robustly find all <script type="application/ld+json"> blocks regardless of whitespace, newlines, or attribute order
        // Make script tag splitting and detection case-insensitive
        // Replace all </script> (any case) with a unique marker, then split on <script (any case)
        const RAW_SCRIPT_END = '___SCRIPT_END___';
        const rawNorm = raw.replace(/<\/script>/gi, RAW_SCRIPT_END);
        const blocks = rawNorm.split(/<script/i).slice(1); // skip first split part (before first <script)
        console.log('[DEBUG] Number of <script> blocks found:', blocks.length);
        let found = false;
        let blockNum = 0;
        for (const block of blocks) {
          blockNum++;
          const endIdx = block.indexOf(RAW_SCRIPT_END);
          if (endIdx === -1) {
            console.log(`[DEBUG] Block ${blockNum}: No </script> found, skipping.`);
            continue;
          }
          const tagAndContent = block.slice(0, endIdx);
          console.log(`[DEBUG] Block ${blockNum}: First 300 chars:`, tagAndContent.slice(0, 300));
          // Check for type="application/ld+json" (allow whitespace, single/double quotes, any attribute order, case-insensitive)
          if (/type\s*=\s*['"]application\/ld\+json['"]/i.test(tagAndContent)) {
            found = true;
            console.log(`[DEBUG] Block ${blockNum}: Matched type="application/ld+json"`);
            // Remove everything before the first > (end of opening tag)
            const gtIdx = tagAndContent.indexOf('>');
            if (gtIdx === -1) {
              console.log(`[DEBUG] Block ${blockNum}: No > found in opening tag, skipping.`);
              continue;
            }
            const jsonText = tagAndContent.slice(gtIdx + 1);
            // Try regex first
            const regex = /"recipeInstructions"\s*:\s*"([\s\S]*?)"/i;
            let match = jsonText.match(regex);
            console.log('[DEBUG] Searching JSON-LD block for recipeInstructions:', jsonText.slice(0, 300));
            if (match) {
              let value = match[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\r/g, '\r');
              console.log('[DEBUG] extracted value (regex):', value);
              return value.trim();
            }
            // Fallback: plain string search
            const idx = jsonText.indexOf('recipeInstructions');
            if (idx !== -1) {
              // Try to extract the value manually
              const after = jsonText.slice(idx);
              // Find the first colon after 'recipeInstructions'
              const colonIdx = after.indexOf(':');
              if (colonIdx !== -1) {
                // Find the first quote after the colon
                const quoteIdx = after.indexOf('"', colonIdx);
                if (quoteIdx !== -1) {
                  // Find the closing quote (not escaped)
                  let endIdx = quoteIdx + 1;
                  let value = '';
                  while (endIdx < after.length) {
                    if (after[endIdx] === '"' && after[endIdx - 1] !== '\\') {
                      value = after.slice(quoteIdx + 1, endIdx);
                      break;
                    }
                    endIdx++;
                  }
                  value = value.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\r/g, '\r');
                  console.log('[DEBUG] extracted value (plain search):', value);
                  return value.trim();
                }
              }
            }
          } else {
            console.log(`[DEBUG] Block ${blockNum}: type="application/ld+json" NOT found.`);
          }
        }
        if (!found) {
          console.log('[DEBUG] No JSON-LD script blocks found.');
        }
        return '';
      }
    },
    {
      name: 'Look for "recipeInstructions" and show the array',
      fn: raw => {
        // Extract all <p itemprop="recipeInstructions">...</p> elements from the HTML
        const matches = [...raw.matchAll(/<p[^>]*itemprop=["']recipeInstructions["'][^>]*>([\s\S]*?)<\/p>/gi)];
        if (!matches.length) return '';
        // Join all matched instructions
        return matches.map(m => m[0]).join('\n');
      }
    },
    {
      name: 'Find any line containing "instructions" (LIKE wildcard)',
      fn: raw => {
        const unescapedData = htmlUnescape(raw).replace(/<img[^>]*>/gi, '');
        const match = unescapedData.match(/("recipeInstructions"\s*:\s*)(\[[\s\S]*?\]|\{[\s\S]*?\})/i);
        if (match) {
          return match[1] + match[2];
        }
        const lines = unescapedData.split(/\n|<br\s*\/\?\s*>/i);
        const matches = lines.filter(line => /instructions/i.test(line));
        return matches.length ? matches.map(line => line.trim()).join('\n') : '';
      }
    },
    {
      name: 'If none, returns "N/A"',
      fn: raw => 'N/A'
    }
  ];

  startStepBtn.addEventListener('click', function () {
    if (!currentRecipeId) {
      alert('Please select a recipe first.');
      return;
    }
    if (!rawData || rawData.length < 100) {
      alert('Raw data not loaded yet. Please wait and try again.');
      console.log('[DEBUG] Attempted to run strategies with rawData length:', rawData.length, 'Preview:', rawData.slice(0, 300));
      return;
    }
    // Run all strategies on the current rawData
    // Remove common HTML banners/headers/navs before running strategies
    let cleanedRawData = rawData;
    cleanedRawData = cleanedRawData.replace(/<header[\s\S]*?<\/header>/gi, '');
    cleanedRawData = cleanedRawData.replace(/<nav[\s\S]*?<\/nav>/gi, '');
    cleanedRawData = cleanedRawData.replace(/<footer[\s\S]*?<\/footer>/gi, '');
      cleanedRawData = cleanedRawData.replace(/<div[^>]*(class|id)=["'][^"']*(banner|header|nav)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '');
      cleanedRawData = cleanedRawData.replace(/<section[^>]*(class|id)=["'][^"']*(banner|header|nav)[^"']*["'][^>]*>[\s\S]*?<\/section>/gi, '');
      cleanedRawData = cleanedRawData.replace(/<style[\s\S]*?<\/style>/gi, '');
      cleanedRawData = cleanedRawData.replace(/<script[\s\S]*?<\/script>/gi, '');
      // Run all strategies on the cleaned rawData
      stepStrategies = strategies.map(s => {
        const result = s.fn(cleanedRawData);
        return {
          name: s.name,
          applied: false,
          result: result,
          solved: !!result && result !== 'N/A'
        };
      });
    stepIndex = 0;
    renderStepTable();
    showStepControls();
    showCurrentStep();
  });


  function renderStepTable() {
    strategyTable.innerHTML = '';
    stepStrategies.forEach((s, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td>${s.name}</td>
        <td>${s.applied ? '\u2713' : '\u2014'}</td>
        <td class='extractor-result' style='color:#333;background:#f8f8ff;min-width:340px;max-width:700px;width:40vw;overflow-x:auto;white-space:pre-wrap;word-break:break-all;'>${s.result ? s.result : '<span style="color:#bbb">(no result)</span>'}</td>
        <td>${s.solved ? '<span style="color:green">\u2714</span>' : '<span style="color:red">\u2717</span>'}</td>
      `;
      strategyTable.appendChild(tr);
    });
  }

  function showStepControls() {
    stepControls.style.display = '';
  }
  function hideStepControls() {
    stepControls.style.display = 'none';
  }
  function showCurrentStep() {
    if (stepIndex < 0 || stepIndex >= stepStrategies.length) {
      hideStepControls();
      return;
    }
    const s = stepStrategies[stepIndex];
    currentStrategyName.textContent = s.name;
    currentStrategyResult.textContent = s.result || '(no result)';
    acceptResultBtn.disabled = false; // Always enabled
    continueBtn.disabled = stepIndex >= stepStrategies.length - 1;
  }

  acceptResultBtn.addEventListener('click', function () {
    if (stepIndex < 0 || stepIndex >= stepStrategies.length) return;
    stepStrategies[stepIndex].applied = true;
    stepStrategies[stepIndex].solved = true;
    // Clear and fill the solution box with the result of the current step
    solutionBox.value = '';
    if (stepStrategies[stepIndex].result) {
      solutionBox.value = stepStrategies[stepIndex].result;
      console.log('[LOG] SolutionBox updated:', solutionBox.value);
    }
    renderStepTable();
    showCurrentStep();
  });

  continueBtn.addEventListener('click', function () {
    if (stepIndex < stepStrategies.length - 1) {
      stepIndex++;
      showCurrentStep();
    }
  });

  sendSolutionBtn.addEventListener('click', function () {
    if (!currentRecipeId) {
      alert('Please select a recipe.');
      return;
    }
    const solution = solutionBox.value.trim();
    console.log('[LOG] Sending solution:', solution);
    if (!solution) {
      alert('Please enter a solution.');
      return;
    }
    fetch('http://localhost:4000/api/instructions-extractor/solution', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipeId: currentRecipeId, solution })
    })
      .then(res => res.json())
      .then(data => {
        console.log('[LOG] Server response:', data);
        if (data.success) {
          alert('Solution sent and record amended!');
        } else {
          alert('Failed to send solution.');
        }
      })
      .catch((err) => {
        console.error('[LOG] Solution send error:', err);
        alert('Failed to send solution.');
      });
  });
});

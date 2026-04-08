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
  const recipeById = new Map();
  // Disable Start Step-by-step until rawData is loaded
  startStepBtn.disabled = true;

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function normalizeStrategyResult(result) {
    if (Array.isArray(result)) return result.join('\n').trim();
    if (result && typeof result === 'object') return JSON.stringify(result, null, 2).trim();
    return String(result || '').trim();
  }

  function hasInstructionSignal(raw) {
    const text = String(raw || '');
    return /recipeInstructions|HowToStep|itemprop=["']recipeInstructions["']|<ol|<ul|\bmethod\b/i.test(text);
  }

  // Fetch recipes for dropdown
  fetch('/api/recipes')
    .then(res => res.json())
    .then(recipes => {
      recipes.forEach(recipe => {
        recipeById.set(String(recipe.id), recipe);
        const opt = document.createElement('option');
        opt.value = recipe.id;
        const title = recipe.name && recipe.name.trim() ? recipe.name.trim() : 'Untitled Recipe';
        const url = recipe.url && recipe.url.trim() ? recipe.url.trim() : '';
        const urlSuffix = url ? ` | ${url}` : '';
        opt.textContent = `[${recipe.id}] ${title}${urlSuffix}`;
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
      .then(async text => {
        rawData = text || '';
        if (!hasInstructionSignal(rawData)) {
          const recipe = recipeById.get(String(currentRecipeId));
          const recipeUrl = recipe && recipe.url ? recipe.url.trim() : '';
          if (recipeUrl) {
            try {
              const visibleRes = await fetch(`/api/extract-visible-text?url=${encodeURIComponent(recipeUrl)}`);
              if (visibleRes.ok) {
                const visibleData = await visibleRes.json();
                const blocks = [];

                if (Array.isArray(visibleData.jsonLdInstructions) && visibleData.jsonLdInstructions.length) {
                  blocks.push('JSON-LD Recipe Instructions:\n' + visibleData.jsonLdInstructions.join('\n'));
                }
                if (Array.isArray(visibleData.headingCandidates) && visibleData.headingCandidates.length) {
                  blocks.push('Heading Candidates:\n' + visibleData.headingCandidates.join('\n\n'));
                }
                if (Array.isArray(visibleData.listItems) && visibleData.listItems.length) {
                  blocks.push('Visible List Items:\n' + visibleData.listItems.join('\n'));
                }
                if (visibleData.visibleText) {
                  blocks.push('Visible Page Text:\n' + String(visibleData.visibleText).slice(0, 20000));
                }

                const combinedVisible = blocks.join('\n\n');
                if (combinedVisible && combinedVisible.length > rawData.length) {
                  rawData = combinedVisible;
                }
              } else {
                const freshRes = await fetch(`/api/extract-rendered-html?url=${encodeURIComponent(recipeUrl)}`);
                if (freshRes.ok) {
                  const freshRaw = await freshRes.text();
                  if (freshRaw && freshRaw.length > rawData.length) {
                    rawData = freshRaw;
                  }
                }
              }
            } catch (_) {
              // Keep existing rawData if fallback extraction fails.
            }
          }
        }
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
  const autoExtractBtn = document.getElementById('autoExtractBtn');
  const autoExtractResultBox = document.getElementById('autoExtractResultBox');
  const autoExtractResultText = document.getElementById('autoExtractResultText');
  const autoAcceptSendBtn = document.getElementById('autoAcceptSendBtn');
  const autoDeclineBtn = document.getElementById('autoDeclineBtn');
  let stepStrategies = [];
  let stepIndex = 0;
  let autoExtractSolution = '';
  const AUTO_EXTRACT_CORE_STRATEGY_NAMES = [
    'Look for ordered list',
    'Look for numbered steps',
    "Find 'method' and nearest list",
    "Find 'Method' text in visible blocks",
    'Extract instruction tail from Visible List Items',
    'Extract recipeInstructions array from JSON'
  ];

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
        if (match) {
          console.debug('[DEBUG][ordered list] Found <ol> block:', match[1].slice(0, 100));
        } else {
          console.debug('[DEBUG][ordered list] No <ol> found');
        }
        return match ? match[1].replace(/<li[^>]*>/g, '').replace(/<\/li>/g, '\n').trim() : '';
      }
    },
    {
      name: 'Look for numbered steps',
      fn: raw => {
        const unescapedData = htmlUnescape(raw).replace(/<img[^>]*>/gi, '');
        const lines = unescapedData.split(/\n|<br\s*\/?\s*>/i);
        const steps = lines.filter(line => /^\d+\./.test(line.trim()));
        if (steps.length) {
          console.debug('[DEBUG][numbered steps] Found steps:', steps.slice(0, 3));
        } else {
          console.debug('[DEBUG][numbered steps] No numbered steps found');
        }
        return steps.length ? steps.join('\n') : '';
      }
    },
    {
      name: "Find 'method' and nearest list",
      fn: raw => {
        const unescapedData = htmlUnescape(raw).replace(/<img[^>]*>/gi, '');
        const methodIndex = unescapedData.toLowerCase().indexOf('method');
        if (methodIndex === -1) {
          console.debug("[DEBUG][method+list] No 'method' found");
          return '';
        }
        const after = unescapedData.substring(methodIndex);
        // Search for the nearest <ol> or <ul> anywhere after 'method'
        let listMatch = after.match(/<(ol|ul)[^>]*>([\s\S]*?)<\/\1>/i);
        if (!listMatch) {
          // Fallback: search for <div class=\"wysiwyg\"> containing a list anywhere in the raw HTML
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
          console.debug('[DEBUG][method+list] Found items:', items.slice(0, 3));
          return items.length ? items : '';
        }
        console.debug('[DEBUG][method+list] No list found after method');
        return '';
      }
    },
    {
      name: "Find 'Method' text in visible blocks",
      fn: raw => {
        const unescapedData = htmlUnescape(raw).replace(/<img[^>]*>/gi, '');
        const lower = unescapedData.toLowerCase();
        const methodIndex = lower.indexOf('method');
        if (methodIndex === -1) {
          console.debug("[DEBUG][method visible text] No 'method' marker found");
          return '';
        }

        let methodChunk = unescapedData.slice(methodIndex, methodIndex + 4000);
        const stopMarkers = [
          'page text:',
          'login to',
          'favourites',
          'join our newsletter',
          'cookies',
          'privacy statement',
          'terms and conditions'
        ];
        for (const marker of stopMarkers) {
          const stopAt = methodChunk.toLowerCase().indexOf(marker);
          if (stopAt > 0) {
            methodChunk = methodChunk.slice(0, stopAt);
            break;
          }
        }

        methodChunk = methodChunk
          .replace(/^method\s*[:\-]?\s*/i, '')
          .replace(/\s+/g, ' ')
          .trim();
        if (!methodChunk) {
          console.debug('[DEBUG][method visible text] Method chunk empty after cleanup');
          return '';
        }

        const sentenceParts = methodChunk
          .split(/(?<=[.!?])\s+(?=[A-Z])/)
          .map(s => s.trim())
          .filter(Boolean);

        const looksLikeInstruction = s => /\b(preheat|heat|melt|add|mix|stir|cook|pour|bake|serve|beat|whisk|simmer|combine|fold|place)\b/i.test(s);
        const instructionLines = sentenceParts.filter(looksLikeInstruction);

        if (!instructionLines.length) {
          console.debug('[DEBUG][method visible text] No instruction-like sentences found');
          return '';
        }

        console.debug('[DEBUG][method visible text] Found instruction lines:', instructionLines.slice(0, 3));
        return instructionLines.join('\n');
      }
    },
    {
      name: 'Extract instruction tail from Visible List Items',
      fn: raw => {
        const unescapedData = htmlUnescape(raw).replace(/<img[^>]*>/gi, '');
        const blockMatch = unescapedData.match(/Visible List Items:\s*([\s\S]*?)(?:\n\s*Page Text:|\n\s*Visible Page Text:|$)/i);
        if (!blockMatch) {
          console.debug('[DEBUG][visible list tail] No Visible List Items block found');
          return '';
        }

        const lines = blockMatch[1]
          .split('\n')
          .map(line => line.replace(/\s+/g, ' ').trim())
          .filter(Boolean);

        const instructionLine = line => /\b(preheat|heat|melt|add|mix|stir|cook|pour|bake|serve|beat|whisk|simmer|combine|fold|place)\b/i.test(line);
        const methodIndex = lines.findIndex(line => /^method\b/i.test(line));
        const startIndex = methodIndex >= 0 ? methodIndex : lines.findIndex(instructionLine);
        if (startIndex < 0) {
          console.debug('[DEBUG][visible list tail] No instruction-like lines found');
          return '';
        }

        const extracted = lines
          .slice(startIndex)
          .map(line => line.replace(/^method\s*[:\-]?\s*/i, '').trim())
          .filter(instructionLine);

        if (!extracted.length) {
          console.debug('[DEBUG][visible list tail] No extracted instruction lines after cleanup');
          return '';
        }

        console.debug('[DEBUG][visible list tail] Extracted lines:', extracted.slice(0, 3));
        return extracted.join('\n');
      }
    },
    {
      name: 'Extract recipeInstructions array from JSON',
      fn: raw => {
        // Regex to find the recipeInstructions array in the raw text (like ingredients extractor)
        const match = raw.match(/"recipeInstructions"\s*:\s*(\[[\s\S]*?\])/);
        if (match) {
          console.debug('[DEBUG][regex array] Found recipeInstructions array:', match[1].slice(0, 120));
        } else {
          console.debug('[DEBUG][regex array] No recipeInstructions array found');
        }
        return match ? match[1] : '';
      }
    },
    {
      name: 'Find recipeInstructions in JSON-LD (string or array)',
      fn: raw => {
        // Use DOMParser to create a document from the raw HTML
        let doc;
        try {
          doc = new window.DOMParser().parseFromString(raw, 'text/html');
        } catch (e) {
          console.debug('[DEBUG][jsonld] DOMParser failed');
          return '';
        }
        const scripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));
        if (!scripts.length) {
          console.debug('[DEBUG][jsonld] No <script type="application/ld+json"> found');
        }
        for (const script of scripts) {
          let json;
          try {
            json = JSON.parse(script.textContent);
          } catch (e) {
            console.debug('[DEBUG][jsonld] JSON parse error:', e);
            continue;
          }
          // JSON-LD can be an array, object, or graph
          let candidates = [];
          if (Array.isArray(json)) {
            candidates = json;
          } else if (json['@graph']) {
            candidates = json['@graph'];
          } else {
            candidates = [json];
          }
          for (const item of candidates) {
            if (item && item['@type'] && (item['@type'] === 'Recipe' || (Array.isArray(item['@type']) && item['@type'].includes('Recipe')))) {
              if (item.recipeInstructions) {
                console.debug('[DEBUG][jsonld] Found recipeInstructions:', typeof item.recipeInstructions, item.recipeInstructions);
              } else {
                console.debug('[DEBUG][jsonld] No recipeInstructions in Recipe object:', item);
              }
              if (typeof item.recipeInstructions === 'string') {
                return item.recipeInstructions;
              } else if (Array.isArray(item.recipeInstructions)) {
                // Sometimes it's an array of steps (strings or objects)
                return item.recipeInstructions.map(step =>
                  typeof step === 'string' ? step : (step.text || step['@value'] || '')
                ).join('\n');
              }
            }
          }
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
      name: 'Fallback: extract visible text from page',
      fn: raw => {
        const plain = htmlUnescape(raw)
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<[^>]+>/g, '\n')
          .replace(/&nbsp;/gi, ' ')
          .replace(/\s+/g, ' ')
          .split('\n')
          .map(line => line.trim())
          .filter(Boolean)
          .slice(0, 12)
          .join('\n');
        return plain || '';
      }
    },
    {
      name: 'Fallback: raw HTML preview (debug)',
      fn: raw => {
        const preview = String(raw || '').trim().slice(0, 500);
        return preview || '';
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
    // Always run all strategies on the original, uncleaned rawData
    stepStrategies = strategies.map(s => {
      const result = normalizeStrategyResult(s.fn(rawData));
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
        <td class='extractor-result' style='color:#333;background:#f8f8ff;min-width:340px;max-width:700px;width:40vw;overflow-x:auto;white-space:pre-wrap;word-break:break-all;'>${s.result ? escapeHtml(s.result) : '<span style="color:#bbb">(no result)</span>'}</td>
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

  function sendInstructionsSolution(recipeId, solution) {
    return fetch('/api/instructions-extractor/solution', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipeId, solution })
    });
  }

  if (autoExtractBtn) {
    autoExtractBtn.addEventListener('click', function () {
      if (!currentRecipeId) {
        alert('Please select a recipe first.');
        return;
      }
      if (!rawData || rawData.length < 100) {
        alert('Raw data not loaded yet. Please wait and try again.');
        return;
      }

      stepStrategies = strategies.map((s, i) => {
        const result = normalizeStrategyResult(s.fn(rawData));
        return {
          name: s.name,
          applied: false,
          result,
          solved: !!result && result !== 'N/A'
        };
      });

      const coreIndices = AUTO_EXTRACT_CORE_STRATEGY_NAMES
        .map(name => stepStrategies.findIndex(s => s.name === name))
        .filter(idx => idx >= 0);
      const solvedCoreIndex = coreIndices.find(idx => stepStrategies[idx].solved);
      autoExtractSolution = solvedCoreIndex !== undefined ? stepStrategies[solvedCoreIndex].result : '';

      if (solvedCoreIndex !== undefined) {
        stepStrategies[solvedCoreIndex].applied = true;
      }

      renderStepTable();

      if (autoExtractResultText) {
        autoExtractResultText.textContent = autoExtractSolution
          ? `First solved result (core controller strategies): ${autoExtractSolution}`
          : 'No solved result found in core controller strategies.';
      }
      if (autoExtractResultBox) autoExtractResultBox.style.display = '';
    });
  }

  if (autoAcceptSendBtn) {
    autoAcceptSendBtn.addEventListener('click', function () {
      if (!currentRecipeId) {
        alert('Please select a recipe.');
        return;
      }
      if (!autoExtractSolution) {
        alert('No auto extract solution available to send.');
        return;
      }

      solutionBox.value = autoExtractSolution;
      sendInstructionsSolution(currentRecipeId, autoExtractSolution)
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
  }

  if (autoDeclineBtn) {
    autoDeclineBtn.addEventListener('click', function () {
      window.location.href = 'extractor_instructions.html';
    });
  }

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
    sendInstructionsSolution(currentRecipeId, solution)
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

// (Removed stray object literal that caused syntax error)
// JS for Ingredients Extractor, modeled after Instructions Extractor

document.addEventListener('DOMContentLoaded', function () {
  console.log('[DEBUG][GLOBAL] extractor_ingredient.js script loaded and DOMContentLoaded fired');
  const recipeSelect = document.getElementById('recipeSelect');
  const startStepBtn = document.getElementById('startStepBtn');

  // --- Move Start Step-by-Step button next to recipe URL input visually ---
  // Create a flex container for the select and button
  let flexDiv = null;
  let loadRawBtn = null;
  if (recipeSelect && startStepBtn) {
    flexDiv = document.createElement('div');
    flexDiv.style.display = 'flex';
    flexDiv.style.alignItems = 'center';
    flexDiv.style.gap = '12px';
    // Create Load Raw Data button
    loadRawBtn = document.createElement('button');
    loadRawBtn.textContent = 'Load Raw Data';
    loadRawBtn.id = 'loadRawBtn';
    // Insert the select and buttons into the flex container
    recipeSelect.parentElement.insertBefore(flexDiv, recipeSelect);
    flexDiv.appendChild(recipeSelect);
    flexDiv.appendChild(loadRawBtn);
    flexDiv.appendChild(startStepBtn);
    // Disable Start Step-by-Step until raw data is loaded
    startStepBtn.disabled = true;
    // Attach event listener for Start Step-by-Step
    console.log('[DEBUG] Attaching event listener to', startStepBtn);
    startStepBtn.addEventListener('click', function () {
      if (startStepBtn.disabled) return;
      console.log('[DEBUG] Start Step-by-Step button clicked');
      stepperContainer.style.display = 'block';
      stepIndex = 0;
      renderStepTable();
      showStepControls();
      showCurrentStep();
      console.log('[DEBUG] Stepper should now be visible. stepIndex:', stepIndex);
    });
  }
  const strategyTable = document.getElementById('strategyTable').getElementsByTagName('tbody')[0];
  const solutionBox = document.getElementById('solutionBox');
  const sendSolutionBtn = document.getElementById('sendSolutionBtn');
  // const showRawBtn = document.getElementById('showRawBtn');
  const rawDataBox = document.getElementById('rawDataBox');

  // --- Add always-visible strategy list ---
  const strategyListDiv = document.createElement('div');
  strategyListDiv.id = 'strategyListDiv';
  strategyListDiv.style.margin = '16px 0 8px 0';
  strategyListDiv.style.padding = '10px 16px';
  strategyListDiv.style.background = '#f8f8f8';
  strategyListDiv.style.border = '1px solid #ddd';
  strategyListDiv.style.borderRadius = '6px';
  strategyListDiv.style.fontSize = '1em';
  strategyListDiv.innerHTML =
    '<b>Ingredient Extraction Strategies (in order):</b>' +
    '<ol style="margin:8px 0 0 20px; padding:0;">' +
      '<li>Hard-coded: Step 1</li>' +
      '<li>Find li tags</li>' +
      '<li>Find ul unordered list</li>' +
      '<li>Find "ingredients" (LIKE/wildcard) near HTML &lt;ul&gt;/&lt;ol&gt; list</li>' +
      '<li>Extract recipeIngredient array from JSON</li>' +
      '<li>Find line with "recipeingredient" (LIKE/wildcard)</li>' +
      '<li>Find "ingredients" (LIKE/wildcard) near comma-separated list</li>' +
      '<li>Look for table</li>' +
      '<li>Extract li from .ingredient-list--content.wysiwyg</li>' +
      '<li>Fallback: Any line</li>' +
      '<li>If none, returns "N/A"</li>' +
    '</ol>';
  // Stepper controls (created once, reused)
  console.log('[DEBUG] DOMContentLoaded: Initializing stepper controls');
  const stepperContainer = document.createElement('div');
  stepperContainer.id = 'stepperContainer';
  stepperContainer.style.margin = '16px 0 0 0';
  stepperContainer.style.display = 'none';
  // Stepper UI elements
  const currentStrategyName = document.createElement('div');
  currentStrategyName.style.fontWeight = 'bold';
  currentStrategyName.style.margin = '8px 0 4px 0';
  const currentStrategyResult = document.createElement('div');
  currentStrategyResult.style.margin = '4px 0 8px 0';
  // Use the Accept Result and Continue buttons from the top of the page
  const acceptResultBtn = document.getElementById('acceptResultBtn');
  const continueBtn = document.getElementById('continueBtn');
  const stepControls = document.createElement('div');
  stepControls.style.margin = '8px 0 0 0';
  // Compose stepper UI
  console.log('[DEBUG] Creating stepperContainer and UI elements');
  stepperContainer.appendChild(currentStrategyName);
  stepperContainer.appendChild(currentStrategyResult);
  stepperContainer.appendChild(stepControls);
  // Insert strategy list and stepper UI after the flex container (input + button)
  // This ensures the input and button are together, then the strategy list, then the stepper UI
  console.log('[DEBUG] Inserting strategyListDiv and stepperContainer into DOM');
  if (flexDiv) {
    flexDiv.parentElement.insertBefore(strategyListDiv, flexDiv.nextSibling);
    strategyListDiv.parentElement.insertBefore(stepperContainer, strategyListDiv.nextSibling);
  } else {
    // fallback: insert after recipeSelect if flexDiv not found
    recipeSelect.parentElement.insertBefore(strategyListDiv, recipeSelect.nextSibling);
    strategyListDiv.parentElement.insertBefore(stepperContainer, strategyListDiv.nextSibling);
  }

  let currentRecipeId = null;
  let rawData = '';

  // Fetch recipes for dropdown
  fetch('/api/recipes')
    .then(res => res.json())
    .then(recipes => {
      recipes.forEach(recipe => {
        const opt = document.createElement('option');
        opt.value = recipe.id;
        opt.textContent = recipe.name;
        recipeSelect.appendChild(opt);
      });
    });

  function updateRawDataBox(val) {
    rawDataBox.value = val || '';
  }

  recipeSelect.addEventListener('change', function () {
    currentRecipeId = recipeSelect.value;
    rawData = '';
    updateRawDataBox(rawData);
    startStepBtn.disabled = true;
  });

  if (loadRawBtn) {
    loadRawBtn.addEventListener('click', function () {
      if (!recipeSelect.value) {
        alert('Please select a recipe.');
        return;
      }
      // Find the selected recipe's uploaded_recipe_id
      fetch('/api/recipes')
        .then(res => res.json())
        .then(recipes => {
          const recipe = recipes.find(r => r.id == recipeSelect.value);
          const fileId = (recipe && recipe.uploaded_recipe_id) ? recipe.uploaded_recipe_id : recipeSelect.value;
          fetch(`/RawDataTXT/${fileId}.txt`)
            .then(res => res.text())
            .then(data => {
              rawData = data;
              updateRawDataBox(rawData);
              startStepBtn.disabled = false;
            });
        });
    });
  }

  let stepIndex = 0;
  let stepStrategies = [
    // 1. Hardcoded (leave as is for now)
    { name: 'Hard-coded: Step 1', applied: false, result: '["Cupcakes", "150g butter, softened (or Olivani Spread)", "1 ½ cups Chelsea Caster Sugar (338g)", "2 eggs ", "2 ½ cups Edmonds Self Raising Flour (375g)", "1 ¼ cups Meadow Fresh Milk (310ml)", "2 tsp vanilla extract ", "Buttercream Icing", "150g butter, softened (or Olivani Spread)", "2 ¼ cups Chelsea Icing Sugar (338g)", "2 Tbsp Meadow Fresh Milk ", "1 ½ tsp vanilla extract", "Raspberries, sugar flowers or sprinkles to decorate"]', solved: false },
    // 2. Find <li> tags (async)
    {
      name: 'Find <li> tags',
      applied: false,
      result: '',
      solved: false,
      run: async function(recipeId) {
        console.log('[DEBUG][Strategy 2] run method invoked with recipeId:', recipeId);
        const res = await fetch(`/api/recipes`);
        const recipes = await res.json();
        const recipe = recipes.find(r => r.id == recipeId);
        const fileId = (recipe && recipe.uploaded_recipe_id) ? recipe.uploaded_recipe_id : recipeId;
        const fetchUrl = `/RawDataTXT/${fileId}.txt`;
        console.log('[DEBUG][Strategy 2] Fetching URL:', fetchUrl);
        const rawRes = await fetch(fetchUrl);
        console.log('[DEBUG][Strategy 2] Response status:', rawRes.status, rawRes.statusText);
        const rawData = await rawRes.text();
        console.log('[DEBUG][Strategy 2] First 500 chars of rawData:', rawData.slice(0, 500));
        // Unescape HTML entities in rawData
        function htmlUnescape(str) {
          const temp = document.createElement('textarea');
          temp.innerHTML = str;
          return temp.value;
        }
        const unescapedData = htmlUnescape(rawData);
        let items = [];
        try {
          // Search for all <li> tags in the entire unescaped file
          const liMatches = [...unescapedData.matchAll(/<li[\s\S]*?>[\s\S]*?<\/li>/gi)];
          items = liMatches.map(m => m[0].trim());
          console.log('[DEBUG][Strategy 2] <li> tags found in entire file:', items.length);
        } catch (e) {
          console.error('[DEBUG][Strategy 2] regex search error:', e);
        }
        return items.length ? JSON.stringify(items) : '';
      }
    },
    // 2a. Find <ul> tags (async)
    {
      name: 'Find <ul> tags',
      applied: false,
      result: '',
      solved: false,
      run: async function(recipeId) {
        console.log('[DEBUG][Strategy 2a] run method invoked with recipeId:', recipeId);
        const res = await fetch(`/api/recipes`);
        const recipes = await res.json();
        const recipe = recipes.find(r => r.id == recipeId);
        const fileId = (recipe && recipe.uploaded_recipe_id) ? recipe.uploaded_recipe_id : recipeId;
        const fetchUrl = `/RawDataTXT/${fileId}.txt`;
        console.log('[DEBUG][Strategy 2a] Fetching URL:', fetchUrl);
        const rawRes = await fetch(fetchUrl);
        console.log('[DEBUG][Strategy 2a] Response status:', rawRes.status, rawRes.statusText);
        const rawData = await rawRes.text();
        console.log('[DEBUG][Strategy 2a] First 500 chars of rawData:', rawData.slice(0, 500));
        // Unescape HTML entities in rawData
        function htmlUnescape(str) {
          const temp = document.createElement('textarea');
          temp.innerHTML = str;
          return temp.value;
        }
        const unescapedData = htmlUnescape(rawData);
        let items = [];
        try {
          const ulMatches = [...unescapedData.matchAll(/<ul[^>]*>([\s\S]*?)<\/ul>/gi)];
          items = ulMatches.map(m => m[1].trim());
          console.log('[DEBUG][Strategy 2a] <ul> tags found in entire file:', items.length);
        } catch (e) {
          console.error('[DEBUG][Strategy 2a] regex search error:', e);
        }
        return items.length ? JSON.stringify(items) : '';
      }
    },
        // 3. Find <li> tags (async, all in file)
        {
          name: 'Find <li> tags (all in file)',
          applied: false,
          result: '',
          solved: false,
          async run(recipeId) {
            console.log('[DEBUG][Strategy 2] run method invoked with recipeId:', recipeId);
            const res = await fetch(`/api/recipes`);
            const recipes = await res.json();
            const recipe = recipes.find(r => r.id == recipeId);
            const fileId = (recipe && recipe.uploaded_recipe_id) ? recipe.uploaded_recipe_id : recipeId;
            const rawRes = await fetch(`/RawDataTXT/${fileId}.txt`);
            const rawData = await rawRes.text();
            // Unescape HTML entities in rawData
            function htmlUnescape(str) {
              const temp = document.createElement('textarea');
              temp.innerHTML = str;
              return temp.value;
            }
            const unescapedData = htmlUnescape(rawData);
            const items = [...unescapedData.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean);
            console.log(`[DEBUG][Strategy 2] <li> matches found:`, items.length);
            return items.length ? JSON.stringify(items) : '';
          }
        },
        // 4. Find 'ingredients' word near HTML list
        {
          name: 'Find "ingredients" (LIKE/wildcard) near HTML ul or ol list',
          applied: false,
          result: (() => {
            if (!rawData) return '';
            const lines = rawData.split(/\n|<br\s*\/?\s*>/i);
            let foundIdx = lines.findIndex(line => /ingredients/i.test(line));
            if (foundIdx === -1) {
              foundIdx = lines.findIndex(line => /\w*ingredients\w*/i.test(line));
            }
            if (foundIdx !== -1) {
              // Look for <ul> or <ol> in the next 8 lines
              for (let i = foundIdx + 1; i < Math.min(lines.length, foundIdx + 9); i++) {
                if (/<ul|<ol/i.test(lines[i])) {
                  const listMatch = rawData.slice(rawData.indexOf(lines[i])).match(/<(ul|ol)[^>]*>([\s\S]*?)<\/\1>/i);
                  if (listMatch) {
                    const items = [...listMatch[2].matchAll(/<li[^>]*>(.*?)<\/li>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim());
                    return items.length ? JSON.stringify(items) : listMatch[2].replace(/<[^>]+>/g, '').trim();
                  }
                }
              }
            }
            return '';
          })(),
          solved: false
        },
        // 5. Find recipeIngredient
        {
          name: 'Extract recipeIngredient array from JSON',
          applied: false,
          result: (() => {
            if (!rawData) return '';
            try {
              const firstBrace = rawData.indexOf('{');
              const lastBrace = rawData.lastIndexOf('}');
              if (firstBrace !== -1 && lastBrace > firstBrace) {
                const jsonStr = rawData.slice(firstBrace, lastBrace + 1);
                const obj = JSON.parse(jsonStr);
                if (obj.recipeIngredient && Array.isArray(obj.recipeIngredient)) {
                  return JSON.stringify(obj.recipeIngredient);
                }
              }
            } catch (e) {}
            const match = rawData.match(/"recipeIngredient"\s*:\s*(\[[^\]]*\])/i);
            if (match) {
              try {
                const arr = JSON.parse(match[1]);
                if (Array.isArray(arr)) return JSON.stringify(arr);
              } catch {}
            }
            return '';
          })(),
          solved: false
        },
        // 6. Find line with 'recipeingredient' (LIKE/wildcard)
        {
          name: 'Find line with "recipeingredient" (LIKE/wildcard)',
          applied: false,
          result: (() => {
            if (!rawData) return '';
            const lines = rawData.split(/\n|<br\s*\/?\s*>/i);
            const foundLine = lines.find(line => /recipeingredient/i.test(line));
            return foundLine ? foundLine.trim() : '';
          })(),
          solved: false
        },
        // 7. Find 'ingredients' (LIKE/wildcard) near comma-separated list
        {
          name: 'Find "ingredients" (LIKE/wildcard) near comma-separated list',
          applied: false,
          result: (() => {
            if (!rawData) return '';
            const lines = rawData.split(/\n|<br\s*\/?\s*>/i);
            let foundIdx = lines.findIndex(line => /ingredients/i.test(line));
            if (foundIdx === -1) {
              foundIdx = lines.findIndex(line => /\w*ingredients\w*/i.test(line));
            }
            if (foundIdx !== -1) {
              for (let i = foundIdx + 1; i < Math.min(lines.length, foundIdx + 9); i++) {
                const jsonMatch = lines[i].match(/\[.*?\]/);
                if (jsonMatch) {
                  try {
                    const arr = JSON.parse(jsonMatch[0]);
                    if (Array.isArray(arr)) return JSON.stringify(arr);
                  } catch {}
                }
                if (lines[i].split(',').length > 2) {
                  const items = lines[i].split(',').map(s => s.replace(/^[\s"']+|[\s"']+$/g, ''));
                  if (items.length > 2) return JSON.stringify(items);
                }
              }
            }
            return '';
          })(),
          solved: false
        },
        // 8. Look for table
        { name: 'Look for table', applied: false, result: '', solved: false },
        // 9. Extract <li> from .ingredient-list--content.wysiwyg
        {
          name: 'Extract <li> from .ingredient-list--content.wysiwyg',
          fn: raw => {
            const divMatch = raw.match(/<div[^>]*class=["'][^"']*ingredient-list--content wysiwyg[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
            let html = divMatch ? divMatch[1] : raw;
            const items = [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean);
            return items.length ? items : '';
          }
        },
        // 10. Fallback: Any line
        { name: 'Fallback: Any line', applied: false, result: '', solved: false },
        // 11. If none, returns "N/A"
      { name: 'If none, returns "N/A"', applied: false, result: '', solved: false },
      {
        name: 'Extract li from .ingredient-list--content.wysiwyg',
        applied: false,
        result: (() => {
          if (!rawData) return '';
          const divMatch = rawData.match(/<div[^>]*class=["'][^"']*ingredient-list--content wysiwyg[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
          let html = divMatch ? divMatch[1] : rawData;
          const items = [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean);
          return items.length ? JSON.stringify(items) : '';
        })(),
        solved: false
      }
    ];

  console.log('[DEBUG][GLOBAL] stepStrategies defined:', stepStrategies.map(s => s.name));
  function renderStepTable() {
    console.log('[DEBUG] renderStepTable called');
    strategyTable.innerHTML = '';
    stepStrategies.forEach((s, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${s.name}</td>
        <td>${s.applied ? '✓' : '—'}</td>
        <td>${s.result ? `<span style='font-size:0.95em;'>${s.result}</span>` : '<span style="color:#aaa;">(no result)</span>'}</td>
        <td>${s.solved ? '✓' : '✗'}</td>
      `;
      strategyTable.appendChild(tr);
    });
  }
  function showStepControls() {
    console.log('[DEBUG] showStepControls called');
    stepControls.style.display = 'block';
    showCurrentStep();
  }
  async function showCurrentStep() {
    console.log('[DEBUG][showCurrentStep] called, stepIndex:', stepIndex);
    if (stepIndex < 0 || stepIndex >= stepStrategies.length) return;
    const step = stepStrategies[stepIndex];
    console.log('[DEBUG][showCurrentStep] current step object:', step);
    currentStrategyName.textContent = step.name;
    // Always execute and await the run method if present, for every strategy
    if (typeof step.run === 'function') {
      currentStrategyResult.textContent = 'Loading...';
      try {
        step.result = await step.run(currentRecipeId);
      } catch (e) {
        step.result = '';
        console.error('[DEBUG] Error running strategy', step.name, e);
      }
    }
    currentStrategyResult.textContent = step.result || '(no result)';
    acceptResultBtn.style.display = '';
    continueBtn.style.display = stepIndex < stepStrategies.length - 1 ? '' : 'none';
  }


  // Only one set of event listeners for stepper buttons
  acceptResultBtn.addEventListener('click', function () {
    console.log('[DEBUG] Accept Result button clicked, stepIndex:', stepIndex);
    if (stepIndex < 0 || stepIndex >= stepStrategies.length) return;
    stepStrategies[stepIndex].applied = true;
    stepStrategies[stepIndex].solved = true;
    if (stepStrategies[stepIndex].result) {
      solutionBox.value = stepStrategies[stepIndex].result;
    }
    renderStepTable();
    showCurrentStep();
  });
  continueBtn.addEventListener('click', function () {
    console.log('[DEBUG] Continue button clicked, stepIndex:', stepIndex);
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
    let solution = solutionBox.value.trim();
    // Clean up: remove bullet points, text boxes, and borders
    // Remove common bullet characters and leading whitespace
    solution = solution.replace(/^\s*[-•*\u2022\u25CF\u25A0]+\s*/gm, '');
    // Remove any input boxes (if HTML remains)
    solution = solution.replace(/<input[^>]*>/gi, '');
    // Remove visible box drawing characters (rare, but for safety)
    solution = solution.replace(/[\u2500-\u257F]/g, '');
    // Remove extra borders (if any left as text)
    solution = solution.replace(/border(:|=)[^;\n]+[;\n]?/gi, '');
    // Remove any remaining empty lines
    solution = solution.replace(/^\s*\n/gm, '');
    if (!solution) {
      alert('Please enter a solution.');
      return;
    }
    fetch('/api/ingredients-extractor/solution', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipeId: currentRecipeId, solution })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          alert('Solution sent and record amended!');
        } else {
          alert('Failed to send solution.');
        }
      })
      .catch(() => alert('Failed to send solution.'));
  });
});

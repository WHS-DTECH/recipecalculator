// (Removed stray object literal that caused syntax error)
// JS for Ingredients Extractor, modeled after Instructions Extractor

document.addEventListener('DOMContentLoaded', function () {
    // Populate recipe dropdown
    fetch('/api/recipes')
      .then(res => res.json())
      .then(recipes => {
        console.log('[DEBUG][Dropdown] Recipes loaded:', recipes);
        recipes.forEach(recipe => {
          const opt = document.createElement('option');
          opt.value = recipe.id;
          opt.setAttribute('data-recipeid', recipe.id);
          // Show both URL and RecipeID in the dropdown
          opt.textContent = `${recipe.url || recipe.name} [ID: ${recipe.id}]`;
          recipeSelect.appendChild(opt);
        });
        console.log('[DEBUG][Dropdown] Options:', Array.from(recipeSelect.options).map(o => ({value: o.value, text: o.textContent, dataRecipeId: o.getAttribute('data-recipeid')})));
      });
  console.log('[DEBUG][GLOBAL] extractor_ingredient.js script loaded and DOMContentLoaded fired');
  const recipeSelect = document.getElementById('recipeSelect');
  const startStepBtn = document.getElementById('startStepBtn');

  // --- Show Extraction Strategies List under Title ---
  const strategiesList = [
    'Hard-coded: Step 1',
    'Find <li> tags',
    'Find <ul> tags (all in file)',
    'Find "ingredients" (LIKE/wildcard) near HTML ul or ol list',
    'Extract recipeIngredient array from JSON',
    'Find line with "recipeIngredient" (LIKE/wildcard)',
    'Find "ingredients" (LIKE/wildcard) near comma-separated list',
    'Look for label',
    'Extract it from ingredient-list--content-wysiwyg',
    'Fallback Any line',
    'If none, returns "N/A"'
  ];
  const titleHeading = document.querySelector('h2');
  if (titleHeading) {
    const ul = document.createElement('ul');
    ul.style.marginTop = '8px';
    ul.style.marginBottom = '16px';
    strategiesList.forEach(str => {
      const li = document.createElement('li');
      li.textContent = str;
      ul.appendChild(li);
    });
    titleHeading.parentElement.insertBefore(ul, titleHeading.nextSibling);
  }
  // Create a flex container for the select and button
  let flexDiv = null;
  let loadRawBtn = null;
  let rawData = '';
  const rawDataBox = document.querySelector('textarea[placeholder="Raw Data (HTML/Text)"]') || document.querySelector('textarea');
  // Ensure currentRecipeId is always in scope for all handlers
  let currentRecipeId = null;
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

    // Load Raw Data button event handler
    loadRawBtn.addEventListener('click', async function () {
      // Use RecipeID for file naming and access
      const selectedOption = recipeSelect.options[recipeSelect.selectedIndex];
      const recipeId = selectedOption && (selectedOption.getAttribute('data-recipeid') || selectedOption.value);
      console.log('[DEBUG][LoadRawData] Clicked. Selected option:', selectedOption ? selectedOption.textContent : '(none)', 'RecipeID:', recipeId);
      if (!recipeId) {
        alert('Please select a recipe.');
        return;
      }
      const fetchUrl = `/RawDataTXT/${recipeId}.txt`;
      console.log('[DEBUG][LoadRawData] Fetching URL:', fetchUrl);
      try {
        const res = await fetch(fetchUrl);
        console.log('[DEBUG][LoadRawData] Response status:', res.status);
        if (!res.ok) {
          const text = await res.text();
          console.log('[DEBUG][LoadRawData] Response not OK. Status:', res.status, 'Body:', text);
          throw new Error('Failed to fetch raw data');
        }
        rawData = await res.text();
        console.log('[DEBUG][LoadRawData] Raw data loaded:', rawData.slice(0, 200));
        // Ensure raw data goes to the correct textarea
        // Find the Raw Data textarea by its label or placeholder
        const rawDataTextarea = document.querySelector('textarea[placeholder="Raw Data (HTML/Text)"]') || document.querySelectorAll('textarea')[1];
        if (rawDataTextarea) rawDataTextarea.value = rawData;
        startStepBtn.disabled = false;
      } catch (e) {
        console.error('[DEBUG][LoadRawData] Error:', e);
        alert('Failed to load raw data.');
        startStepBtn.disabled = true;
      }
    });

    // Attach event listener for Start Step-by-Step
    const stepControls = document.getElementById('stepControls');
    const strategyTable = document.getElementById('strategyTable');
    const currentStrategyName = document.getElementById('currentStrategyName');
    const currentStrategyResult = document.getElementById('currentStrategyResult');
    const acceptResultBtn = document.getElementById('acceptResultBtn');
    const continueBtn = document.getElementById('continueBtn');
    const solutionBox = document.getElementById('solutionBox');
    const sendSolutionBtn = document.getElementById('sendSolutionBtn');
    let currentRecipeId = null;

    // Start Step-by-Step button handler
    startStepBtn.addEventListener('click', function () {
      currentRecipeId = recipeSelect.value;
      if (!currentRecipeId) {
        alert('Please select a recipe.');
        return;
      }
      stepIndex = 0;
      // Show step controls and render table
      if (stepControls) stepControls.style.display = 'block';
      if (strategyTable) strategyTable.style.display = '';
      renderStepTable();
      showCurrentStep();
    });

    stepStrategies = [
      { name: 'Hard-coded: Step 1', applied: false, result: '["Cupcakes", "150g butter, softened (or Olivani Spread)", "1 ½ cups Chelsea Caster Sugar (338g)", "2 eggs ", "2 ½ cups Edmonds Self Raising Flour (375g)", "1 ¼ cups Meadow Fresh Milk (310ml)", "2 tsp vanilla extract ", "Buttercream Icing", "150g butter, softened (or Olivani Spread)", "2 ¼ cups Chelsea Icing Sugar (338g)", "2 Tbsp Meadow Fresh Milk ", "1 ½ tsp vanilla extract", "Raspberries, sugar flowers or sprinkles to decorate"]', solved: false },
      {
        name: 'Find li tags',
        applied: false,
        result: '',
        solved: false,
        run: async function(recipeId) {
          const fileText = rawData;
          const matches = [...fileText.matchAll(/<li[^>]*>(.*?)<\/li>/gi)];
          this.result = matches.map(m => m[1].trim()).filter(Boolean);
          this.applied = true;
          this.solved = !!this.result.length;
          return this.result;
        }
      },
      {
        name: 'Find ul tags (all in file)',
        applied: false,
        result: '',
        solved: false,
        run: async function(recipeId) {
          const fileText = rawData;
          const matches = [...fileText.matchAll(/<ul[^>]*>([\s\S]*?)<\/ul>/gi)];
          this.result = matches.map(m => m[1].trim()).filter(Boolean);
          this.applied = true;
          this.solved = !!this.result.length;
          return this.result;
        }
      },
      {
        name: 'Find "ingredients" (LIKE/wildcard) near HTML ul or ol list',
        applied: false,
        result: '',
        solved: false,
        run: async function(recipeId) {
          const fileText = rawData;
          this.result = fileText.includes('ingredients') ? ['Found ingredients'] : [];
          this.applied = true;
          this.solved = !!this.result.length;
          return this.result;
        }
      },
      {
        name: 'Extract recipeIngredient array from JSON',
        applied: false,
        result: '',
        solved: false,
        run: async function(recipeId) {
          const fileText = rawData;
          const match = fileText.match(/"recipeIngredient"\s*:\s*(\[[\s\S]*?\])/);
          this.result = match ? [match[1]] : [];
          this.applied = true;
          this.solved = !!this.result.length;
          return this.result;
        }
      },
      {
        name: 'Find line with "recipeIngredient" (LIKE/wildcard)',
        applied: false,
        result: '',
        solved: false,
        run: async function(recipeId) {
          const fileText = rawData;
          const lines = fileText.split('\n');
          this.result = lines.filter(line => line.includes('recipeIngredient'));
          this.applied = true;
          this.solved = !!this.result.length;
          return this.result;
        }
      },
      {
        name: 'Find "ingredients" (LIKE/wildcard) near comma-separated list',
        applied: false,
        result: '',
        solved: false,
        run: async function(recipeId) {
          const fileText = rawData;
          this.result = fileText.includes('ingredients') ? ['Found comma-separated ingredients'] : [];
          this.applied = true;
          this.solved = !!this.result.length;
          return this.result;
        }
      },
      {
        name: 'Look for label',
        applied: false,
        result: '',
        solved: false,
        run: async function(recipeId) {
          const fileText = rawData;
          this.result = fileText.includes('label') ? ['Found label'] : [];
          this.applied = true;
          this.solved = !!this.result.length;
          return this.result;
        }
      },
      {
        name: 'Extract it from ingredient-list--content-wysiwyg',
        applied: false,
        result: '',
        solved: false,
        run: async function(recipeId) {
          const fileText = rawData;
          this.result = fileText.includes('ingredient-list--content-wysiwyg') ? ['Found wysiwyg'] : [];
          this.applied = true;
          this.solved = !!this.result.length;
          return this.result;
        }
      },
      {
        name: 'Fallback Any line',
        applied: false,
        result: '',
        solved: false,
        run: async function(recipeId) {
          const fileText = rawData;
          const lines = fileText.split('\n');
          this.result = lines;
          this.applied = true;
          this.solved = !!this.result.length;
          return this.result;
        }
      },
      {
        name: 'If none, returns "N/A"',
        applied: false,
        result: '',
        solved: false,
        run: async function(recipeId) {
          this.result = ['N/A'];
          this.applied = true;
          this.solved = true;
          return this.result;
        }
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
  }

  sendSolutionBtn.addEventListener('click', function () {
    // Debugging: Log currentRecipeId and recipeSelect
    console.log('[SEND SOLUTION] currentRecipeId:', typeof currentRecipeId, currentRecipeId);
    console.log('[SEND SOLUTION] recipeSelect:', recipeSelect ? recipeSelect.value : '(no select)');
    let recipeIdToSend = null;
    if (typeof currentRecipeId !== 'undefined' && currentRecipeId) {
      recipeIdToSend = currentRecipeId;
    } else if (recipeSelect && recipeSelect.value) {
      recipeIdToSend = recipeSelect.value;
    }
    if (!recipeIdToSend) {
      alert('Please select a recipe. [Debug: recipeIdToSend not found]');
      return;
    }
    let solution = solutionBox.value.trim();
    console.log('[SEND SOLUTION] recipeIdToSend:', recipeIdToSend, 'solution:', solution);
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
      body: JSON.stringify({ recipeId: recipeIdToSend, solution })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          alert('✅ Solution sent and record amended!');
        } else {
          alert('❌ Failed to send solution.');
        }
      })
      .catch((err) => {
        alert('❌ Failed to send solution.');
        console.error('[SendSolution] Error:', err);
      });
  });
});

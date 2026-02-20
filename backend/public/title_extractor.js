
// JS for Recipe Name (Title) Extractor, modeled after other extractors
document.addEventListener('DOMContentLoaded', function () {
  const recipeSelect = document.getElementById('recipeSelect');
  // Use the correct button ID as in the HTML
  const startStepBtn = document.getElementById('startStepByStepBtn');
  const solutionBox = document.getElementById('solutionBox');
  const sendSolutionBtn = document.getElementById('sendSolutionBtn');
  const rawDataBox = document.getElementById('rawDataBox');
  const stepControls = document.getElementById('stepControls');
  const acceptResultBtn = document.getElementById('acceptResultBtn');
  const continueBtn = document.getElementById('continueBtn');
  let currentRecipeId = null;
  let rawData = '';
  let stepStrategies = [];
  let stepIndex = 0;

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

  function runAllStrategiesAndUpdateUI() {
    console.log('[DEBUG] Running all strategies');
    console.log('[DEBUG] rawData:', rawData);
    stepStrategies = strategies.map(s => {
      const result = s.fn(rawData);
      console.log(`[DEBUG] Strategy: ${s.name}, Result:`, result);
      return {
        name: s.name,
        result,
        applied: false,
        solved: false
      };
    });
    stepIndex = 0;
    console.log('[DEBUG] stepStrategies:', stepStrategies);
    renderStepTable();
    updateStepControls();
  }

  recipeSelect.addEventListener('change', function () {
    currentRecipeId = recipeSelect.value;
    if (!currentRecipeId) {
      rawData = '';
      updateRawDataBox(rawData);
      stepStrategies = [];
      stepIndex = 0;
      renderStepTable();
      updateStepControls();
      return;
    }
    fetch('/api/recipes')
      .then(res => res.json())
      .then(recipes => {
        const recipe = recipes.find(r => r.id == currentRecipeId);
        const fileId = (recipe && recipe.uploaded_recipe_id) ? recipe.uploaded_recipe_id : currentRecipeId;
        fetch(`/RawDataTXT/${fileId}.txt`)
          .then(res => res.ok ? res.text() : '')
          .then(text => {
            rawData = text || '';
            updateRawDataBox(rawData);
            runAllStrategiesAndUpdateUI();
          });
      });
  });

  // On page load, if a recipe is already selected, load its data and run strategies
  if (recipeSelect.value) {
    currentRecipeId = recipeSelect.value;
    fetch('/api/recipes')
      .then(res => res.json())
      .then(recipes => {
        const recipe = recipes.find(r => r.id == currentRecipeId);
        const fileId = (recipe && recipe.uploaded_recipe_id) ? recipe.uploaded_recipe_id : currentRecipeId;
        fetch(`/RawDataTXT/${fileId}.txt`)
          .then(res => res.ok ? res.text() : '')
          .then(text => {
            rawData = text || '';
            updateRawDataBox(rawData);
            runAllStrategiesAndUpdateUI();
          });
      });
  }

  // ...existing code...

  // Define strategies for extracting the recipe name
  const strategies = [
    {
      name: 'Look for <title> tag',
      fn: raw => {
        const match = raw.match(/<title[^>]*>([^<]*)<\/title>/i);
        return match ? match[1].trim() : '';
      }
    },
    {
      name: 'Look for <h1> tag',
      fn: raw => {
        const match = raw.match(/<h1[^>]*>([^<]*)<\/h1>/i);
        return match ? match[1].trim() : '';
      }
    },
    {
      name: 'Look for JSON-LD Recipe name',
      fn: raw => {
        // Find <script type="application/ld+json"> blocks
        const scripts = [...raw.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
        for (const script of scripts) {
          try {
            const json = JSON.parse(script[1]);
            // If it's an array, look for Recipe type
            if (Array.isArray(json)) {
              for (const obj of json) {
                if (obj['@type'] === 'Recipe' && obj.name) return obj.name;
              }
            } else if (json['@type'] === 'Recipe' && json.name) {
              return json.name;
            }
          } catch (e) { /* ignore parse errors */ }
        }
        // Fallback: try to find '"@type"\s*:\s*"Recipe"' and '"name"\s*:\s*"..."' in text
        const recipeBlock = raw.match(/\{[^\}]*"@type"\s*:\s*"Recipe"[^\}]*\}/);
        if (recipeBlock) {
          const nameMatch = recipeBlock[0].match(/"name"\s*:\s*"([^"]+)"/);
          if (nameMatch) return nameMatch[1];
        }
        return '';
      }
    },
    {
      name: 'First non-empty line',
      fn: raw => {
        const lines = raw.split(/\n|<br\s*\/\?\s*>/i);
        const found = lines.find(line => line.trim().length > 0);
        return found ? found.trim() : '';
      }
    },
    {
      name: 'Fallback: Any text before <body>',
      fn: raw => {
        const match = raw.match(/([\s\S]*?)<body/i);
        return match ? match[1].replace(/<[^>]+>/g, '').trim() : '';
      }
    }
  ];

  function renderStepTable() {
    const tbody = document.getElementById('titleExtractorTableBody');
    console.log('[DEBUG] Rendering table, stepStrategies:', stepStrategies);
    tbody.innerHTML = stepStrategies.map((s, i) => `
      <tr${i === stepIndex ? " style='background:#e3f2fd;'" : ''}>
        <td>${s.name}</td>
        <td>${s.applied ? '✓' : '—'}</td>
        <td class='extractor-result'>${s.result ? s.result : '<span style=\"color:#bbb\">(no result)</span>'}</td>
        <td>${s.solved ? "<span class='extractor-status'>✔</span>" : "<span class='extractor-status unsolved'>✗</span>"}</td>
      </tr>
    `).join('');
  }

  function runStrategies() {
    stepStrategies = strategies.map(s => ({
      name: s.name,
      result: s.fn(rawData),
      applied: false,
      solved: false
    }));
    stepIndex = 0;
    renderStepTable();
    showStep(stepIndex);
  }


  // Always show step controls and update them
  function updateStepControls() {
    const nameDiv = document.getElementById('currentStrategyName');
    const resultDiv = document.getElementById('currentStrategyResult');
    if (!stepStrategies.length) {
      nameDiv.textContent = 'No strategy selected.';
      resultDiv.textContent = '';
      return;
    }
    const s = stepStrategies[stepIndex];
    nameDiv.innerHTML = `<b>Current Strategy:</b> ${s.name}`;
    resultDiv.innerHTML = s.result ? `<b>Result:</b> ${s.result}` : '<span style="color:#bbb">(no result)</span>';
  }

  startStepBtn.addEventListener('click', function () {
    if (!currentRecipeId) {
      alert('Please select a recipe.');
      return;
    }
    // Re-run strategies to reset stepper and table
    stepStrategies = strategies.map(s => ({
      name: s.name,
      result: s.fn(rawData),
      applied: false,
      solved: false
    }));
    stepIndex = 0;
    renderStepTable();
    updateStepControls();
  });

  acceptResultBtn.addEventListener('click', function () {
    if (!stepStrategies.length) return;
    stepStrategies[stepIndex].applied = true;
    stepStrategies[stepIndex].solved = !!stepStrategies[stepIndex].result;
    solutionBox.value = stepStrategies[stepIndex].result || '';
    renderStepTable();
    updateStepControls();
  });

  continueBtn.addEventListener('click', function () {
    if (stepIndex < stepStrategies.length - 1) {
      stepIndex++;
      renderStepTable();
      updateStepControls();
    }
  });

  // When strategies are run, update controls
  function runStrategies() {
    stepStrategies = strategies.map(s => ({
      name: s.name,
      result: s.fn(rawData),
      applied: false,
      solved: false
    }));
    stepIndex = 0;
    renderStepTable();
    updateStepControls();
  }

  // When recipe changes, clear step controls
  recipeSelect.addEventListener('change', function () {
    // ...existing code...
    stepStrategies = [];
    stepIndex = 0;
    updateStepControls();
  });

  // On page load, show initial step controls
  updateStepControls();

function showStep(index) {
  solutionBox.value = stepStrategies[index].result || '';
  stepControls.style.display = 'block';
}

// Hook up SEND SOLUTION button
sendSolutionBtn.addEventListener('click', function () {
    if (!currentRecipeId) {
      alert('Please select a recipe.');
      return;
    }
    const solution = solutionBox.value.trim();
    if (!solution) {
      alert('No solution to save.');
      return;
    }
    fetch('/api/title-extractor/solution', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipeId: currentRecipeId, solution })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          alert('Title saved!');
        } else {
          alert('Failed to save title.');
        }
      })
      .catch(() => alert('Error saving title.'));
  });
});

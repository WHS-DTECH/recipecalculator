// calculate_qty.js
// Fetches and displays the ingredients_inventory table as 'Ingredients List'
document.addEventListener('DOMContentLoaded', function() {
  const syncedRecipeFilterKey = 'calculateQtySyncedRecipeId';
  let allPublishedRecipes = [];

  function fetchIngredientsInventory() {
    return fetch(`/api/ingredients/inventory/all?_t=${Date.now()}`, { cache: 'no-store' })
      .then(res => res.json())
      .then(data => {
        if (!data.success) throw new Error(data.error || 'Failed to fetch ingredients');
        return data.data || [];
      });
  }

  // Sync Quantity button handler
  const syncBtn = document.getElementById('sync-quantity-btn');
  if (syncBtn) {
    syncBtn.onclick = function() {
      const defaultRecipeId = (document.getElementById('filter-recipe-id')?.value || '').trim();
      const recipeIdInput = prompt('Which RecipeID do you want to sync?', defaultRecipeId);
      if (recipeIdInput === null) return;
      const recipeId = recipeIdInput.trim();
      if (!recipeId) {
        alert('Please enter a RecipeID to sync.');
        return;
      }

      syncBtn.disabled = true;
      syncBtn.textContent = 'Syncing...';
      fetch('/api/ingredients/inventory/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipeId, reseed: true })
      })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            sessionStorage.setItem(syncedRecipeFilterKey, recipeId);
            alert('Quantity sync complete for RecipeID ' + recipeId + '! Updated: ' + data.updated);
            location.reload();
          } else {
            alert('Sync failed: ' + (data.error || 'Unknown error'));
          }
        })
        .catch(err => alert('Sync failed: ' + err.message))
        .finally(() => {
          syncBtn.disabled = false;
          syncBtn.textContent = 'Sync Quantity';
        });
    };
  }

  const asyncSyncBtn = document.getElementById('async-sync-btn');
  const asyncSyncStatus = document.getElementById('async-sync-status');
  if (asyncSyncBtn) {
    asyncSyncBtn.onclick = async function() {
      const startInput = prompt('Sync from which RecipeID onward?', '7');
      if (startInput === null) return;
      const startRecipeId = Number(String(startInput).trim());
      if (!Number.isInteger(startRecipeId) || startRecipeId <= 0) {
        alert('Please enter a valid numeric RecipeID.');
        return;
      }

      asyncSyncBtn.disabled = true;
      asyncSyncBtn.textContent = 'Async Syncing...';
      if (asyncSyncStatus) asyncSyncStatus.textContent = 'Loading recipe list...';

      try {
        const dropdownResp = await fetch('/api/recipes/display-dropdown');
        const dropdownData = await dropdownResp.json();
        const recipes = Array.isArray(dropdownData?.recipes) ? dropdownData.recipes : [];
        const recipeIds = recipes
          .map(r => Number(r.recipeid))
          .filter(id => Number.isInteger(id) && id >= startRecipeId)
          .sort((a, b) => a - b);

        if (!recipeIds.length) {
          alert('No recipes found from RecipeID ' + startRecipeId + ' onward.');
          return;
        }

        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < recipeIds.length; i++) {
          const recipeId = recipeIds[i];
          if (asyncSyncStatus) {
            asyncSyncStatus.textContent = `Syncing ${i + 1}/${recipeIds.length} (RecipeID ${recipeId})...`;
          }

          try {
            const resp = await fetch('/api/ingredients/inventory/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ recipeId, reseed: true })
            });
            const data = await resp.json();
            if (resp.ok && data.success) successCount++;
            else failCount++;
          } catch {
            failCount++;
          }
        }

        if (asyncSyncStatus) {
          asyncSyncStatus.textContent = `Done. Success: ${successCount}, Failed: ${failCount}`;
        }

        const finalRecipeId = String(recipeIds[recipeIds.length - 1]);
        sessionStorage.setItem(syncedRecipeFilterKey, finalRecipeId);
        location.reload();
      } catch (err) {
        alert('Async sync failed: ' + (err?.message || err));
        if (asyncSyncStatus) asyncSyncStatus.textContent = 'Async sync failed.';
      } finally {
        asyncSyncBtn.disabled = false;
        asyncSyncBtn.textContent = 'Async Sync (From RecipeID)';
      }
    };
  }
  // Populate recipe filter dropdown and ingredients table
  Promise.all([
    fetchIngredientsInventory(),
    fetch('/api/recipes/display-dropdown').then(res => res.json())
  ])
    .then(([ingredients, recipesData]) => {
      const recipes = (recipesData && recipesData.recipes) ? recipesData.recipes : [];
      const sortedRecipes = [...recipes].sort((a, b) => {
        const aId = Number(a.recipeid || a.id) || 0;
        const bId = Number(b.recipeid || b.id) || 0;
        if (aId !== bId) return aId - bId;
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
      const pendingRecipeId = sessionStorage.getItem(syncedRecipeFilterKey) || '';
      const filterDiv = document.getElementById('ingredients-recipe-filter');
      if (filterDiv) {
        let html = '<label for="filter-recipe-id" style="margin-right:8px;">Filter by Recipe:</label>';
        html += '<select id="filter-recipe-id" class="w3-select" style="width:auto;display:inline-block;margin-right:8px;">';
        html += '<option value="">-- Show All Recipes --</option>';
        for (const rec of sortedRecipes) {
          html += `<option value="${rec.recipeid || rec.id}">${rec.recipeid ? rec.recipeid + ' - ' : ''}${rec.name} (DB ID: ${rec.id})</option>`;
        }
        html += '</select>';
        html += '<button id="filter-ingredients-btn" class="w3-button w3-blue w3-small">Filter</button>';
        filterDiv.innerHTML = html;
        if (pendingRecipeId) {
          document.getElementById('filter-recipe-id').value = pendingRecipeId;
          sessionStorage.removeItem(syncedRecipeFilterKey);
        }
        document.getElementById('filter-ingredients-btn').onclick = function() {
          const selectedRecipeId = document.getElementById('filter-recipe-id').value;
          fetchIngredientsInventory()
            .then(freshIngredients => {
              renderIngredientsTable(freshIngredients, selectedRecipeId);
              renderPublishedRecipesTable(allPublishedRecipes, selectedRecipeId);
            })
            .catch(err => {
              const tableDiv = document.getElementById('ingredients-list-table');
              if (tableDiv) tableDiv.innerHTML = `<div class="w3-panel w3-red">Error: ${err.message}</div>`;
            });
        };
      }
      renderIngredientsTable(ingredients, pendingRecipeId || '');
    })
    .catch(err => {
      const tableDiv = document.getElementById('ingredients-list-table');
      if (tableDiv) tableDiv.innerHTML = `<div class="w3-panel w3-red">Error: ${err.message}</div>`;
    });

  // Fetch and render published recipes table
  fetch('/api/recipes/display-table')
    .then(res => res.json())
    .then(data => {
      allPublishedRecipes = Array.isArray(data) ? data : [];
      const selectedRecipeId = document.getElementById('filter-recipe-id')?.value || '';
      renderPublishedRecipesTable(allPublishedRecipes, selectedRecipeId);
    })
    .catch(err => {
      const tableDiv = document.getElementById('published-recipes-table');
      if (tableDiv) tableDiv.innerHTML = `<div class="w3-panel w3-red">Error: ${err.message}</div>`;
    });

  function renderIngredientsTable(ingredients, filterRecipeId) {
    const tableDiv = document.getElementById('ingredients-list-table');
    if (!tableDiv) return;
    let filtered = ingredients;
    if (filterRecipeId) {
      filtered = ingredients.filter(ing => String(ing.recipe_id) === String(filterRecipeId));
    }
    let html = '<table class="w3-table-all w3-small w3-hoverable"><thead><tr>' +
      '<th>ID</th><th>Ingredient Name</th><th>Recipe ID</th><th>Measure Qty</th><th>Measure Unit</th><th>Food Item</th>' +
      '</tr></thead><tbody>';
    if (filtered.length === 0) {
      html += '<tr><td colspan="6" class="w3-center w3-text-grey">No ingredients found for this RecipeID.</td></tr>';
    } else {
      for (const ing of filtered) {
        html += `<tr><td>${ing.id || ''}</td><td>${ing.ingredient_name || ''}</td><td>${ing.recipe_id || ''}</td><td>${ing.measure_qty || ''}</td><td>${ing.measure_unit || ''}</td><td>${ing.fooditem || ''}</td></tr>`;
      }
    }
    html += '</tbody></table>';
    tableDiv.innerHTML = html;
  }

  function renderPublishedRecipesTable(recipes, filterRecipeId = '') {
    const tableDiv = document.getElementById('published-recipes-table');
    if (!tableDiv) return;
    if (!recipes || !Array.isArray(recipes) || recipes.length === 0) {
      tableDiv.innerHTML = '<div class="w3-text-grey">No published recipes found.</div>';
      return;
    }

    let filteredRecipes = recipes;
    if (filterRecipeId) {
      filteredRecipes = recipes.filter(rec => String(rec.recipeid) === String(filterRecipeId));
    }

    if (!filteredRecipes.length) {
      tableDiv.innerHTML = '<div class="w3-text-grey">No published recipes found for this RecipeID.</div>';
      return;
    }

    let html = '<table class="w3-table-all w3-small w3-hoverable"><thead><tr>' +
      '<th>ID</th><th>RecipeID</th><th>Name</th><th>Description</th><th>Ingredients</th><th>Serving Size</th><th>URL</th><th>Instructions</th>' +
      '</tr></thead><tbody>';
    for (const rec of filteredRecipes) {
      html += `<tr><td>${rec.id || ''}</td><td>${rec.recipeid || ''}</td><td>${rec.name || ''}</td><td>${rec.description || ''}</td><td>${rec.ingredients || ''}</td><td>${rec.serving_size || ''}</td><td>${rec.url || ''}</td><td>${rec.instructions || ''}</td></tr>`;
    }
    html += '</tbody></table>';
    tableDiv.innerHTML = html;
  }
});

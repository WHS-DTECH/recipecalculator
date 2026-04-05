// calculate_qty.js
// Fetches and displays the ingredients_inventory table as 'Ingredients List'
document.addEventListener('DOMContentLoaded', function() {
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
        body: JSON.stringify({ recipeId })
      })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
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
  // Populate recipe filter dropdown and ingredients table
  Promise.all([
    fetch('/api/ingredients/inventory/all').then(res => res.json()),
    fetch('/api/recipes/display-dropdown').then(res => res.json())
  ])
    .then(([ingredientsData, recipesData]) => {
      if (!ingredientsData.success) throw new Error(ingredientsData.error || 'Failed to fetch ingredients');
      const ingredients = ingredientsData.data || [];
      const recipes = (recipesData && recipesData.recipes) ? recipesData.recipes : [];
      const filterDiv = document.getElementById('ingredients-recipe-filter');
      if (filterDiv) {
        let html = '<label for="filter-recipe-id" style="margin-right:8px;">Filter by Recipe:</label>';
        html += '<select id="filter-recipe-id" class="w3-select" style="width:auto;display:inline-block;margin-right:8px;">';
        html += '<option value="">-- Show All Recipes --</option>';
        for (const rec of recipes) {
          html += `<option value="${rec.recipeid || rec.id}">${rec.recipeid ? rec.recipeid + ' - ' : ''}${rec.name} (DB ID: ${rec.id})</option>`;
        }
        html += '</select>';
        html += '<button id="filter-ingredients-btn" class="w3-button w3-blue w3-small">Filter</button>';
        filterDiv.innerHTML = html;
        document.getElementById('filter-ingredients-btn').onclick = function() {
          renderIngredientsTable(ingredients, document.getElementById('filter-recipe-id').value);
        };
      }
      renderIngredientsTable(ingredients, '');
    })
    .catch(err => {
      const tableDiv = document.getElementById('ingredients-list-table');
      if (tableDiv) tableDiv.innerHTML = `<div class="w3-panel w3-red">Error: ${err.message}</div>`;
    });

  // Fetch and render published recipes table
  fetch('/api/recipes/display-table')
    .then(res => res.json())
    .then(data => {
      renderPublishedRecipesTable(data);
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
      '<th>ID</th><th>Ingredient Name</th><th>Recipe ID</th><th>Quantity</th><th>Measure Qty</th><th>Measure Unit</th><th>Food Item</th><th>Aisle Category</th><th>StripFoodItem</th>' +
      '</tr></thead><tbody>';
    for (const ing of filtered) {
      html += `<tr><td>${ing.id || ''}</td><td>${ing.ingredient_name || ''}</td><td>${ing.recipe_id || ''}</td><td>${ing.quantity || ''}</td><td>${ing.measure_qty || ''}</td><td>${ing.measure_unit || ''}</td><td>${ing.fooditem || ''}</td><td>${ing.aisle_category_id || ''}</td><td>${ing.stripfooditem || ''}</td></tr>`;
    }
    html += '</tbody></table>';
    tableDiv.innerHTML = html;
  }

  function renderPublishedRecipesTable(recipes) {
    const tableDiv = document.getElementById('published-recipes-table');
    if (!tableDiv) return;
    if (!recipes || !Array.isArray(recipes) || recipes.length === 0) {
      tableDiv.innerHTML = '<div class="w3-text-grey">No published recipes found.</div>';
      return;
    }
    let html = '<table class="w3-table-all w3-small w3-hoverable"><thead><tr>' +
      '<th>ID</th><th>RecipeID</th><th>Name</th><th>Description</th><th>Ingredients</th><th>Serving Size</th><th>URL</th><th>Instructions</th>' +
      '</tr></thead><tbody>';
    for (const rec of recipes) {
      html += `<tr><td>${rec.id || ''}</td><td>${rec.recipeid || ''}</td><td>${rec.name || ''}</td><td>${rec.description || ''}</td><td>${rec.ingredients || ''}</td><td>${rec.serving_size || ''}</td><td>${rec.url || ''}</td><td>${rec.instructions || ''}</td></tr>`;
    }
    html += '</tbody></table>';
    tableDiv.innerHTML = html;
  }
});

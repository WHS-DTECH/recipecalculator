// display_recipe_details.js
// Fetches and displays a single recipe from recipe_display table by id

document.addEventListener('DOMContentLoaded', function() {
  const STOCK_IMAGES = {
    'Baking': [
      'https://images.pexels.com/photos/3026808/pexels-photo-3026808.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/291528/pexels-photo-291528.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/1055272/pexels-photo-1055272.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/132694/pexels-photo-132694.jpeg?auto=compress&cs=tinysrgb&w=1200'
    ],
    'Fresh and Veg': [
      'https://images.pexels.com/photos/1211887/pexels-photo-1211887.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/257816/pexels-photo-257816.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/1300972/pexels-photo-1300972.jpeg?auto=compress&cs=tinysrgb&w=1200'
    ],
    'Main Meals': [
      'https://images.pexels.com/photos/1279330/pexels-photo-1279330.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/1527603/pexels-photo-1527603.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/1437267/pexels-photo-1437267.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/2233729/pexels-photo-2233729.jpeg?auto=compress&cs=tinysrgb&w=1200'
    ],
    'Breakfast': [
      'https://images.pexels.com/photos/376464/pexels-photo-376464.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/70497/pexels-photo-70497.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/1092730/pexels-photo-1092730.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/793765/pexels-photo-793765.jpeg?auto=compress&cs=tinysrgb&w=1200'
    ],
    'Student Favourites': [
      'https://images.pexels.com/photos/1640774/pexels-photo-1640774.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/1435904/pexels-photo-1435904.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/958545/pexels-photo-958545.jpeg?auto=compress&cs=tinysrgb&w=1200',
      'https://images.pexels.com/photos/461198/pexels-photo-461198.jpeg?auto=compress&cs=tinysrgb&w=1200'
    ]
  };

  function getDishCategory(name) {
    const lower = String(name || '').toLowerCase();
    if (/(cake|cupcake|cookie|brownie|muffin|pavlova|dessert|slice|fritter)/.test(lower)) return 'Baking';
    if (/(salad|vegetable|veggie|bean|lentil|pumpkin|kumara)/.test(lower)) return 'Fresh and Veg';
    if (/(pasta|macaroni|noodle|rice|stir fry|pie|brisket|pork|beef|chicken|lamb)/.test(lower)) return 'Main Meals';
    if (/(breakfast|granola|oats|toast|egg)/.test(lower)) return 'Breakfast';
    return 'Student Favourites';
  }

  function stableIndex(seed, length) {
    const str = String(seed || '');
    let hash = 0;
    for (let i = 0; i < str.length; i += 1) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash) % length;
  }

  function getDishImage(name, rowId, category) {
    const lower = String(name || '').toLowerCase();
    const seed = `${rowId || ''}-${name || ''}`;

    if (/(cupcake|cake|cookie|brownie|muffin|pavlova|dessert|slice)/.test(lower)) {
      const list = STOCK_IMAGES.Baking;
      return list[stableIndex(seed, list.length)];
    }
    if (/(salad|vegetable|veggie|beetroot|kumara|pumpkin)/.test(lower)) {
      const list = STOCK_IMAGES['Fresh and Veg'];
      return list[stableIndex(seed, list.length)];
    }
    if (/(breakfast|granola|oats|toast|egg)/.test(lower)) {
      const list = STOCK_IMAGES.Breakfast;
      return list[stableIndex(seed, list.length)];
    }

    const categoryImages = STOCK_IMAGES[category] || STOCK_IMAGES['Student Favourites'];
    return categoryImages[stableIndex(seed, categoryImages.length)];
  }

  function htmlToPlainText(value) {
    const div = document.createElement('div');
    div.innerHTML = String(value || '').replace(/<br\s*\/?>/gi, '\n');
    return (div.textContent || div.innerText || '')
      .replace(/\r/g, '')
      .replace(/\u00A0/g, ' ')
      .trim();
  }

  function splitLines(value) {
    return String(value || '')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);
  }

  function sanitizeListHtml(value) {
    return String(value || '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/\son\w+="[^"]*"/gi, '')
      .replace(/\son\w+='[^']*'/gi, '');
  }

  function extractItemsFromListHtml(value) {
    const cleaned = sanitizeListHtml(value);
    const wrapper = document.createElement('div');
    wrapper.innerHTML = cleaned;
    const liNodes = wrapper.querySelectorAll('li');
    if (!liNodes.length) return [];
    return Array.from(liNodes)
      .map((li) => String(li.textContent || '').trim())
      .filter(Boolean);
  }

  function splitIngredientItems(value) {
    const htmlItems = extractItemsFromListHtml(value);
    if (htmlItems.length) return htmlItems;

    const text = htmlToPlainText(value)
      .replace(/\s*[•\u2022]\s*/g, '\n');
    const items = splitLines(text);
    return items.length ? items : (text ? [text] : []);
  }

  function splitInstructionItems(value) {
    const htmlItems = extractItemsFromListHtml(value)
      .map((line) => line.replace(/^\d+[.)]?\s*/, '').trim())
      .filter(Boolean);
    if (htmlItems.length) return htmlItems;

    const text = htmlToPlainText(value)
      .replace(/\s+(?=\d+[.)]\s*)/g, '\n');

    const items = splitLines(text)
      .map(line => line.replace(/^\d+[.)]?\s*/, '').trim())
      .filter(Boolean);

    return items.length ? items : (text ? [text] : []);
  }

  function renderList(container, items) {
    if (!container) return;
    container.innerHTML = '';
    items.forEach(item => {
      const li = document.createElement('li');
      li.textContent = item;
      container.appendChild(li);
    });
  }

  function sourceFromUrl(url) {
    try {
      return new URL(String(url || '')).hostname.replace(/^www\./i, '');
    } catch (_) {
      return '-';
    }
  }

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if (!id) return;

  let allRecipes = [];

  function navigateToRecipe(recipeId) {
    window.location.href = `recipe_display.html?id=${recipeId}`;
  }

  function updateRecipeList(recipes, currentId) {
    const listContainer = document.getElementById('recipeNavigationList');
    if (!listContainer) return;

    listContainer.innerHTML = '';
    recipes.forEach(recipe => {
      const item = document.createElement('div');
      item.className = `recipe-nav-item ${String(recipe.id) === String(currentId) ? 'active' : ''}`;
      item.innerHTML = `
        <div class="recipe-nav-name">${recipe.name || '(Unnamed)'}</div>
        <div class="recipe-nav-id">ID: ${recipe.recipeid || recipe.recipe_id || recipe.id}</div>
      `;
      item.addEventListener('click', () => navigateToRecipe(recipe.id));
      listContainer.appendChild(item);
    });
  }

  function updateNavButtons(recipes, currentId) {
    const currentIndex = recipes.findIndex(r => String(r.id) === String(currentId));
    const prevBtn = document.getElementById('prevRecipeBtn');
    const nextBtn = document.getElementById('nextRecipeBtn');
    const recipeCounter = document.getElementById('recipeCounter');

    if (recipeCounter) {
      recipeCounter.textContent = `${currentIndex + 1} / ${recipes.length}`;
    }

    if (prevBtn) {
      if (currentIndex > 0) {
        prevBtn.disabled = false;
        prevBtn.addEventListener('click', () => navigateToRecipe(recipes[currentIndex - 1].id));
      } else {
        prevBtn.disabled = true;
      }
    }

    if (nextBtn) {
      if (currentIndex < recipes.length - 1) {
        nextBtn.disabled = false;
        nextBtn.addEventListener('click', () => navigateToRecipe(recipes[currentIndex + 1].id));
      } else {
        nextBtn.disabled = true;
      }
    }
  }

  function filterRecipeList(searchTerm) {
    const term = String(searchTerm || '').toLowerCase();
    const items = document.querySelectorAll('.recipe-nav-item');
    items.forEach(item => {
      const name = item.querySelector('.recipe-nav-name').textContent.toLowerCase();
      const id = item.querySelector('.recipe-nav-id').textContent.toLowerCase();
      item.style.display = (name.includes(term) || id.includes(term)) ? '' : 'none';
    });
  }

  fetch('/api/auth/me', { credentials: 'include' })
    .then(res => res.json())
    .then(auth => {
      const isAuthenticated = Boolean(auth && auth.authenticated && auth.user && auth.user.email);
      if (!isAuthenticated) {
        window.location.href = `google_login.html?next=${encodeURIComponent(`recipe_display.html?id=${id}`)}`;
        return;
      }

      return fetch('/api/recipes/display-table')
        .then(res => res.json())
        .then(rows => {
          allRecipes = rows.slice().sort((a, b) =>
            String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' })
          );
          const recipe = rows.find(r => String(r.id) === String(id));
          if (!recipe) return;

          updateRecipeList(allRecipes, id);
          updateNavButtons(allRecipes, id);

          const searchInput = document.getElementById('recipeSearchInput');
          if (searchInput) {
            searchInput.addEventListener('input', (e) => filterRecipeList(e.target.value));
          }

          const title = recipe.name || '(No Name)';
          const recipeNumber = recipe.recipeid || recipe.recipe_id || recipe.id;
          const category = getDishCategory(title);
          const imageUrl = String(recipe.image_url || '').trim() || getDishImage(title, recipe.id, category);

          const titleEl = document.getElementById('recipeTitle');
          const recipeIdEl = document.getElementById('recipeIdPill');
          const categoryEl = document.getElementById('recipeCategory');
          const servingsEl = document.getElementById('recipeServings');
          const sourceEl = document.getElementById('recipeSource');
          const urlEl = document.getElementById('recipeUrlLink');
          const imgEl = document.getElementById('recipeHeroImg');

          if (titleEl) titleEl.textContent = title;
          if (recipeIdEl) recipeIdEl.textContent = `RecipeID: ${recipeNumber}`;
          if (categoryEl) categoryEl.textContent = category;
          if (servingsEl) servingsEl.textContent = `Serving Size: ${recipe.serving_size || '-'}`;
          if (sourceEl) sourceEl.textContent = `Source: ${sourceFromUrl(recipe.url)}`;
          if (imgEl) {
            imgEl.src = imageUrl;
            imgEl.onerror = function() {
              this.src = 'https://images.pexels.com/photos/1640774/pexels-photo-1640774.jpeg?auto=compress&cs=tinysrgb&w=1200';
            };
          }

          if (urlEl && recipe.url) {
            urlEl.href = String(recipe.url);
            urlEl.style.display = 'inline-flex';
          }

          document.title = `${title} | Recipe Details`;

          const ingredientLines = splitIngredientItems(recipe.ingredients);
          renderList(document.getElementById('ingredientsList'), ingredientLines);

          const instructionLines = splitInstructionItems(recipe.instructions);

          const instructionsListEl = document.getElementById('instructionsList');
          const instructionsFallbackEl = document.getElementById('instructionsFallback');

          renderList(instructionsListEl, instructionLines);
          if (instructionsFallbackEl) instructionsFallbackEl.style.display = 'none';
        });
    })
    .catch(() => {
      window.location.href = `google_login.html?next=${encodeURIComponent(`recipe_display.html?id=${id}`)}`;
    });
});

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

  fetch('/api/recipes/display-table')
    .then(res => res.json())
    .then(rows => {
      const recipe = rows.find(r => String(r.id) === String(id));
      if (!recipe) return;

      const title = recipe.name || '(No Name)';
      const recipeNumber = recipe.recipeid || recipe.recipe_id || recipe.id;
      const category = getDishCategory(title);
      const imageUrl = getDishImage(title, recipe.id, category);

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

      const ingredientLines = splitLines(htmlToPlainText(recipe.ingredients));
      renderList(document.getElementById('ingredientsList'), ingredientLines);

      const instructionText = htmlToPlainText(recipe.instructions);
      const instructionLines = splitLines(instructionText)
        .map(line => line.replace(/^\d+[.)]\s*/, '').trim())
        .filter(Boolean);

      const instructionsListEl = document.getElementById('instructionsList');
      const instructionsFallbackEl = document.getElementById('instructionsFallback');

      if (instructionLines.length >= 2) {
        renderList(instructionsListEl, instructionLines);
        if (instructionsFallbackEl) instructionsFallbackEl.style.display = 'none';
      } else {
        if (instructionsListEl) instructionsListEl.innerHTML = '';
        if (instructionsFallbackEl) {
          instructionsFallbackEl.style.display = 'block';
          instructionsFallbackEl.textContent = instructionText || 'No instructions available.';
        }
      }
    });
});

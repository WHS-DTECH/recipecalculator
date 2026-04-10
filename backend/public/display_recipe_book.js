// display_recipe_book.js
// Fetches and displays the Recipe Book from recipe_display table instead of recipes

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

  function stableIndex(seed, length) {
    const str = String(seed || '');
    let hash = 0;
    for (let i = 0; i < str.length; i += 1) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash) % length;
  }

  function getDishImage(name, rowId, category, index) {
    const lower = String(name || '').toLowerCase();
    const seed = `${rowId || ''}-${index}-${name || ''}`;

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

  function getDishCategory(name) {
    const lower = String(name || '').toLowerCase();
    if (/(cake|cupcake|cookie|brownie|muffin|pavlova|dessert|slice|fritter)/.test(lower)) return 'Baking';
    if (/(salad|vegetable|veggie|bean|lentil|pumpkin|kumara)/.test(lower)) return 'Fresh and Veg';
    if (/(pasta|macaroni|noodle|rice|stir fry|pie|brisket|pork|beef|chicken|lamb)/.test(lower)) return 'Main Meals';
    if (/(breakfast|granola|oats|toast|egg)/.test(lower)) return 'Breakfast';
    return 'Student Favourites';
  }

  function buildCardSubtitle(name) {
    const lower = String(name || '').toLowerCase();
    if (/(chelsea sugar)/.test(lower)) return 'Baking skills and sweetness balance';
    if (/(healthy food guide)/.test(lower)) return 'Healthy cooking and nutrition focus';
    if (/(edmonds)/.test(lower)) return 'Classic NZ kitchen staple recipe';
    return 'Practical kitchen confidence and food literacy';
  }

  fetch('/api/recipes/display-table')
    .then(res => res.json())
    .then(rows => {
      if (!Array.isArray(rows) || rows.length === 0) return;
      const cardList = document.getElementById('recipeCardList');
      const badge = document.getElementById('recipeCountBadge');
      const chips = document.getElementById('recipeCategoryChips');
      if (!cardList) return;

      if (badge) {
        badge.textContent = `${rows.length} recipes in the student showcase`;
      }

      if (chips) {
        const counts = rows.reduce((acc, row) => {
          const key = getDishCategory(row.name || '');
          acc[key] = (acc[key] || 0) + 1;
          return acc;
        }, {});

        chips.innerHTML = Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .map(([name, count]) => `<span class="recipe-chip">${name}: ${count}</span>`)
          .join('');
      }

      cardList.innerHTML = '';
      rows.forEach((row, index) => {
        const name = row.name || '(No Name)';
        const recipeNumber = row.recipeid || row.recipe_id || row.id;
        const category = getDishCategory(name);
        const imageUrl = getDishImage(name, row.id, category, index);

        const card = document.createElement('div');
        card.className = 'recipe-card';
        card.style.cursor = 'pointer';
        card.innerHTML = `
          <img class="recipe-thumb" src="${imageUrl}" alt="${String(name).replace(/"/g, '&quot;')}" loading="lazy">
          <div class="recipe-card-body">
            <div class="recipe-card-top">
              <div class="recipe-card-id">#${recipeNumber}</div>
              <span class="recipe-chip">${category}</span>
            </div>
            <div class="recipe-card-title">${name}</div>
            <div class="recipe-card-sub">${buildCardSubtitle(name)}</div>
          </div>
        `;

        const img = card.querySelector('.recipe-thumb');
        if (img) {
          img.onerror = function() {
            this.src = 'https://images.pexels.com/photos/1640774/pexels-photo-1640774.jpeg?auto=compress&cs=tinysrgb&w=1200';
          };
        }

        card.onclick = () => {
          window.location.href = `recipe_display.html?id=${row.id}`;
        };
        cardList.appendChild(card);
      });
    });
});

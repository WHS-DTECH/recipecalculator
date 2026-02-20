// display_recipe_book.js
// Fetches and displays the Recipe Book from recipe_display table instead of recipes

document.addEventListener('DOMContentLoaded', function() {
  fetch('/api/recipes/display-table')
    .then(res => res.json())
    .then(rows => {
      if (!Array.isArray(rows) || rows.length === 0) return;
      const cardList = document.getElementById('recipeCardList');
      if (!cardList) return;
      cardList.innerHTML = '';
      rows.forEach(row => {
        const card = document.createElement('div');
        card.className = 'recipe-card';
        card.style.cursor = 'pointer';
        card.innerHTML = `
          <div class="recipe-card-id">${row.id}</div>
          <div class="recipe-card-title">${row.name || '(No Name)'}</div>
        `;
        card.onclick = () => {
          window.location.href = `recipe_display.html?id=${row.id}`;
        };
        cardList.appendChild(card);
      });
    });
});

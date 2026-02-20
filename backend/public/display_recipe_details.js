// display_recipe_details.js
// Fetches and displays a single recipe from recipe_display table by id

document.addEventListener('DOMContentLoaded', function() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if (!id) return;
  fetch('/api/recipes/display-table')
    .then(res => res.json())
    .then(rows => {
      const recipe = rows.find(r => String(r.id) === String(id));
      if (!recipe) return;
      // Populate details (replace with your actual HTML structure)
      document.querySelector('.main-title').textContent = recipe.name || '(No Name)';
      document.getElementById('ingredients').innerHTML = recipe.ingredients || '';
      document.getElementById('instructions').textContent = recipe.instructions || '';
      document.getElementById('serving_size').textContent = recipe.serving_size || '';
      document.getElementById('url').innerHTML = recipe.url ? `<a href="${recipe.url}" target="_blank">${recipe.url}</a>` : '';
    });
});

// recipe_extraction.js - Custom JS for Recipe Extraction page (removes Display button only here)

// --- Sorting for Extracted Recipes Table ---
let sortDescending = true; // Default: newest first
function sortRecipes(data) {
    data.sort((a, b) => sortDescending ? b.id - a.id : a.id - b.id);
}

document.addEventListener('DOMContentLoaded', () => {
    fetchAndRenderRecipes();
});

function fetchAndRenderRecipes() {
    fetch('/api/recipes')
        .then(res => res.json())
        .then(data => {
            const tbody = document.querySelector('#mainRecipesTable tbody');
            tbody.innerHTML = '';
            sortRecipes(data);
            data.forEach(recipe => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${recipe.id}</td>
                    <td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${recipe.uploaded_recipe_id || ''}</td>
                    <td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${recipe.url ? `<a href='${recipe.url}' target='_blank'>Link</a>` : ''}</td>
                    <td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${recipe.name || ''}</td>
                    <td style='border:1px solid #eee;padding:0.5rem 0.7rem; color:#009688; max-width:120px; text-align:center; background:#f8f8ff;'>
                        <button class="view-raw-btn" data-id="${recipe.id}" style="background:#1976d2;color:#fff;border:none;padding:0.3rem 0.8rem;border-radius:4px;cursor:pointer;">View</button>
                    </td>
                    <td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${recipe.serving_size !== undefined && recipe.serving_size !== null ? recipe.serving_size : ''}</td>
                    <td style='border:1px solid #eee;padding:0.5rem 0.7rem; color:indigo;'>${recipe.extracted_ingredients || ''}</td>
                    <td style='border:1px solid #eee;padding:0.5rem 0.7rem; color:indigo;'>${recipe.instructions_extracted || ''}</td>
                    <td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>
                        <button class='delete-recipe-btn' data-id='${recipe.id}' style='background:#e53935;color:#fff;border:none;padding:0.4rem 0.8rem;border-radius:4px;cursor:pointer;'>Delete</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
            document.querySelectorAll('.view-raw-btn').forEach(btn => {
                btn.addEventListener('click', function(e) {
                    e.preventDefault();
                    const recipeId = this.getAttribute('data-id');
                    if (!recipeId) return;
                    window.open(`RawDataTXT/${recipeId}.txt`, '_blank');
                });
            });
            document.querySelectorAll('.delete-recipe-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    const id = this.getAttribute('data-id');
                    if (confirm('Are you sure you want to delete this recipe?')) {
                        fetch(`/api/recipes/${id}`, { method: 'DELETE' })
                            .then(res => res.json())
                            .then(result => {
                                if (result.success) {
                                    fetchAndRenderRecipes();
                                } else {
                                    alert('Failed to delete recipe.');
                                }
                            });
                    }
                });
            });
        })
        .catch(err => {
            const tbody = document.querySelector('#mainRecipesTable tbody');
            if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="color:red;">Failed to load recipes: ' + err.message + '</td></tr>';
        });
}

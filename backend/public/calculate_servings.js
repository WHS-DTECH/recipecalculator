// Fetch and render all records from desired_servings_ingredients
let allDSIRecords = [];
function loadDesiredServingIngredientsTable() {
  fetch('/api/ingredients/desired_servings_ingredients')
    .then(res => res.json())
    .then(data => {
      allDSIRecords = data.data || [];
      populateDSIFilters();
      renderDesiredServingIngredientsTable(allDSIRecords);
    });
}

function populateDSIFilters() {
  const teacherSelect = document.getElementById('filter-dsi-teacher');
  const classSelect = document.getElementById('filter-dsi-class');
  if (!teacherSelect || !classSelect) return;
  // Get unique teachers and classes
  const teachers = Array.from(new Set(allDSIRecords.map(r => r.teacher).filter(Boolean)));
  const classes = Array.from(new Set(allDSIRecords.map(r => r.class_name).filter(Boolean)));
  // Populate teacher dropdown
  teacherSelect.innerHTML = '<option value="">All</option>' + teachers.map(t => `<option value="${t}">${t}</option>`).join('');
  // Populate class dropdown
  classSelect.innerHTML = '<option value="">All</option>' + classes.map(c => `<option value="${c}">${c}</option>`).join('');
}
document.addEventListener('DOMContentLoaded', () => {
  loadDesiredServingIngredientsTable();
  const delBtn = document.getElementById('delete-all-desired-serving-ingredients-btn');
  if (delBtn) {
    delBtn.onclick = function() {
      if (confirm('Are you sure you want to delete ALL desired serving ingredients? This cannot be undone.')) {
        fetch('/api/ingredients/desired_servings_ingredients/all', { method: 'DELETE' })
          .then(res => res.json())
          .then(data => {
            if (data.success) {
              loadDesiredServingIngredientsTable();
            } else {
              alert('Delete failed: ' + (data.error || 'Unknown error'));
            }
          });
      }
    };
  }
});

function renderDesiredServingIngredientsTable(records) {
  const container = document.getElementById('desired-serving-ingredients-table');
  if (!container) return;
  // Apply filters
  const teacher = document.getElementById('filter-dsi-teacher')?.value || '';
  const className = document.getElementById('filter-dsi-class')?.value || '';
  let filtered = records;
  if (teacher) filtered = filtered.filter(r => r.teacher === teacher);
  if (className) filtered = filtered.filter(r => r.class_name === className);
  if (!filtered.length) {
    container.innerHTML = '<div>No desired serving ingredients found.</div>';
    return;
  }
  let html = '<table class="inventory-table"><thead><tr>' +
    '<th>ID</th><th>Booking ID</th><th>Teacher</th><th>Class Name</th><th>Class Date</th><th>Recipe ID</th><th>Ingredient</th><th>Qty</th><th>Unit</th><th>Food Item</th><th>StripFoodItem</th><th>Aisle Category</th>' +
    '</tr></thead><tbody>';
  for (const rec of filtered) {
    html += `<tr><td>${rec.id || ''}</td><td>${rec.booking_id || ''}</td><td>${rec.teacher || ''}</td><td>${rec.class_name || ''}</td><td>${rec.class_date || ''}</td><td>${rec.recipe_id || ''}</td><td>${rec.ingredient_name || ''}</td><td>${rec.calculated_qty || rec.measure_qty || ''}</td><td>${rec.measure_unit || ''}</td><td>${rec.fooditem || ''}</td><td>${rec.stripFoodItem || rec.strip_fooditem || ''}</td><td>${rec.aisle_category_id || ''}</td></tr>`;
  }
  html += '</tbody></table>';
  container.innerHTML = html;
}

// Listen for filter changes
document.addEventListener('DOMContentLoaded', () => {
  const teacherSelect = document.getElementById('filter-dsi-teacher');
  const classSelect = document.getElementById('filter-dsi-class');
  if (teacherSelect) teacherSelect.onchange = () => renderDesiredServingIngredientsTable(allDSIRecords);
  if (classSelect) classSelect.onchange = () => renderDesiredServingIngredientsTable(allDSIRecords);
});
// Fetch and render the Ingredients_inventory table at the bottom of the page

document.addEventListener('DOMContentLoaded', () => {
  fetch('/api/ingredients/inventory/all')
    .then(res => res.json())
    .then(data => {
      renderIngredientsTable(data.data || []);
    });
});

function renderIngredientsTable(ingredients) {
  const container = document.getElementById('ingredients-inventory-table');
  if (!container) return;
  console.log('[renderIngredientsTable] Called with:', ingredients);
  if (!ingredients || !ingredients.length) {
    container.innerHTML = '<div>No ingredients found.</div>';
    return;
  }
  let html = '<table class="inventory-table"><thead><tr>' +
    '<th>ID</th><th>Ingredient Name</th><th>Recipe ID</th><th>Quantity</th><th>Measure Qty</th><th>Measure Unit</th><th>StripFoodItem</th><th>Aisle Category</th>' +
    '</tr></thead><tbody>';
  for (const ing of ingredients) {
    html += `<tr><td>${ing.id || ''}</td><td>${ing.ingredient_name || ''}</td><td>${ing.recipe_id || ''}</td><td>${ing.quantity || ''}</td><td>${ing.measure_qty || ''}</td><td>${ing.measure_unit || ''}</td><td>${ing.strip_fooditem || ing.stripFoodItem || ''}</td><td>${ing.aisle_category_name || ing.aisle_category_id || ''}</td></tr>`;
  }
  html += '</tbody></table>';
  container.innerHTML = html;
}

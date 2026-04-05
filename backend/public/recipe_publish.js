// Global fallback: make Refresh button always feel responsive.
document.addEventListener('click', (event) => {
	const target = event.target;
	if (!target || target.id !== 'refreshRecipesBtn') return;
	event.preventDefault();
	target.disabled = true;
	target.textContent = 'Refreshing...';
	window.location.reload();
});

document.addEventListener('DOMContentLoaded', () => {
	const table = document.getElementById('recipesTable');
	const tbody = table ? table.querySelector('tbody') : null;
	if (!table || !tbody) {
		console.error('Table or tbody not found!');
		return;
	}
	fetch('/api/recipes')
		.then(res => res.json())
		.then(data => {
			const columns = [
				'id', 'name',
				'instructions_extracted',
				'instructions_display',
				'extracted_ingredients', 'ingredients_display',
				'actions'
			];
			if (!Array.isArray(data) || data.length === 0) {
				tbody.innerHTML = `<tr><td colspan="${columns.length}">No recipes found.</td></tr>`;
				return;
			}
			const sortedRecipes = sortRecipesNewestFirst(data);
			tbody.innerHTML = sortedRecipes.map(recipe =>
				`<tr>${columns.map(col =>
					col === 'url'
						? `<td>${getRecipeColumnValue(recipe, col) ? `<a href="${getRecipeColumnValue(recipe, col)}" target="_blank">Link</a>` : ''}</td>`
						: `<td>${getRecipeColumnValue(recipe, col)}</td>`
				).join('')}</tr>`
			).join('');
		})
		.catch(err => {
			console.error('Error fetching recipes:', err);
			tbody.innerHTML = `<tr><td colspan="15">Error loading recipes.</td></tr>`;
		});

// Populate the RecipeID filter selector and add filter/sort logic
function getRecipeFilterId(recipe) {
	return recipe?.recipeid ?? recipe?.id ?? '';
}

function getRecipeFilterLabel(recipe) {
	const recipeId = getRecipeFilterId(recipe);
	if (!recipeId) return '';
	const recipeName = (recipe?.name || '').trim();
	return recipeName ? `${recipeId} - ${recipeName}` : `${recipeId} - (unnamed recipe)`;
}

function sortRecipesNewestFirst(recipes) {
	return [...recipes].sort((left, right) => Number(right.id || 0) - Number(left.id || 0));
}

let publishedRecipeIds = new Set();

async function refreshPublishedRecipeIds() {
	try {
		const resp = await fetch(`/api/recipes/display-table?_ts=${Date.now()}`, { cache: 'no-store' });
		const rows = await resp.json();
		if (!Array.isArray(rows)) {
			publishedRecipeIds = new Set();
			return;
		}
		publishedRecipeIds = new Set(
			rows
				.map(row => Number(row.recipeid))
				.filter(id => Number.isInteger(id) && id > 0)
		);
	} catch (err) {
		console.error('[DEBUG] Failed to refresh published recipe IDs:', err);
		publishedRecipeIds = new Set();
	}
}

function getRecipeColumnValue(recipe, col) {
	if (!recipe) return '';
	if (col === 'actions') {
		const recipeId = Number(recipe.id);
		const isPublished = publishedRecipeIds.has(recipeId);
		if (isPublished) {
			return `<button class="publish-recipe-btn" data-id="${recipe.id}" disabled style="background:#9e9e9e;color:#fff;border:none;padding:0.35rem 0.7rem;border-radius:4px;cursor:not-allowed;opacity:0.9;">Published</button>`;
		}
		return `<button class="publish-recipe-btn" data-id="${recipe.id}" style="background:#1976d2;color:#fff;border:none;padding:0.35rem 0.7rem;border-radius:4px;cursor:pointer;">Publish</button>`;
	}
	if (col === 'ingredients_display') {
		return recipe.ingredients_display ?? recipe.Ingredients_display ?? '';
	}
	if (col === 'instructions_display') {
		return recipe.instructions_display ?? recipe.Instructions_display ?? '';
	}
	return recipe[col] ?? '';
}

function populateRecipeIdFilterOptions(recipes) {
	const filter = document.getElementById('recipeIdFilter');
	if (!filter) return;
	filter.innerHTML = '<option value="">-- Select RecipeID --</option>';
	// Get unique recipeIDs and names
	const unique = {};
	recipes.forEach(r => {
		const recipeId = getRecipeFilterId(r);
		if (!recipeId || unique[recipeId]) return;
		unique[recipeId] = getRecipeFilterLabel(r);
	});
	Object.keys(unique)
		.sort((a, b) => Number(a) - Number(b))
		.forEach(recipeId => {
			filter.innerHTML += `<option value="${recipeId}">${unique[recipeId]}</option>`;
	});
}

function filterAndRenderRecipesById(recipes, selectedId) {
	const table = document.getElementById('recipesTable');
	const tbody = table ? table.querySelector('tbody') : null;
	if (!table || !tbody) return;
	const columns = [
		'id', 'name',
		'instructions_extracted',
		'instructions_display',
		'extracted_ingredients', 'ingredients_display',
		'actions'
	];
	let filtered = recipes;
	if (selectedId) {
		filtered = recipes.filter(r => String(getRecipeFilterId(r)) === String(selectedId));
	}
	if (!Array.isArray(filtered) || filtered.length === 0) {
		tbody.innerHTML = `<tr><td colspan="${columns.length}">No recipes found.</td></tr>`;
		return;
	}
	const sortedRecipes = sortRecipesNewestFirst(filtered);
	const debugRow = sortedRecipes.find(r => Number(r.id) === 20);
	if (debugRow) {
		console.log('[DEBUG][Render] ID 20 ingredients_display value:', debugRow.ingredients_display);
	}
	tbody.innerHTML = sortedRecipes.map(recipe =>
		`<tr>${columns.map(col => `<td>${getRecipeColumnValue(recipe, col)}</td>`).join('')}</tr>`
	).join('');
}

let allRecipesCache = [];
	// Fetch all recipes and populate both the table and the filter selector
	fetch('/api/recipes')
		.then(res => res.json())
		.then(data => {
			console.log('[DEBUG] /api/recipes returned:', data);
			if (Array.isArray(data) && data.length > 0) {
				console.log('[DEBUG] First recipe object:', data[0]);
			}
			allRecipesCache = data;
			refreshPublishedRecipeIds().then(() => {
			populateRecipeIdFilterOptions(data);
			console.log('[DEBUG] Populating RecipeID filter with:', data.map(getRecipeFilterLabel).filter(Boolean));
			filterAndRenderRecipesById(data, '');
			});
		})
		.catch(err => {
			const table = document.getElementById('recipesTable');
			const tbody = table ? table.querySelector('tbody') : null;
			if (tbody) tbody.innerHTML = `<tr><td colspan="7">Error loading recipes.</td></tr>`;
			console.error('[DEBUG] Error fetching recipes:', err);
		});

	// Add event for filter button
	const filterBtn = document.getElementById('applyRecipeIdFilterBtn');
	if (filterBtn) {
		filterBtn.addEventListener('click', () => {
			const filter = document.getElementById('recipeIdFilter');
			const selectedId = filter ? filter.value : '';
			console.log('[DEBUG] Filter button clicked. Selected RecipeID:', selectedId);
			filterAndRenderRecipesById(allRecipesCache, selectedId);
		});
	}

	const refreshBtn = document.getElementById('refreshRecipesBtn');
	if (refreshBtn) {
		refreshBtn.addEventListener('click', async () => {
			refreshBtn.disabled = true;
			const selectedId = (document.getElementById('recipeIdFilter') || {}).value || '';
			await refreshRecipesFromApi(selectedId);
			refreshBtn.disabled = false;
		});
	}

	tbody.addEventListener('click', async (event) => {
		const btn = event.target;
		if (!btn || !btn.classList || !btn.classList.contains('publish-recipe-btn')) return;
		const recipeId = btn.getAttribute('data-id');
		if (!recipeId) return;
		if (publishedRecipeIds.has(Number(recipeId))) return;
		if (!confirm(`Publish RecipeID ${recipeId} to recipe_display using current Display fields?`)) return;
		btn.disabled = true;
		try {
			const resp = await fetch(`/api/recipes/${recipeId}/display`, { method: 'POST' });
			const data = await resp.json();
			if (data.success) {
				publishedRecipeIds.add(Number(recipeId));
				const selectedId = (document.getElementById('recipeIdFilter') || {}).value || '';
				filterAndRenderRecipesById(allRecipesCache, selectedId);
				alert(`RecipeID ${recipeId} published.`);
			} else {
				alert('Publish failed: ' + (data.error || 'Unknown error'));
			}
		} catch (err) {
			alert('Publish failed: ' + err.message);
		}
		btn.disabled = false;
	});

	async function refreshRecipesFromApi(preferredRecipeId = '') {
		try {
			const filter = document.getElementById('recipeIdFilter');
			const previousSelectedId = filter ? (filter.value || '') : '';
			await refreshPublishedRecipeIds();
			const resp = await fetch(`/api/recipes?_ts=${Date.now()}`, { cache: 'no-store' });
			const data = await resp.json();
			allRecipesCache = Array.isArray(data) ? data : [];
			populateRecipeIdFilterOptions(allRecipesCache);

			let selectedId = previousSelectedId;
			if (preferredRecipeId && filter) {
				const wanted = String(preferredRecipeId);
				const hasWanted = Array.from(filter.options).some(opt => String(opt.value) === wanted);
				if (hasWanted) {
					filter.value = wanted;
					selectedId = wanted;
				}
			}

			filterAndRenderRecipesById(allRecipesCache, selectedId);
		} catch (err) {
			console.error('[DEBUG] Failed to refresh recipes after cleanup:', err);
		}
	}

	async function waitForCleanupCompletion(progressUrl, progressFill) {
		let sawRunning = false;
		let keepPolling = true;
		while (keepPolling) {
			try {
				const resp = await fetch(progressUrl);
				const data = await resp.json();
				if (data && data.running === true) sawRunning = true;
				if (progressFill && data && typeof data.progress === 'number' && typeof data.total === 'number') {
					const percent = data.total > 0 ? Math.round((data.progress / data.total) * 100) : (sawRunning ? 100 : 0);
					progressFill.style.width = percent + '%';
				}
				if (sawRunning && data && data.running === false) {
					keepPolling = false;
				}
			} catch {
				keepPolling = false;
			}
			if (keepPolling) await new Promise(resolve => setTimeout(resolve, 350));
		}
	}

	const cleanupInstructionsBtnActive = document.getElementById('cleanupInstructionsBtn');
	if (cleanupInstructionsBtnActive) {
		cleanupInstructionsBtnActive.addEventListener('click', async () => {
			const recipeIdInput = prompt('Enter the RecipeID to clean for Instructions Display:');
			if (recipeIdInput === null) return;
			const recipeId = Number(String(recipeIdInput).trim());
			if (!Number.isInteger(recipeId) || recipeId <= 0) {
				alert('Please enter a valid numeric RecipeID.');
				return;
			}
			if (!confirm(`Clean Instructions Display for RecipeID ${recipeId}?`)) return;
			const previousInstructionsDisplay = getRecipeColumnValue(
				allRecipesCache.find(r => Number(r.id) === recipeId),
				'instructions_display'
			);

			cleanupInstructionsBtnActive.disabled = true;
			const progressBar = document.getElementById('cleanupProgressBar');
			const progressFill = document.getElementById('cleanupProgressFill');
			if (progressBar && progressFill) {
				progressBar.style.display = 'block';
				progressFill.style.width = '0%';
			}

			await fetch('/api/recipes/cleanup-instructions-stepwise', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ recipeId })
			});

			await waitForCleanupCompletion('/api/recipes/cleanup-instructions-progress', progressFill);

			if (progressBar && progressFill) {
				progressBar.style.display = 'none';
				progressFill.style.width = '0%';
			}
			cleanupInstructionsBtnActive.disabled = false;
			await refreshRecipesFromApi(String(recipeId));
			await new Promise(resolve => setTimeout(resolve, 250));
			await refreshRecipesFromApi(String(recipeId));
			const refreshedInstructionsDisplay = getRecipeColumnValue(
				allRecipesCache.find(r => Number(r.id) === recipeId),
				'instructions_display'
			);
			if (String(refreshedInstructionsDisplay || '').trim() === String(previousInstructionsDisplay || '').trim()) {
				console.warn('[DEBUG] Instructions display unchanged after cleanup refresh; forcing page reload.');
				window.location.reload();
				return;
			}
			alert(`Instructions cleanup finished for RecipeID ${recipeId}.`);
		});
	}

	const cleanupIngredientsBtnActive = document.getElementById('cleanupIngredientsBtn');
	if (cleanupIngredientsBtnActive) {
		cleanupIngredientsBtnActive.addEventListener('click', async () => {
			const recipeIdInput = prompt('Enter the RecipeID to clean for Ingredients Display:');
			if (recipeIdInput === null) return;
			const recipeId = Number(String(recipeIdInput).trim());
			if (!Number.isInteger(recipeId) || recipeId <= 0) {
				alert('Please enter a valid numeric RecipeID.');
				return;
			}
			if (!confirm(`Clean Ingredients Display for RecipeID ${recipeId}?`)) return;
			const previousIngredientsDisplay = getRecipeColumnValue(
				allRecipesCache.find(r => Number(r.id) === recipeId),
				'ingredients_display'
			);

			cleanupIngredientsBtnActive.disabled = true;
			const progressBar = document.getElementById('cleanupProgressBar');
			const progressFill = document.getElementById('cleanupProgressFill');
			if (progressBar && progressFill) {
				progressBar.style.display = 'block';
				progressFill.style.width = '0%';
			}

			await fetch('/api/recipes/cleanup-ingredients-stepwise', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ recipeId })
			});

			await waitForCleanupCompletion('/api/recipes/cleanup-ingredients-progress', progressFill);

			if (progressBar && progressFill) {
				progressBar.style.display = 'none';
				progressFill.style.width = '0%';
			}
			cleanupIngredientsBtnActive.disabled = false;
			await refreshRecipesFromApi(String(recipeId));
			await new Promise(resolve => setTimeout(resolve, 250));
			await refreshRecipesFromApi(String(recipeId));
			const refreshedIngredientsDisplay = getRecipeColumnValue(
				allRecipesCache.find(r => Number(r.id) === recipeId),
				'ingredients_display'
			);
			if (String(refreshedIngredientsDisplay || '').trim() === String(previousIngredientsDisplay || '').trim()) {
				console.warn('[DEBUG] Ingredients display unchanged after cleanup refresh; forcing page reload.');
				window.location.reload();
				return;
			}
			alert(`Ingredients cleanup finished for RecipeID ${recipeId}.`);
		});
	}
// Only logic for Upload URL and Uploaded Recipes table remains
document.addEventListener('DOMContentLoaded', () => {
	// Upload URL button
	const uploadUrlBtn = document.getElementById('uploadUrlBtn');
	const uploadUrlInput = document.querySelector('input[type="text"]');
	if (uploadUrlBtn && uploadUrlInput) {
		uploadUrlBtn.addEventListener('click', async () => {
			const url = uploadUrlInput.value.trim();
			if (!url) {
				alert('Please enter a Recipe URL.');
				return;
			}
			uploadUrlBtn.disabled = true;
			try {
				const resp = await fetch('/api/recipes/upload-url', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ url })
				});
				const data = await resp.json();
				if (data.success) {
					alert('Recipe uploaded successfully!');
					fetchAndRenderUploads();
				} else {
					alert('Failed to upload recipe: ' + (data.error || 'Unknown error'));
				}
			} catch (err) {
				alert('Error uploading recipe: ' + err.message);
			}
			uploadUrlBtn.disabled = false;
		});
	}
	fetchAndRenderUploads();
});

function fetchAndRenderUploads() {
	fetch('/api/uploads')
		.then(res => res.json())
		.then(data => {
			const tbody = document.querySelector('#uploadedRecipesTable tbody');
			if (!tbody) return;
			tbody.innerHTML = '';
			data.forEach(upload => {
				const tr = document.createElement('tr');
				tr.innerHTML = `
					<td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${upload.id}</td>
					<td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${upload.recipe_title}</td>
					<td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${upload.upload_type}</td>
					<td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${upload.source_url ? `<a href='${upload.source_url}' target='_blank'>Link</a>` : ''}</td>
					<td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${upload.uploaded_by}</td>
					<td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${upload.upload_date}</td>
					<td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>
						<button class='delete-upload-btn' data-id='${upload.id}' style='background:#e53935;color:#fff;border:none;padding:0.4rem 0.8rem;border-radius:4px;cursor:pointer;'>Delete</button>
					</td>
				`;
				tbody.appendChild(tr);
			});
			document.querySelectorAll('.delete-upload-btn').forEach(btn => {
				btn.addEventListener('click', function() {
					const id = this.getAttribute('data-id');
					if (confirm('Are you sure you want to delete this upload record?')) {
						fetch(`/api/uploads/${id}`, { method: 'DELETE' })
							.then(res => res.json())
							.then(result => {
								if (result.success) {
									fetchAndRenderUploads();
								} else {
									alert('Failed to delete upload record.');
								}
							});
					}
				});
			});
		});
}

// Handle Upload URL button and table rendering for upload_url.html

document.addEventListener('DOMContentLoaded', () => {

	// Add event listener for Upload URL button
	const uploadUrlBtn = document.getElementById('uploadUrlBtn');
	const uploadUrlInput = document.getElementById('uploadUrlInput') || document.querySelector('input[type="text"]');
	if (uploadUrlBtn && uploadUrlInput) {
		uploadUrlBtn.addEventListener('click', async () => {
			const url = uploadUrlInput.value.trim();
			if (!url) {
				alert('Please enter a Recipe URL.');
				return;
			}
			uploadUrlBtn.disabled = true;
			try {
				const resp = await fetch('/api/recipes/upload-url', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ url })
				});
				const data = await resp.json();
				if (data.success) {
					alert('Recipe uploaded successfully!');
					fetchAndRenderRecipes();
				} else {
					alert('Failed to upload recipe: ' + (data.error || 'Unknown error'));
				}
			} catch (err) {
				alert('Error uploading recipe: ' + err.message);
			}
			uploadUrlBtn.disabled = false;
		});
	}

	// Add event listener for Cleanup Instructions button (stepwise with progress bar)
	const cleanupInstructionsBtn = document.getElementById('cleanupInstructionsBtn');
	if (cleanupInstructionsBtn) {
		cleanupInstructionsBtn.addEventListener('click', async () => {
			const recipeIdInput = prompt('Enter the RecipeID to clean for Instructions Display:');
			if (recipeIdInput === null) return;
			const recipeId = Number(String(recipeIdInput).trim());
			if (!Number.isInteger(recipeId) || recipeId <= 0) {
				alert('Please enter a valid numeric RecipeID.');
				return;
			}
			if (!confirm(`Clean Instructions Display for RecipeID ${recipeId}?`)) return;
			cleanupInstructionsBtn.disabled = true;
			const progressBar = document.getElementById('cleanupProgressBar');
			const progressFill = document.getElementById('cleanupProgressFill');
			progressBar.style.display = 'block';
			progressFill.style.width = '0%';

			let polling = true;
			let lastProgress = 0;

			// Start the stepwise cleanup (POST)
			fetch('/api/recipes/cleanup-instructions-stepwise', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ recipeId })
			});

			async function pollProgress() {
				try {
					const resp = await fetch('/api/recipes/cleanup-instructions-progress');
					const data = await resp.json();
					if (data && typeof data.progress === 'number' && typeof data.total === 'number') {
						const percent = data.total > 0 ? Math.round((data.progress / data.total) * 100) : 0;
						progressFill.style.width = percent + '%';
						lastProgress = percent;
						if (data.progress >= data.total && data.total > 0) {
							polling = false;
							setTimeout(() => {
								progressBar.style.display = 'none';
								progressFill.style.width = '0%';
								alert(`Cleaned up instructions for ${data.total} recipe(s).`);
								fetchAndRenderRecipes();
								cleanupInstructionsBtn.disabled = false;
							}, 500);
							return;
						}
					}
				} catch (err) {
					// ignore errors, keep polling
				}
				if (polling) setTimeout(pollProgress, 400);
			}
			pollProgress();
		});
	}

	// Add event listener for Cleanup Ingredients button (stepwise with progress bar)
	const cleanupIngredientsBtn = document.getElementById('cleanupIngredientsBtn');
	if (cleanupIngredientsBtn) {
		cleanupIngredientsBtn.addEventListener('click', async () => {
			const recipeIdInput = prompt('Enter the RecipeID to clean for Ingredients Display:');
			if (recipeIdInput === null) return;
			const recipeId = Number(String(recipeIdInput).trim());
			if (!Number.isInteger(recipeId) || recipeId <= 0) {
				alert('Please enter a valid numeric RecipeID.');
				return;
			}
			if (!confirm(`Clean Ingredients Display for RecipeID ${recipeId}?`)) return;
			cleanupIngredientsBtn.disabled = true;
			const progressBar = document.getElementById('cleanupProgressBar');
			const progressFill = document.getElementById('cleanupProgressFill');
			progressBar.style.display = 'block';
			progressFill.style.width = '0%';

			let polling = true;
			let lastProgress = 0;

			// Start the stepwise cleanup (POST)
			fetch('/api/recipes/cleanup-ingredients-stepwise', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ recipeId })
			});

			async function pollProgress() {
				try {
					const resp = await fetch('/api/recipes/cleanup-ingredients-progress');
					const data = await resp.json();
					if (data && typeof data.progress === 'number' && typeof data.total === 'number') {
						const percent = data.total > 0 ? Math.round((data.progress / data.total) * 100) : 0;
						progressFill.style.width = percent + '%';
						lastProgress = percent;
						if (data.progress >= data.total && data.total > 0) {
							polling = false;
							setTimeout(() => {
								progressBar.style.display = 'none';
								progressFill.style.width = '0%';
								alert(`Cleaned up ingredients for ${data.total} recipe(s).`);
								fetchAndRenderRecipes();
								cleanupIngredientsBtn.disabled = false;
							}, 500);
							return;
						}
					}
				} catch (err) {
					// ignore errors, keep polling
				}
				if (polling) setTimeout(pollProgress, 400);
			}
			pollProgress();
		});
	}

	// Auto-fill URL input if ?url=... is present in query string

// --- Sorting for Extracted Recipes Table ---
let sortDescending = true; // Default: newest first
function sortRecipes(data) {
    data.sort((a, b) => sortDescending ? b.id - a.id : a.id - b.id);
}
	// Sync All Recipes to Display
	const syncBtn = document.getElementById('syncAllToDisplayBtn');
		if (syncBtn) {
			syncBtn.addEventListener('click', async () => {
				if (!confirm('Sync ALL recipes to the display table? This will overwrite existing display records. Continue?')) return;
				syncBtn.disabled = true;
				try {
					const resp = await fetch('/api/recipes/sync-all-to-display', { method: 'POST' });
					const data = await resp.json();
					if (data.success) {
						alert(`Synced ${data.count} recipes to display table!`);
						fetchAndRenderRecipes();
					} else {
						alert('Failed to sync recipes: ' + (data.error || 'Unknown error'));
					}
				} catch (err) {
					alert('Error syncing recipes: ' + err.message);
				}
				syncBtn.disabled = false;
			});
		}

		// Display button (put recipe into recipe_display table)
		document.body.addEventListener('click', async function(e) {
			if (e.target && e.target.classList.contains('display-recipe-btn')) {
				const recipeId = e.target.getAttribute('data-id');
				if (!recipeId) return;
				if (!confirm('Display this recipe? This will copy it to the recipe_display table.')) return;
				const resp = await fetch(`/api/recipes/${recipeId}/display`, { method: 'POST' });
				const data = await resp.json();
				if (data.success) {
					alert('Recipe sent to display table!');
				} else {
					alert('Failed to display recipe: ' + (data.error || 'Unknown error'));
				}
			}
		});
	
		// ...other event listeners and initializations...
		fetchAndRenderAllFieldsRecipes();
		fetchAndRenderRecipes();
		fetchAndRenderUploads();

	function fetchAndRenderAllFieldsRecipes() {
		fetch('/api/recipes')
			.then(res => res.json())
			.then(data => {
				const tbody = document.querySelector('#allFieldsRecipesTable tbody');
				if (!tbody) return;
				tbody.innerHTML = '';
				data.forEach(recipe => {
					const tr = document.createElement('tr');
					tr.innerHTML = `
						<td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${recipe.id}</td>
						<td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${recipe.uploaded_recipe_id || ''}</td>
						<td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${recipe.name || ''}</td>
						<td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${recipe.description || ''}</td>
						<td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${recipe.ingredients || ''}</td>
						<td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${recipe.serving_size !== undefined && recipe.serving_size !== null ? recipe.serving_size : ''}</td>
						<td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${recipe.url || ''}</td>
						<td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${recipe.instructions || ''}</td>
						<td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${recipe.instructions_extracted || ''}</td>
						<td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${recipe.ingredients_display || ''}</td>
						<td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${recipe.extracted_ingredients || ''}</td>
						<td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${recipe.extracted_serving_size || ''}</td>
						<td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${recipe.extracted_instructions || ''}</td>
						<td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${recipe.instructions_display || ''}</td>
						<td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${recipe.ingredients_inventories || ''}</td>
					`;
					tbody.appendChild(tr);
				});
			})
			.catch(err => {
				const tbody = document.querySelector('#allFieldsRecipesTable tbody');
				if (tbody) tbody.innerHTML = `<tr><td colspan="15" style="color:red;">Failed to load recipes: ${err.message}</td></tr>`;
			});
	}
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
								   <button class='display-recipe-btn' data-id='${recipe.id}' style='background:#1976d2;color:#fff;border:none;padding:0.4rem 0.8rem;border-radius:4px;cursor:pointer;margin-left:0.5rem;'>Display</button>
								   <button class='transfer-instructions-btn' data-id='${recipe.id}' style='background:#8e24aa;color:#fff;border:none;padding:0.4rem 0.8rem;border-radius:4px;cursor:pointer;margin-left:0.5rem;display:none;'>Transfer Instructions</button>
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
					document.querySelectorAll('.transfer-instructions-btn').forEach(btn => {
						btn.addEventListener('click', function() {
							const recipeId = this.getAttribute('data-id');
							if (!recipeId) return;
							if (!confirm('Copy extracted instructions to the main instructions field for this recipe?')) return;
							fetch(`/api/recipes/${recipeId}/transfer-instructions`, { method: 'POST' })
								.then(res => res.json())
								.then(data => {
									if (data.success) {
										alert('Instructions transferred!');
										fetchAndRenderRecipes();
									} else {
										alert('Failed to transfer instructions.');
									}
								})
								.catch(() => alert('Error contacting server.'));
						});
					});
				})
				.catch(err => {
					console.error('Error fetching recipes:', err);
					const tbody = document.querySelector('#mainRecipesTable tbody');
					if (tbody) tbody.innerHTML = '<tr><td colspan="12" style="color:red;">Failed to load recipes: ' + err.message + '</td></tr>';
				});
		}
	});
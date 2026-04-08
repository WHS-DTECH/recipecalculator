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
	const cleanupSelectedRecipeKey = 'recipePublishSelectedRecipeId';
	const publishStatusFilterKey = 'recipePublishStatusFilter';
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
			tbody.innerHTML = '';
			sortedRecipes.forEach(recipe => {
				const tr = document.createElement('tr');
				columns.forEach(col => {
					const td = document.createElement('td');
					if (col === 'url') {
						const url = getRecipeColumnValue(recipe, col);
						if (url) {
							const link = document.createElement('a');
							link.href = url;
							link.target = '_blank';
							link.textContent = 'Link';
							td.appendChild(link);
						}
					} else if (col === 'instructions_display' || col === 'ingredients_display') {
						const value = getRecipeColumnValue(recipe, col);
					if (value && (value.includes('<ol') || value.includes('<ul') || value.includes('<li'))) {
							td.innerHTML = value;
						} else {
							td.textContent = value;
						}
					} else if (col === 'actions') {
						td.innerHTML = getRecipeColumnValue(recipe, col);
					} else {
						td.textContent = getRecipeColumnValue(recipe, col);
					}
					tr.appendChild(td);
				});
				tbody.appendChild(tr);
			});
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

function setRecipeFilterSelection(recipeId) {
	const filter = document.getElementById('recipeIdFilter');
	if (!filter) return '';
	const wanted = String(recipeId || '').trim();
	if (!wanted) return '';
	const hasWanted = Array.from(filter.options).some(opt => String(opt.value) === wanted);
	if (!hasWanted) return '';
	filter.value = wanted;
	sessionStorage.setItem(cleanupSelectedRecipeKey, wanted);
	return wanted;
}

function getSelectedPublishStatusFilter() {
	const statusFilter = document.getElementById('publishStatusFilter');
	return statusFilter ? String(statusFilter.value || 'all') : 'all';
}

function setPublishStatusFilterSelection(value) {
	const statusFilter = document.getElementById('publishStatusFilter');
	if (!statusFilter) return 'all';
	const wanted = String(value || 'all');
	const valid = ['all', 'published', 'unpublished'].includes(wanted) ? wanted : 'all';
	statusFilter.value = valid;
	sessionStorage.setItem(publishStatusFilterKey, valid);
	return valid;
}

function filterAndRenderRecipesById(recipes, selectedId, publishStatus = 'all') {
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
	if (publishStatus === 'published') {
		filtered = filtered.filter(r => publishedRecipeIds.has(Number(r.id)));
	} else if (publishStatus === 'unpublished') {
		filtered = filtered.filter(r => !publishedRecipeIds.has(Number(r.id)));
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
	tbody.innerHTML = '';
	sortedRecipes.forEach(recipe => {
		const tr = document.createElement('tr');
		columns.forEach(col => {
			const td = document.createElement('td');
			if (col === 'url') {
				const url = getRecipeColumnValue(recipe, col);
				if (url) {
					const link = document.createElement('a');
					link.href = url;
					link.target = '_blank';
					link.textContent = 'Link';
					td.appendChild(link);
				}
			} else if (col === 'instructions_display' || col === 'ingredients_display') {
				const value = getRecipeColumnValue(recipe, col);
				if (value && (value.includes('<ol') || value.includes('<ul') || value.includes('<li'))) {
					td.innerHTML = value;
				} else {
					td.textContent = value;
				}
			} else if (col === 'actions') {
				td.innerHTML = getRecipeColumnValue(recipe, col);
			} else {
				td.textContent = getRecipeColumnValue(recipe, col);
			}
			tr.appendChild(td);
		});
		tbody.appendChild(tr);
	});
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
			const persistedRecipeId = sessionStorage.getItem(cleanupSelectedRecipeKey) || '';
			const persistedStatusFilter = sessionStorage.getItem(publishStatusFilterKey) || 'all';
			const selectedStatusFilter = setPublishStatusFilterSelection(persistedStatusFilter);
			const selectedRecipeId = persistedRecipeId ? (setRecipeFilterSelection(persistedRecipeId) || '') : '';
			console.log('[DEBUG] Populating RecipeID filter with:', data.map(getRecipeFilterLabel).filter(Boolean));
			filterAndRenderRecipesById(data, selectedRecipeId, selectedStatusFilter);
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
			const selectedStatus = getSelectedPublishStatusFilter();
			if (selectedId) sessionStorage.setItem(cleanupSelectedRecipeKey, selectedId);
			sessionStorage.setItem(publishStatusFilterKey, selectedStatus);
			console.log('[DEBUG] Filter button clicked. Selected RecipeID:', selectedId);
			filterAndRenderRecipesById(allRecipesCache, selectedId, selectedStatus);
		});
	}

	const statusFilter = document.getElementById('publishStatusFilter');
	if (statusFilter) {
		statusFilter.addEventListener('change', () => {
			const filter = document.getElementById('recipeIdFilter');
			const selectedId = filter ? filter.value : '';
			const selectedStatus = getSelectedPublishStatusFilter();
			sessionStorage.setItem(publishStatusFilterKey, selectedStatus);
			filterAndRenderRecipesById(allRecipesCache, selectedId, selectedStatus);
		});
	}

	const refreshBtn = document.getElementById('refreshRecipesBtn');
	if (refreshBtn) {
		refreshBtn.addEventListener('click', async () => {
			refreshBtn.disabled = true;
			const selectedId = (document.getElementById('recipeIdFilter') || {}).value || '';
			await refreshRecipesFromApi(selectedId, getSelectedPublishStatusFilter());
			refreshBtn.disabled = false;
		});
	}

	const autoPublishBtn = document.getElementById('autoPublishBtn');
	const autoPublishReviewBox = document.getElementById('autoPublishReviewBox');
	const autoPublishReviewText = document.getElementById('autoPublishReviewText');
	const autoPublishAcceptBtn = document.getElementById('autoPublishAcceptBtn');
	const autoPublishDeclineBtn = document.getElementById('autoPublishDeclineBtn');
	let pendingAutoPublishRecipeId = null;
	const cleanupProgressPanel = document.getElementById('cleanupProgressPanel');

	async function postJsonChecked(url, payload, stepLabel) {
		const resp = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload || {})
		});
		let data = null;
		try {
			data = await resp.json();
		} catch (_) {
			data = null;
		}
		if (!resp.ok || (data && data.error)) {
			const detail = (data && (data.error || data.message)) || `${resp.status} ${resp.statusText}`;
			throw new Error(`${stepLabel} failed: ${detail}`);
		}
		return data || { success: true };
	}

	async function publishRecipeById(recipeId) {
		const resp = await fetch(`/api/recipes/${recipeId}/display`, { method: 'POST' });
		const data = await resp.json();
		if (!data.success) {
			throw new Error(data.error || 'Unknown publish error');
		}
		publishedRecipeIds.add(Number(recipeId));
		await refreshRecipesFromApi(String(recipeId));
	}

	if (autoPublishBtn) {
		autoPublishBtn.addEventListener('click', async () => {
			const selectedFromFilter = String((document.getElementById('recipeIdFilter') || {}).value || '').trim();
			let recipeId = Number(selectedFromFilter);
			if (!Number.isInteger(recipeId) || recipeId <= 0) {
				const recipeIdInput = prompt('Enter the RecipeID to Auto Publish:');
				if (recipeIdInput === null) return;
				recipeId = Number(String(recipeIdInput).trim());
			}
			if (!Number.isInteger(recipeId) || recipeId <= 0) {
				alert('Please enter a valid numeric RecipeID.');
				return;
			}

			if (!confirm(`Run Auto Publish for RecipeID ${recipeId}?\n\nThis will run Cleanup Instructions, then Cleanup Ingredients, then refresh the table.`)) {
				return;
			}

			sessionStorage.setItem(cleanupSelectedRecipeKey, String(recipeId));
			autoPublishBtn.disabled = true;
			if (autoPublishReviewBox) autoPublishReviewBox.style.display = 'none';

			const instructionsProgressBar = document.getElementById('cleanupProgressBar');
			const instructionsProgressFill = document.getElementById('cleanupProgressFill');
			const ingredientsProgressBar = document.getElementById('cleanupIngredientsProgressBar');
			const ingredientsProgressFill = document.getElementById('cleanupIngredientsProgressFill');
			if (cleanupProgressPanel) cleanupProgressPanel.style.display = 'block';
			if (instructionsProgressBar && instructionsProgressFill) {
				instructionsProgressBar.style.display = 'block';
				instructionsProgressFill.style.width = '0%';
			}
			if (ingredientsProgressBar && ingredientsProgressFill) {
				ingredientsProgressBar.style.display = 'block';
				ingredientsProgressFill.style.width = '0%';
			}

			try {
				await postJsonChecked('/api/recipes/cleanup-instructions-stepwise', { recipeId }, 'Cleanup Instructions');
				await waitForCleanupCompletion('/api/recipes/cleanup-instructions-progress', instructionsProgressFill);

				await postJsonChecked('/api/recipes/cleanup-ingredients-stepwise', { recipeId }, 'Cleanup Ingredients');
				await waitForCleanupCompletion('/api/recipes/cleanup-ingredients-progress', ingredientsProgressFill);

				try {
					await postJsonChecked('/api/ingredients/inventory/sync', { recipeId, reseed: true }, 'Inventory Sync');
				} catch (syncErr) {
					console.warn('[DEBUG][Auto Publish] Inventory sync failed:', syncErr);
				}

				if (instructionsProgressFill) instructionsProgressFill.style.width = '100%';
				if (ingredientsProgressFill) ingredientsProgressFill.style.width = '100%';
				if (instructionsProgressBar && instructionsProgressFill) {
					instructionsProgressBar.style.display = 'none';
					instructionsProgressFill.style.width = '0%';
				}
				if (ingredientsProgressBar && ingredientsProgressFill) {
					ingredientsProgressBar.style.display = 'none';
					ingredientsProgressFill.style.width = '0%';
				}
				if (cleanupProgressPanel) cleanupProgressPanel.style.display = 'none';

				await refreshRecipesFromApi(String(recipeId));
				await new Promise(resolve => setTimeout(resolve, 250));
				await refreshRecipesFromApi(String(recipeId));

				pendingAutoPublishRecipeId = recipeId;
				if (autoPublishReviewText) {
					autoPublishReviewText.textContent = `RecipeID ${recipeId} cleanup complete. Choose Accept to publish or Decline to return.`;
				}
				if (autoPublishReviewBox) {
					autoPublishReviewBox.style.display = 'block';
					autoPublishReviewBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
				}
			} catch (err) {
				if (instructionsProgressBar && instructionsProgressFill) {
					instructionsProgressBar.style.display = 'none';
					instructionsProgressFill.style.width = '0%';
				}
				if (ingredientsProgressBar && ingredientsProgressFill) {
					ingredientsProgressBar.style.display = 'none';
					ingredientsProgressFill.style.width = '0%';
				}
				if (cleanupProgressPanel) cleanupProgressPanel.style.display = 'none';
				alert('Auto Publish failed: ' + (err?.message || err));
			} finally {
				autoPublishBtn.disabled = false;
			}
		});
	}

	if (autoPublishAcceptBtn) {
		autoPublishAcceptBtn.addEventListener('click', async () => {
			const recipeId = Number(pendingAutoPublishRecipeId);
			if (!Number.isInteger(recipeId) || recipeId <= 0) {
				alert('No recipe is ready to publish. Please run Auto Publish first.');
				return;
			}

			autoPublishAcceptBtn.disabled = true;
			try {
				await publishRecipeById(recipeId);
				alert(`RecipeID ${recipeId} published.`);
				if (autoPublishReviewBox) autoPublishReviewBox.style.display = 'none';
				pendingAutoPublishRecipeId = null;
			} catch (err) {
				alert('Publish failed: ' + err.message);
			} finally {
				autoPublishAcceptBtn.disabled = false;
			}
		});
	}

	if (autoPublishDeclineBtn) {
		autoPublishDeclineBtn.addEventListener('click', () => {
			pendingAutoPublishRecipeId = null;
			window.location.href = 'recipe_publish.html';
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
				filterAndRenderRecipesById(allRecipesCache, selectedId, getSelectedPublishStatusFilter());
				alert(`RecipeID ${recipeId} published.`);
			} else {
				alert('Publish failed: ' + (data.error || 'Unknown error'));
			}
		} catch (err) {
			alert('Publish failed: ' + err.message);
		}
		btn.disabled = false;
	});

	async function refreshRecipesFromApi(preferredRecipeId = '', preferredStatusFilter = '') {
		try {
			const filter = document.getElementById('recipeIdFilter');
			const previousSelectedId = filter ? (filter.value || '') : '';
			const previousStatusFilter = getSelectedPublishStatusFilter();
			const persistedRecipeId = sessionStorage.getItem(cleanupSelectedRecipeKey) || '';
			const persistedStatusFilter = sessionStorage.getItem(publishStatusFilterKey) || 'all';
			await refreshPublishedRecipeIds();
			const resp = await fetch(`/api/recipes?_ts=${Date.now()}`, { cache: 'no-store' });
			const data = await resp.json();
			allRecipesCache = Array.isArray(data) ? data : [];
			populateRecipeIdFilterOptions(allRecipesCache);

			let selectedId = previousSelectedId;
			const targetRecipeId = String(preferredRecipeId || persistedRecipeId || previousSelectedId || '').trim();
			if (targetRecipeId) {
				selectedId = setRecipeFilterSelection(targetRecipeId) || previousSelectedId;
			}

			const targetStatusFilter = String(preferredStatusFilter || persistedStatusFilter || previousStatusFilter || 'all').trim();
			const selectedStatusFilter = setPublishStatusFilterSelection(targetStatusFilter);

			filterAndRenderRecipesById(allRecipesCache, selectedId, selectedStatusFilter);
		} catch (err) {
			console.error('[DEBUG] Failed to refresh recipes after cleanup:', err);
		}
	}

	async function waitForCleanupCompletion(progressUrl, progressFill) {
		let sawRunning = false;
		let keepPolling = true;
		let guardPolls = 0;
		while (keepPolling) {
			try {
				const resp = await fetch(progressUrl);
				const data = await resp.json();
				if (data && data.running === true) sawRunning = true;
				const doneCount = Number(data?.progress ?? data?.current ?? 0);
				const totalCount = Number(data?.total ?? 0);
				if (progressFill && Number.isFinite(doneCount) && Number.isFinite(totalCount)) {
					const percent = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : (sawRunning ? 100 : 0);
					progressFill.style.width = percent + '%';
				}
				const hasNumericProgress = Number.isFinite(doneCount) && Number.isFinite(totalCount);
				const alreadyComplete = hasNumericProgress && totalCount > 0 && doneCount >= totalCount;
				const emptyComplete = hasNumericProgress && totalCount === 0 && data && data.running === false;
				if (!sawRunning && alreadyComplete) {
					keepPolling = false;
					continue;
				}
				if (!sawRunning && emptyComplete) {
					if (progressFill) progressFill.style.width = '100%';
					keepPolling = false;
					continue;
				}
				if (sawRunning && data && data.running === false) {
					keepPolling = false;
					continue;
				}
			} catch {
				keepPolling = false;
			}
			guardPolls++;
			if (guardPolls > 180) {
				console.warn('[DEBUG] waitForCleanupCompletion guard timeout reached for', progressUrl);
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
			sessionStorage.setItem(cleanupSelectedRecipeKey, String(recipeId));
			if (!confirm(`Clean Instructions Display for RecipeID ${recipeId}?`)) return;
			const previousInstructionsDisplay = getRecipeColumnValue(
				allRecipesCache.find(r => Number(r.id) === recipeId),
				'instructions_display'
			);

			cleanupInstructionsBtnActive.disabled = true;
			const progressBar = document.getElementById('cleanupProgressBar');
			const progressFill = document.getElementById('cleanupProgressFill');
			const ingredientsProgressBar = document.getElementById('cleanupIngredientsProgressBar');
			if (progressBar && progressFill) {
				if (cleanupProgressPanel) cleanupProgressPanel.style.display = 'block';
				progressBar.style.display = 'block';
				progressFill.style.width = '0%';
				if (ingredientsProgressBar) ingredientsProgressBar.style.display = 'none';
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
				if (cleanupProgressPanel) cleanupProgressPanel.style.display = 'none';
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
			sessionStorage.setItem(cleanupSelectedRecipeKey, String(recipeId));
			if (!confirm(`Clean Ingredients Display for RecipeID ${recipeId}?`)) return;
			const previousIngredientsDisplay = getRecipeColumnValue(
				allRecipesCache.find(r => Number(r.id) === recipeId),
				'ingredients_display'
			);
			console.log(`[DEBUG][Cleanup Ingredients] RecipeID ${recipeId} previous ingredients_display:`, String(previousIngredientsDisplay || '').slice(0, 500));

			cleanupIngredientsBtnActive.disabled = true;
			const progressBar = document.getElementById('cleanupIngredientsProgressBar');
			const progressFill = document.getElementById('cleanupIngredientsProgressFill');
			const instructionsProgressBar = document.getElementById('cleanupProgressBar');
			if (progressBar && progressFill) {
				if (cleanupProgressPanel) cleanupProgressPanel.style.display = 'block';
				progressBar.style.display = 'block';
				progressFill.style.width = '0%';
				if (instructionsProgressBar) instructionsProgressBar.style.display = 'none';
			}

			await fetch('/api/recipes/cleanup-ingredients-stepwise', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ recipeId })
			});

			await waitForCleanupCompletion('/api/recipes/cleanup-ingredients-progress', progressFill);

			try {
				const inventorySyncResp = await fetch('/api/ingredients/inventory/sync', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ recipeId, reseed: true })
				});
				const inventorySyncData = await inventorySyncResp.json();
				console.log(`[DEBUG][Cleanup Ingredients] Inventory reseed sync for RecipeID ${recipeId}:`, inventorySyncData);
			} catch (syncErr) {
				console.warn(`[DEBUG][Cleanup Ingredients] Inventory reseed sync failed for RecipeID ${recipeId}:`, syncErr);
			}

			if (progressBar && progressFill) {
				progressBar.style.display = 'none';
				progressFill.style.width = '0%';
				if (cleanupProgressPanel) cleanupProgressPanel.style.display = 'none';
			}
			cleanupIngredientsBtnActive.disabled = false;
			await refreshRecipesFromApi(String(recipeId));
			await new Promise(resolve => setTimeout(resolve, 250));
			await refreshRecipesFromApi(String(recipeId));
			const refreshedIngredientsDisplay = getRecipeColumnValue(
				allRecipesCache.find(r => Number(r.id) === recipeId),
				'ingredients_display'
			);
			console.log(`[DEBUG][Cleanup Ingredients] RecipeID ${recipeId} refreshed ingredients_display:`, String(refreshedIngredientsDisplay || '').slice(0, 500));
			if (String(refreshedIngredientsDisplay || '').trim() === String(previousIngredientsDisplay || '').trim()) {
				console.warn('[DEBUG] Ingredients display unchanged after cleanup refresh; forcing page reload.');
				window.location.reload();
				return;
			}
			alert(`Ingredients cleanup finished for RecipeID ${recipeId}.`);
		});
	}

	// Stop here: legacy code below this point is kept for reference only and must not run on recipe_publish.html.
	return;
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
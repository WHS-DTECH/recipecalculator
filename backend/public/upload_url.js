
// --- Sorting for Extracted Recipes Table ---
let sortDescending = true; // Default: newest first
function sortRecipes(data) {
    data.sort((a, b) => sortDescending ? b.id - a.id : a.id - b.id);
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
	const cleanupInstructionsBtn = Array.from(document.querySelectorAll('button')).find(btn => btn.textContent.trim() === 'Cleanup Instructions');
	if (cleanupInstructionsBtn) {
		cleanupInstructionsBtn.addEventListener('click', async () => {
			if (!confirm('This will clean up all HTML formatting from the Instructions field for all recipes. Continue?')) return;
			cleanupInstructionsBtn.disabled = true;
			const progressBar = document.getElementById('cleanupProgressBar');
			const progressFill = document.getElementById('cleanupProgressFill');
			progressBar.style.display = 'block';
			progressFill.style.width = '0%';

			let polling = true;
			let lastProgress = 0;

			// Start the stepwise cleanup (POST)
			fetch('/api/recipes/cleanup-instructions-stepwise', { method: 'POST' });

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
	const cleanupIngredientsBtn = Array.from(document.querySelectorAll('button')).find(btn => btn.textContent.trim() === 'Cleanup Ingredients');
	if (cleanupIngredientsBtn) {
		cleanupIngredientsBtn.addEventListener('click', async () => {
			if (!confirm('This will clean up the Extracted Ingredients field and copy the cleaned version to Ingredients_display for all recipes. Continue?')) return;
			cleanupIngredientsBtn.disabled = true;
			const progressBar = document.getElementById('cleanupProgressBar');
			const progressFill = document.getElementById('cleanupProgressFill');
			progressBar.style.display = 'block';
			progressFill.style.width = '0%';

			let polling = true;
			let lastProgress = 0;

			// Start the stepwise cleanup (POST)
			fetch('/api/recipes/cleanup-ingredients-stepwise', { method: 'POST' });

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
		fetchAndRenderRecipes();
		fetchAndRenderUploads();
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
						   <td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${recipe.name || ''}</td>
						   <td style='border:1px solid #eee;padding:0.5rem 0.7rem; color:indigo;'>${recipe.extracted_ingredients || ''}</td>
						   <td style='border:1px solid #eee;padding:0.5rem 1.5rem; min-width:220px; color:#1976d2; white-space:normal; word-break:break-word;'>${recipe.ingredients_display || ''}</td>
						   <td style='border:1px solid #eee;padding:0.5rem 0.7rem; color:indigo;'>${recipe.instructions_extracted || ''}</td>
						   <td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${recipe.serving_size !== undefined && recipe.serving_size !== null ? recipe.serving_size : ''}</td>
						   <td style='border:1px solid #eee;padding:0.5rem 0.7rem; color:purple;'>${recipe.instructions_display || ''}</td>
						   <td style='border:1px solid #eee;padding:0.5rem 0.7rem; color:#009688; max-width:120px; text-align:center; background:#f8f8ff;'>
							   <button class="view-raw-btn" data-id="${recipe.id}" style="background:#1976d2;color:#fff;border:none;padding:0.3rem 0.8rem;border-radius:4px;cursor:pointer;">View</button>
						   </td>
						   <td style='border:1px solid #eee;padding:0.5rem 0.7rem;'>${recipe.url ? `<a href='${recipe.url}' target='_blank'>Link</a>` : ''}</td>
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

function fetchAndRenderUploads() {
	fetch('/api/uploads')
		.then(res => res.json())
		.then(data => {
			const tbody = document.querySelector('#uploadedRecipesTable tbody');
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

// Show raw data in a new window for uploads table
function showRawDataPopup(rawData) {
	const win = window.open('', '_blank', 'width=700,height=600,resizable,scrollbars');
	if (!win) return;
	win.document.write(`
		<html><head><title>Raw Data</title>
		<style>
		body { font-family: monospace; background: #f8f8ff; margin: 0; padding: 1.5em; }
		pre { white-space: pre-wrap; word-break: break-word; font-size: 1.08em; background: #fff; border: 1px solid #ddd; border-radius: 6px; padding: 1em; }
		button { margin-top: 1.5em; padding: 0.5em 1.2em; background: #1976d2; color: #fff; border: none; border-radius: 4px; font-size: 1em; cursor: pointer; }
		</style></head><body>
		<h2>Raw Data (from Upload)</h2>
		<pre>"${String(rawData).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '\n')}"</pre>
		<button onclick="window.close()">Close</button>
		</body></html>
	`);
	win.document.close();
}

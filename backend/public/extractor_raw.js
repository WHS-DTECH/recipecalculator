

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', function () {
    console.log('[DEBUG] DOMContentLoaded - extractor_raw.js loaded');
    // (Debug log removed)

    // Assign DOM elements after DOM is loaded
    const recipeSelect = document.getElementById('uploadSelect');
    const extractBtn = document.getElementById('extractDataBtn');
    const extractRenderedBtn = document.getElementById('extractRenderedBtn');
    const smartExtractBtn = document.getElementById('smartExtractBtn');
    console.log('[DEBUG] DOM elements assigned:', {
        recipeSelect,
        extractBtn,
        extractRenderedBtn,
        smartExtractBtn
    });
                // Smart Extract button handler
    if (smartExtractBtn) {
        smartExtractBtn.addEventListener('click', async function() {
            const recipeId = recipeSelect.value;
            console.log('[DEBUG] Smart Extract clicked. Recipe ID:', recipeId);
            if (!recipeId) {
                alert('Please select a recipe to extract data from.');
                console.log('[DEBUG] No recipe selected for Smart Extract');
                return;
            }
            smartExtractBtn.disabled = true;
            smartExtractBtn.textContent = 'Extracting...';
            // Try Extract Data logic first
            try {
                console.log('[DEBUG] Attempting to fetch /RawDataTXT/' + recipeId + '.txt');
                const rawRes = await fetch(`/RawDataTXT/${recipeId}.txt`);
                if (!rawRes.ok) throw new Error('File not found');
                const data = await rawRes.text();
                rawDataInput.value = data;
                console.log('[DEBUG] Raw data loaded from file:', data.slice(0, 200));
                smartExtractBtn.disabled = false;
                smartExtractBtn.textContent = 'Smart Extract';
                return; // Success, do not continue
            } catch (err) {
                console.log('[DEBUG] Raw data file not found, error:', err);
                // If failed, try Extract Rendered HTML logic
                try {
                    console.log('[DEBUG] Fetching /api/recipes for fallback');
                    const recipes = await fetch('/api/recipes').then(res => res.json());
                    const recipe = recipes.find(r => r.id == recipeId);
                    const url = recipe && recipe.url ? recipe.url : null;
                    if (!url) throw new Error('No URL found for this recipe.');
                    console.log('[DEBUG] Fallback: Fetching rendered HTML for URL:', url);
                    const htmlRes = await fetch(`/api/extract-rendered-html?url=${encodeURIComponent(url)}`);
                    if (!htmlRes.ok) throw new Error('Failed to fetch rendered HTML');
                    const htmlData = await htmlRes.text();
                    rawDataInput.value = htmlData;
                    console.log('[DEBUG] Rendered HTML loaded:', htmlData.slice(0, 200));
                } catch (err2) {
                    alert('Failed to extract raw data and rendered HTML.');
                    console.log('[DEBUG] Fallback failed:', err2);
                } finally {
                    smartExtractBtn.disabled = false;
                    smartExtractBtn.textContent = 'Smart Extract';
                }
            }
        });
    }
        // Puppeteer-based extraction handler
    extractRenderedBtn.addEventListener('click', function() {
        const recipeId = recipeSelect.value;
        console.log('[DEBUG] Extract Rendered HTML clicked. Recipe ID:', recipeId);
        if (!recipeId) {
            alert('Please select a recipe to extract data from.');
            console.log('[DEBUG] No recipe selected for Extract Rendered HTML');
            return;
        }
        extractRenderedBtn.disabled = true;
        extractRenderedBtn.textContent = 'Extracting...';
        // Fetch recipe to get the URL
        fetch('/api/recipes')
            .then(res => res.json())
            .then(recipes => {
                const recipe = recipes.find(r => r.id == recipeId);
                const url = recipe && recipe.url ? recipe.url : null;
                if (!url) {
                    alert('No URL found for this recipe.');
                    extractRenderedBtn.disabled = false;
                    extractRenderedBtn.textContent = 'Extract Rendered HTML (Puppeteer)';
                    console.log('[DEBUG] No URL found for recipe:', recipe);
                    return;
                }
                // Call backend endpoint to run Puppeteer extractor
                console.log('[DEBUG] Fetching /api/extract-rendered-html for URL:', url);
                fetch(`/api/extract-rendered-html?url=${encodeURIComponent(url)}`)
                    .then(res => {
                        if (!res.ok) throw new Error('Failed to fetch rendered HTML');
                        return res.text();
                    })
                    .then(data => {
                        rawDataInput.value = data;
                        extractRenderedBtn.disabled = false;
                        extractRenderedBtn.textContent = 'Extract Rendered HTML (Puppeteer)';
                        console.log('[DEBUG] Rendered HTML loaded:', data.slice(0, 200));
                    })
                    .catch((err) => {
                        alert('Failed to extract rendered HTML.');
                        extractRenderedBtn.disabled = false;
                        extractRenderedBtn.textContent = 'Extract Rendered HTML (Puppeteer)';
                        console.log('[DEBUG] Error fetching rendered HTML:', err);
                    });
            })
            .catch((err) => {
                alert('Failed to extract rendered HTML.');
                extractRenderedBtn.disabled = false;
                extractRenderedBtn.textContent = 'Extract Rendered HTML (Puppeteer)';
                console.log('[DEBUG] Error fetching recipes for rendered HTML:', err);
            });
    });
    const rawDataInput = document.getElementById('rawDataInput');
    const saveBtn = document.getElementById('saveRawDataBtn');

    // Extract Data button handler
    extractBtn.addEventListener('click', function() {
        const recipeId = recipeSelect.value;
        console.log('[DEBUG] Extract Data clicked. Recipe ID:', recipeId);
        if (!recipeId) {
            alert('Please select a recipe to extract data from.');
            console.log('[DEBUG] No recipe selected for Extract Data');
            return;
        }
        extractBtn.disabled = true;
        extractBtn.textContent = 'Extracting...';
        // Fetch raw HTML from the file endpoint
        console.log('[DEBUG] Fetching /RawDataTXT/' + recipeId + '.txt');
        fetch(`/RawDataTXT/${recipeId}.txt`)
            .then(res => {
                if (!res.ok) throw new Error('File not found');
                return res.text();
            })
            .then(data => {
                rawDataInput.value = data;
                extractBtn.disabled = false;
                extractBtn.textContent = 'Extract Data';
                console.log('[DEBUG] Raw data loaded from file:', data.slice(0, 200));
            })
            .catch((err) => {
                rawDataInput.value = '';
                alert('No raw data file found for this recipe.');
                extractBtn.disabled = false;
                extractBtn.textContent = 'Extract Data';
                console.log('[DEBUG] Error fetching raw data file:', err);
            });
    });
    // (Debug log removed)

    // Populate recipeSelect with recipes only (no uploads)
    fetch('/api/recipes')
        .then(res => res.json())
        .then(recipes => {
            console.log('[DEBUG] Recipes loaded for dropdown:', recipes.map(r => ({id: r.id, url: r.url, name: r.name})));
            recipeSelect.innerHTML = '';
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = 'Select a recipe...';
            recipeSelect.appendChild(defaultOption);
            recipes.forEach(recipe => {
                const label = `[${recipe.id}] ${recipe.url || recipe.name || 'No URL'}`;
                const option = document.createElement('option');
                option.value = recipe.id;
                option.textContent = label;
                recipeSelect.appendChild(option);
            });
        })
        .catch((err) => {
            console.log('[DEBUG] Error loading recipes for dropdown:', err);
        });

    saveBtn.addEventListener('click', function() {
        const recipeId = recipeSelect.value;
        console.log('[DEBUG] Save Raw Data clicked. Recipe ID:', recipeId);
        if (!recipeId) {
            console.log('[DEBUG] No recipe selected for Save Raw Data');
            return;
        }
        const rawData = rawDataInput.value;
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
        console.log('[DEBUG] Sending PUT to /api/recipes/' + recipeId + '/raw with data length:', rawData.length);
        fetch(`/api/recipes/${recipeId}/raw`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ raw_data: rawData })
        })
        .then(res => res.json())
        .then(data => {
            console.log('[DEBUG] Save Raw Data response:', data);
            if (data.success) {
                // Trigger download of raw data as RecipeID.txt
                const blob = new Blob([rawData], { type: 'text/plain' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `${recipeId}.txt`;
                document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                    document.body.removeChild(a);
                    URL.revokeObjectURL(a.href);
                }, 100);
                alert(`Raw data saved successfully! File: ${recipeId}.txt`);
                saveBtn.textContent = 'Saved!';
                setTimeout(() => { saveBtn.textContent = 'Save Raw Data'; saveBtn.disabled = false; }, 1200);
            } else {
                saveBtn.textContent = 'Save Raw Data';
                saveBtn.disabled = false;
                console.log('[DEBUG] Save Raw Data failed:', data);
            }
        })
        .catch((err) => {
            saveBtn.textContent = 'Save Raw Data';
            saveBtn.disabled = false;
            console.log('[DEBUG] Error saving raw data:', err);
        });
    });

    saveBtn.addEventListener('click', function() {
        //alert('[DEBUG] Save Raw Data button clicked');
        console.log('[DEBUG] Save Raw Data button clicked');
        const id = uploadSelect.value;
        //alert('[DEBUG] Selected upload ID: ' + id);
        console.log('[DEBUG] Selected upload ID:', id);
        if (!id) { alert('Please select an upload.'); return; }
        const rawData = rawDataInput.value;
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
        //alert('[DEBUG] About to send fetch to /api/uploads/' + id + '/raw');
        console.log('[DEBUG] About to send fetch to /api/uploads/' + id + '/raw');
        fetch(`/api/uploads/${id}/raw`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ raw_data: rawData })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                if (data.file === false) {
                    alert('Raw data was saved to the database, but failed to write to the server folder. Error: ' + (data.fileError || 'Unknown error'));
                } else {
                    // Trigger download of raw data as RecipeID.txt
                    const blob = new Blob([rawData], { type: 'text/plain' });
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = `${id}.txt`;
                    document.body.appendChild(a);
                    a.click();
                    setTimeout(() => {
                        document.body.removeChild(a);
                        URL.revokeObjectURL(a.href);
                    }, 100);
                }
                saveBtn.textContent = 'Saved!';
                setTimeout(() => { saveBtn.textContent = 'Save Raw Data'; saveBtn.disabled = false; }, 1200);
            } else {
                //alert('Failed to save raw data.');
                saveBtn.textContent = 'Save Raw Data';
                saveBtn.disabled = false;
            }
        })
        .catch(() => {
            alert('Failed to save raw data.');
            saveBtn.textContent = 'Save Raw Data';
            saveBtn.disabled = false;
        });
    });
});

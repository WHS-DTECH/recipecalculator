

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', function () {
    // (Debug log removed)

    // Assign DOM elements after DOM is loaded
    const uploadSelect = document.getElementById('uploadSelect');
    const extractBtn = document.getElementById('extractDataBtn');
    const extractRenderedBtn = document.getElementById('extractRenderedBtn');
        // Puppeteer-based extraction handler
        extractRenderedBtn.addEventListener('click', function() {
            const id = uploadSelect.value;
            if (!id) {
                alert('Please select an upload to extract data from.');
                return;
            }
            extractRenderedBtn.disabled = true;
            extractRenderedBtn.textContent = 'Extracting...';
            // Fetch recipes to find the recipeID and URL for this upload
            fetch('/api/recipes')
                .then(res => res.json())
                .then(recipes => {
                    const recipe = recipes.find(r => r.uploaded_recipe_id == id);
                    const recipeId = recipe ? recipe.id : id;
                    const url = recipe && recipe.url ? recipe.url : null;
                    if (!url) {
                        alert('No URL found for this recipe.');
                        extractRenderedBtn.disabled = false;
                        extractRenderedBtn.textContent = 'Extract Rendered HTML (Puppeteer)';
                        return;
                    }
                    // Call backend endpoint to run Puppeteer extractor
                    fetch(`/api/extract-rendered-html?url=${encodeURIComponent(url)}`)
                        .then(res => {
                            if (!res.ok) throw new Error('Failed to fetch rendered HTML');
                            return res.text();
                        })
                        .then(data => {
                            rawDataInput.value = data;
                            extractRenderedBtn.disabled = false;
                            extractRenderedBtn.textContent = 'Extract Rendered HTML (Puppeteer)';
                        })
                        .catch(() => {
                            alert('Failed to extract rendered HTML.');
                            extractRenderedBtn.disabled = false;
                            extractRenderedBtn.textContent = 'Extract Rendered HTML (Puppeteer)';
                        });
                })
                .catch(() => {
                    alert('Failed to extract rendered HTML.');
                    extractRenderedBtn.disabled = false;
                    extractRenderedBtn.textContent = 'Extract Rendered HTML (Puppeteer)';
                });
        });
    const rawDataInput = document.getElementById('rawDataInput');
    const saveBtn = document.getElementById('saveRawDataBtn');

    // Extract Data button handler
    extractBtn.addEventListener('click', function() {
        const id = uploadSelect.value;
        if (!id) {
            alert('Please select an upload to extract data from.');
            return;
        }
        extractBtn.disabled = true;
        extractBtn.textContent = 'Extracting...';
        // Fetch recipes to find the recipeID for this upload
        fetch('/api/recipes')
            .then(res => res.json())
            .then(recipes => {
                const recipe = recipes.find(r => r.uploaded_recipe_id == id);
                const recipeId = recipe ? recipe.id : id;
                // Fetch raw HTML from the file endpoint
                fetch(`/RawDataTXT/${recipeId}.txt`)
                    .then(res => {
                        if (!res.ok) throw new Error('File not found');
                        return res.text();
                    })
                    .then(data => {
                        rawDataInput.value = data;
                        extractBtn.disabled = false;
                        extractBtn.textContent = 'Extract Data';
                    })
                    .catch(() => {
                        rawDataInput.value = '';
                        alert('No raw data file found for this recipe.');
                        extractBtn.disabled = false;
                        extractBtn.textContent = 'Extract Data';
                    });
            })
            .catch(() => {
                alert('Failed to extract raw data.');
                extractBtn.disabled = false;
                extractBtn.textContent = 'Extract Data';
            });
    });
    // (Debug log removed)

    // Populate uploadSelect with uploaded recipes
    // (Debug log removed)
    // Fetch uploads and recipes to build selector with URL & recipeID
    Promise.all([
        fetch('/api/uploads').then(res => res.json()),
        fetch('/api/recipes').then(res => res.json())
    ]).then(([uploads, recipes]) => {
        uploadSelect.innerHTML = '';
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Select a recipe...';
        uploadSelect.appendChild(defaultOption);
        uploads.forEach(upload => {
            // Find recipe with uploaded_recipe_id = upload.id
            const recipe = recipes.find(r => r.uploaded_recipe_id == upload.id);
            let label = '';
            if (recipe) {
                label = `[${recipe.id}] ${recipe.url || upload.source_url || 'No URL'}`;
            } else {
                label = `[No Recipe] ${upload.source_url || 'No URL'} (Upload #${upload.id})`;
            }
            const option = document.createElement('option');
            option.value = upload.id;
            option.textContent = label;
            uploadSelect.appendChild(option);
        });
        if (uploads.length > 0) {
            uploadSelect.selectedIndex = 1;
        }
    }).catch(() => {});

    saveBtn.addEventListener('click', function() {
        const id = uploadSelect.value;
        if (!id) { return; }
        const rawData = rawDataInput.value;
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
        // Fetch recipes to find the recipeID for this upload
        fetch('/api/recipes')
            .then(res => res.json())
            .then(recipes => {
                const recipe = recipes.find(r => r.uploaded_recipe_id == id);
                const recipeId = recipe ? recipe.id : id;
                fetch(`/api/uploads/${id}/raw`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ raw_data: rawData, recipe_id: recipeId })
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
                            a.download = `${recipeId}.txt`;
                            document.body.appendChild(a);
                            a.click();
                            setTimeout(() => {
                                document.body.removeChild(a);
                                URL.revokeObjectURL(a.href);
                            }, 100);
                            alert(`Raw data saved successfully! File: ${recipeId}.txt`);
                        }
                        saveBtn.textContent = 'Saved!';
                        setTimeout(() => { saveBtn.textContent = 'Save Raw Data'; saveBtn.disabled = false; }, 1200);
                    } else {
                        saveBtn.textContent = 'Save Raw Data';
                        saveBtn.disabled = false;
                    }
                })
                .catch(() => {
                    saveBtn.textContent = 'Save Raw Data';
                    saveBtn.disabled = false;
                });
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

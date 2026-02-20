

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', function () {
    // (Debug log removed)

    // Assign DOM elements after DOM is loaded
    const uploadSelect = document.getElementById('uploadSelect');
    const extractBtn = document.getElementById('extractDataBtn');
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
        // Fetch raw data for the selected upload
        fetch(`/api/uploads/${id}`)
            .then(res => res.json())
            .then(upload => {
                if (upload && upload.raw_data) {
                    rawDataInput.value = upload.raw_data;
                } else {
                    rawDataInput.value = '';
                    alert('No raw data found for this upload.');
                }
                extractBtn.disabled = false;
                extractBtn.textContent = 'Extract Data';
            })
            .catch(err => {
                alert('Failed to extract raw data.');
                extractBtn.disabled = false;
                extractBtn.textContent = 'Extract Data';
            });
    });
    // (Debug log removed)

    // Populate uploadSelect with uploaded recipes
    // (Debug log removed)
    fetch('/api/uploads')
        .then(res => res.json())
        .then(uploads => {
            // (Debug log removed)
            // Clear existing options
            uploadSelect.innerHTML = '';
            // Add a default option
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = 'Select a recipe...';
            uploadSelect.appendChild(defaultOption);
            // Add upload options
            uploads.forEach((upload, idx) => {
                // (Debug log removed)
                const option = document.createElement('option');
                option.value = upload.id;
                option.textContent = upload.source_url || `Upload #${upload.id}`;
                uploadSelect.appendChild(option);
            });
            // Select the first upload if available
            if (uploads.length > 0) {
                uploadSelect.selectedIndex = 1;
                // (Debug log removed)
            } else {
                // (Debug log removed)
            }
            // (Debug log removed)
            // (Debug log removed)
        })
        .catch(err => {
            // (Debug log removed)
        });

    saveBtn.addEventListener('click', function() {
        const id = uploadSelect.value;
        if (!id) { return; }
        const rawData = rawDataInput.value;
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
        fetch(`/api/uploads/${id}`)
            .then(res => res.json())
            .then(upload => {
                // Use upload.recipe_id if present, otherwise fallback to upload.id
                const recipeId = upload.recipe_id || upload.id;
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
                            a.download = `${id}.txt`;
                            document.body.appendChild(a);
                            a.click();
                            setTimeout(() => {
                                document.body.removeChild(a);
                                URL.revokeObjectURL(a.href);
                            }, 100);
                            // Only success debug message left:
                            alert(`Raw data saved successfully! File: ${id}.txt`);
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

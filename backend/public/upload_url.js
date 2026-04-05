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

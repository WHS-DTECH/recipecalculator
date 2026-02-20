// Admin Food Brands Management

document.addEventListener('DOMContentLoaded', () => {
  const tableContainer = document.getElementById('food-brands-table-container');
  const addBtn = document.getElementById('add-brand-btn');
  const formContainer = document.getElementById('brand-form-container');

  function fetchBrands() {
    fetch('/api/food_brands')
      .then(res => res.json())
      .then(data => renderTable(data))
      .catch(() => {
        tableContainer.innerHTML = '<div style="color:red;">Failed to load brands.</div>';
      });
  }

  function renderTable(brands) {
    tableContainer.innerHTML = `
      <table style="width:100%;margin-top:1rem;border-collapse:collapse;">
        <thead>
          <tr style="background:#f5f5f5;">
            <th style="border:1px solid #eee;padding:0.5rem 0.7rem;">ID</th>
            <th style="border:1px solid #eee;padding:0.5rem 0.7rem;">Brand Name</th>
            <th style="border:1px solid #eee;padding:0.5rem 0.7rem;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${brands.length === 0 ? `<tr><td colspan='3' style='text-align:center;color:#888;padding:1rem;'>No brands found.</td></tr>` :
            brands.map(brand => `
              <tr>
                <td style="border:1px solid #eee;padding:0.5rem 0.7rem;">${brand.id}</td>
                <td style="border:1px solid #eee;padding:0.5rem 0.7rem;">${brand.brand_name}</td>
                <td style="border:1px solid #eee;padding:0.5rem 0.7rem;">
                  <button class="edit-btn" data-id="${brand.id}" data-name="${brand.brand_name}">Edit</button>
                  <button class="delete-btn" data-id="${brand.id}">Delete</button>
                </td>
              </tr>
            `).join('')}
        </tbody>
      </table>
    `;
    attachTableEvents();
  }

  function attachTableEvents() {
    tableContainer.querySelectorAll('.edit-btn').forEach(btn => {
      btn.onclick = () => showEditForm(btn.dataset.id, btn.dataset.name);
    });
    tableContainer.querySelectorAll('.delete-btn').forEach(btn => {
      btn.onclick = () => deleteBrand(btn.dataset.id);
    });
  }

  addBtn.onclick = () => showAddForm();

  function showAddForm() {
    formContainer.style.display = 'block';
    formContainer.innerHTML = `
      <input type="text" id="new-brand-name" placeholder="Brand Name" />
      <button id="save-new-brand">Save</button>
      <button id="cancel-add">Cancel</button>
    `;
    document.getElementById('save-new-brand').onclick = () => {
      const name = document.getElementById('new-brand-name').value.trim();
      if (!name) return alert('Brand name required');
      fetch('/api/food_brands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand_name: name })
      }).then(res => res.json()).then(() => {
        formContainer.style.display = 'none';
        fetchBrands();
      });
    };
    document.getElementById('cancel-add').onclick = () => {
      formContainer.style.display = 'none';
    };
  }

  function showEditForm(id, name) {
    formContainer.style.display = 'block';
    formContainer.innerHTML = `
      <input type="text" id="edit-brand-name" value="${name}" />
      <button id="save-edit-brand">Save</button>
      <button id="cancel-edit">Cancel</button>
    `;
    document.getElementById('save-edit-brand').onclick = () => {
      const newName = document.getElementById('edit-brand-name').value.trim();
      if (!newName) return alert('Brand name required');
      fetch(`/api/food_brands/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand_name: newName })
      }).then(res => res.json()).then(() => {
        formContainer.style.display = 'none';
        fetchBrands();
      });
    };
    document.getElementById('cancel-edit').onclick = () => {
      formContainer.style.display = 'none';
    };
  }

  function deleteBrand(id) {
    if (!confirm('Delete this brand?')) return;
    fetch(`/api/food_brands/${id}`, { method: 'DELETE' })
      .then(res => res.json())
      .then(() => fetchBrands());
  }

  fetchBrands();
});

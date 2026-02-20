// Admin Aisle Category Management

document.addEventListener('DOMContentLoaded', () => {
  const tableContainer = document.getElementById('aisle-category-table-container');
  const addBtn = document.getElementById('add-aisle-btn');
  const formContainer = document.getElementById('aisle-form-container');

  function fetchCategories() {
    fetch('/api/aisle_category')
      .then(res => res.json())
      .then(data => renderTable(data))
      .catch(() => {
        tableContainer.innerHTML = '<div style="color:red;">Failed to load categories.</div>';
      });
  }

  function renderTable(categories) {
    tableContainer.innerHTML = `
      <table style="width:100%;margin-top:1rem;border-collapse:collapse;">
        <thead>
          <tr style="background:#f5f5f5;">
            <th style="border:1px solid #eee;padding:0.5rem 0.7rem;">ID</th>
            <th style="border:1px solid #eee;padding:0.5rem 0.7rem;">Name</th>
            <th style="border:1px solid #eee;padding:0.5rem 0.7rem;">Sort Order</th>
            <th style="border:1px solid #eee;padding:0.5rem 0.7rem;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${categories.length === 0 ? `<tr><td colspan='4' style='text-align:center;color:#888;padding:1rem;'>No categories found.</td></tr>` :
            categories.map(cat => `
              <tr>
                <td style="border:1px solid #eee;padding:0.5rem 0.7rem;">${cat.id}</td>
                <td style="border:1px solid #eee;padding:0.5rem 0.7rem;">${cat.name}</td>
                <td style="border:1px solid #eee;padding:0.5rem 0.7rem;">${cat.sort_order}</td>
                <td style="border:1px solid #eee;padding:0.5rem 0.7rem;">
                  <button class="edit-btn" data-id="${cat.id}" data-name="${cat.name}" data-sort="${cat.sort_order}">Edit</button>
                  <button class="delete-btn" data-id="${cat.id}">Delete</button>
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
      btn.onclick = () => showEditForm(btn.dataset.id, btn.dataset.name, btn.dataset.sort);
    });
    tableContainer.querySelectorAll('.delete-btn').forEach(btn => {
      btn.onclick = () => deleteCategory(btn.dataset.id);
    });
  }

  addBtn.onclick = () => showAddForm();

  function showAddForm() {
    formContainer.style.display = 'block';
    formContainer.innerHTML = `
      <input type="text" id="new-aisle-name" placeholder="Category Name" />
      <input type="number" id="new-aisle-sort" placeholder="Sort Order" />
      <button id="save-new-aisle">Save</button>
      <button id="cancel-add">Cancel</button>
    `;
    document.getElementById('save-new-aisle').onclick = () => {
      const name = document.getElementById('new-aisle-name').value.trim();
      const sort = parseInt(document.getElementById('new-aisle-sort').value, 10) || 0;
      if (!name) return alert('Category name required');
      fetch('/api/aisle_category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, sort_order: sort })
      }).then(res => res.json()).then(() => {
        formContainer.style.display = 'none';
        fetchCategories();
      });
    };
    document.getElementById('cancel-add').onclick = () => {
      formContainer.style.display = 'none';
    };
  }

  function showEditForm(id, name, sort) {
    formContainer.style.display = 'block';
    formContainer.innerHTML = `
      <input type="text" id="edit-aisle-name" value="${name}" />
      <input type="number" id="edit-aisle-sort" value="${sort}" />
      <button id="save-edit-aisle">Save</button>
      <button id="cancel-edit">Cancel</button>
    `;
    document.getElementById('save-edit-aisle').onclick = () => {
      const newName = document.getElementById('edit-aisle-name').value.trim();
      const newSort = parseInt(document.getElementById('edit-aisle-sort').value, 10) || 0;
      if (!newName) return alert('Category name required');
      fetch(`/api/aisle_category/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, sort_order: newSort })
      }).then(res => res.json()).then(() => {
        formContainer.style.display = 'none';
        fetchCategories();
      });
    };
    document.getElementById('cancel-edit').onclick = () => {
      formContainer.style.display = 'none';
    };
  }

  function deleteCategory(id) {
    if (!confirm('Delete this category?')) return;
    fetch(`/api/aisle_category/${id}`, { method: 'DELETE' })
      .then(res => res.json())
      .then(() => fetchCategories());
  }

  fetchCategories();
});

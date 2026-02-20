document.addEventListener('DOMContentLoaded', () => {
    loadSuggestions();
    document.getElementById('suggestionForm').onsubmit = async function(e) {
        e.preventDefault();
        const form = e.target;
        const data = {
            date: form.date.value,
            recipe_name: form.recipe_name.value,
            suggested_by: form.suggested_by.value,
            email: form.email.value,
            url: form.url.value,
            reason: form.reason.value
        };
        const res = await fetch('/api/suggestions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (res.ok) {
            form.reset();
            loadSuggestions();
        } else {
            alert('Failed to add suggestion.');
        }
    };
});

async function loadSuggestions() {
    const res = await fetch('/api/suggestions');
    const table = document.getElementById('suggestionsTable').querySelector('tbody');
    table.innerHTML = '';
    if (res.ok) {
        const suggestions = await res.json();
        for (const s of suggestions) {
            let urlCell = '';
            let actionsCell = '';
            if (s.url) {
                urlCell = `<a href="${s.url}" target="_blank">View</a>`;
                actionsCell = `<button class="import-url-btn" data-url="${encodeURIComponent(s.url)}" style="padding:2px 8px;font-size:0.95em;">Import to URL Upload</button>`;
            }
            table.innerHTML += `<tr>
                <td>${s.date || ''}</td>
                <td>${s.recipe_name || ''}</td>
                <td>${s.suggested_by || ''}<br><small>${s.email || ''}</small></td>
                <td>${urlCell}</td>
                <td>${s.reason || ''}</td>
                <td>${actionsCell}</td>
            </tr>`;
        }
        // Add event listeners for import buttons
        document.querySelectorAll('.import-url-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const url = decodeURIComponent(this.getAttribute('data-url'));
                window.open(`upload_url.html?url=${encodeURIComponent(url)}`, '_blank');
            });
        });
    } else {
        table.innerHTML = '<tr><td colspan="6">Failed to load suggestions.</td></tr>';
    }
}

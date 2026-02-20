document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('userSuggestForm');
    const msg = document.getElementById('suggestMsg');
    form.onsubmit = async function(e) {
        e.preventDefault();
        const data = {
            date: new Date().toISOString().slice(0,10),
            recipe_name: form.recipe_name.value,
            url: form.url.value,
            reason: form.reason.value,
            suggested_by: '',
            email: ''
        };
        const res = await fetch('/api/suggestions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (res.ok) {
            form.reset();
            msg.innerHTML = '<span style="color:green;font-weight:bold;">Thank you for your suggestion!</span>';
        } else {
            msg.innerHTML = '<span style="color:red;">Failed to send suggestion. Please try again later.</span>';
        }
    };
});

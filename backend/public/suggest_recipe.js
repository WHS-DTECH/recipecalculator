document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('userSuggestForm');
    const msg = document.getElementById('suggestMsg');
    if (!form || !msg) return;
    const nameInput = form.elements.suggested_by;
    const emailInput = form.elements.email;
    let authUser = null;

    function deriveNameFromEmail(email) {
        const local = String(email || '').split('@')[0] || '';
        return local
            .split(/[._-]+/)
            .filter(Boolean)
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ')
            .trim();
    }

    function isLikelyTrustedEmail(email) {
        const value = String(email || '').trim().toLowerCase();
        const match = value.match(/@([^@]+)$/);
        if (!match) return false;
        const domain = match[1];
        const allowList = [
            'westlandhigh.school.nz',
            'gmail.com',
            'googlemail.com',
            'outlook.com',
            'hotmail.com',
            'live.com',
            'msn.com'
        ];
        return allowList.includes(domain);
    }

    fetch('/api/auth/me', { credentials: 'include' })
        .then(res => res.json())
        .then(data => {
            if (data && data.authenticated && data.user) {
                authUser = data.user;
                if (nameInput) {
                    nameInput.value = (authUser.name || '').trim() || deriveNameFromEmail(authUser.email);
                    nameInput.readOnly = true;
                }
                if (emailInput) {
                    emailInput.value = authUser.email || '';
                    emailInput.readOnly = true;
                }
            }
        })
        .catch(() => {
            authUser = null;
        });

    form.onsubmit = async function(e) {
        e.preventDefault();

        const suggestedBy = String(nameInput && nameInput.value || '').trim();
        const email = String(emailInput && emailInput.value || '').trim();
        if (!suggestedBy) {
            msg.innerHTML = '<span style="color:red;">Please include your name.</span>';
            return;
        }
        if (!email || !isLikelyTrustedEmail(email)) {
            msg.innerHTML = '<span style="color:red;">Please use a valid school/work email (Google or Microsoft).</span>';
            return;
        }

        const data = {
            date: new Date().toISOString().slice(0,10),
            recipe_name: form.recipe_name.value,
            url: form.url.value,
            reason: form.reason.value,
            suggested_by: suggestedBy,
            email: email
        };
        const res = await fetch('/api/suggestions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(data)
        });
        if (res.ok) {
            if (authUser) {
                form.recipe_name.value = '';
                form.url.value = '';
                form.reason.value = '';
            } else {
                form.reset();
            }
            msg.innerHTML = '<span style="color:green;font-weight:bold;">Thank you for your suggestion!</span>';
        } else {
            const result = await res.json().catch(() => ({}));
            msg.innerHTML = `<span style="color:red;">${result.error || 'Failed to send suggestion. Please try again later.'}</span>`;
        }
    };
});

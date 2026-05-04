
function escHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Locale-aware date formatting using the browser's regional settings
const userLocale = (navigator.languages && navigator.languages[0]) || navigator.language || undefined;
const shortDateFormatter = new Intl.DateTimeFormat(userLocale, {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit'
});
const longDateFormatter = new Intl.DateTimeFormat(userLocale, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric'
});
const weekdayFormatter = new Intl.DateTimeFormat(userLocale, { weekday: 'long' });
const WEEK_DAYS_COUNT = 7;
const bookingPageLabel = (window && window.bookingPageLabel) ? String(window.bookingPageLabel) : 'Load Booking';
const bookClassSharedStateKey = 'bookClassEmbedSharedState';
const bookClassSharedChannelName = 'bookClassEmbedSharedChannel';
const scheduleViewModeStorageKey = 'scheduleViewMode';
const schedulePageParams = new URLSearchParams(window.location.search);
const schedulePresetBookingId = parseInt(String(schedulePageParams.get('booking_id') || ''), 10);
const scheduleCalendarSourceId = `schedule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const scheduleCalendarSharedChannel = ('BroadcastChannel' in window)
  ? new BroadcastChannel(bookClassSharedChannelName)
  : null;
const scheduleCalendarFilters = (window && window.scheduleCalendarFilters && typeof window.scheduleCalendarFilters === 'object')
  ? window.scheduleCalendarFilters
  : {};
let lastCalendarRefreshSignalAt = 0;
let schedulePresetApplied = false;
let scheduleViewMode = (() => {
  const saved = String(localStorage.getItem(scheduleViewModeStorageKey) || '').trim().toLowerCase();
  return saved === 'recipe' ? 'recipe' : 'class';
})();

function updatePrintButtonLabel() {
  const btn = document.getElementById('printScheduleBtn');
  if (!btn) return;
  btn.textContent = scheduleViewMode === 'recipe' ? 'Print by Recipe' : 'Print Schedule (A4)';
}

function getCellPrimaryText(booking) {
  if (scheduleViewMode === 'recipe') {
    const recipeLabel = String(booking.recipe || '').trim();
    return recipeLabel ? `Recipe: ${recipeLabel}` : `Class: ${booking.class_name || ''}`;
  }
  return `Class: ${booking.class_name || ''}`;
}

// Curated teacher palette — all colours clearly distinct from the school planner
// colours (orange = Senior, green = Junior, blue = Middle) and from each other.
// Colours are assigned sequentially per visible teacher each week, so no two
// teachers shown at the same time ever share a colour.
const TEACHER_COLOUR_PALETTE = [
  { bg: '#fee2e2', border: '#fca5a5', teacherText: '#991b1b' },  // Crimson
  { bg: '#fef3c7', border: '#fcd34d', teacherText: '#78350f' },  // Amber/Gold
  { bg: '#d9f99d', border: '#84cc16', teacherText: '#365314' },  // Lime
  { bg: '#a5f3fc', border: '#06b6d4', teacherText: '#0e7490' },  // Cyan
  { bg: '#ede9fe', border: '#8b5cf6', teacherText: '#4c1d95' },  // Violet
  { bg: '#fdf4ff', border: '#d946ef', teacherText: '#701a75' },  // Fuchsia
  { bg: '#ffe4e6', border: '#fb7185', teacherText: '#881337' },  // Rose
  { bg: '#f1f5f9', border: '#94a3b8', teacherText: '#1e293b' },  // Slate
];

let _teacherColourMap = new Map();

function buildTeacherColourMap(bookings) {
  _teacherColourMap = new Map();
  let idx = 0;
  for (const b of (Array.isArray(bookings) ? bookings : [])) {
    const name = String((b && b.staff_name) || '').trim();
    if (!name || _teacherColourMap.has(name)) continue;
    _teacherColourMap.set(name, TEACHER_COLOUR_PALETTE[idx % TEACHER_COLOUR_PALETTE.length]);
    idx++;
  }
}

function teacherColorFromName(name) {
  const input = String(name || '').trim();
  if (!input) {
    return { bg: '#f3f4f6', border: '#d1d5db', text: '#1f2937', teacherText: '#374151' };
  }
  const entry = _teacherColourMap.get(input);
  if (entry) {
    return { bg: entry.bg, border: entry.border, text: '#1f2937', teacherText: entry.teacherText };
  }
  // Fallback for teachers not in the current week (e.g. legend called before map built):
  // use a stable palette index derived from the name hash.
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
  const fallback = TEACHER_COLOUR_PALETTE[Math.abs(hash) % TEACHER_COLOUR_PALETTE.length];
  return { bg: fallback.bg, border: fallback.border, text: '#1f2937', teacherText: fallback.teacherText };
}

function getCalendarCellBaseStyle(booking) {
  if (scheduleViewMode === 'recipe') {
    const plannerStyle = plannerChipStyle(normalizePlannerStream(booking));
    return {
      bg: plannerStyle.bg,
      border: plannerStyle.border,
      text: plannerStyle.text,
      teacherText: plannerStyle.text
    };
  }
  if (scheduleViewMode !== 'class') {
    return { bg: '#e8f5e9', border: '#c8e6c9', text: '#1f2937', teacherText: '#2e7d32' };
  }
  return teacherColorFromName(booking && booking.staff_name ? booking.staff_name : '');
}

function publishBookingToBookClassForm(booking) {
  if (!booking) return;
  const plannerLike = isPlannerLikeBooking(booking);
  const sharedState = {
    sourceId: scheduleCalendarSourceId,
    updatedAt: Date.now(),
    staffId: String(booking.staff_id || ''),
    className: String(booking.class_name || ''),
    // Planner-like clicks only transfer recipe info — do not override the user's chosen date/period.
    bookingDate: plannerLike ? '' : String(booking.booking_date || ''),
    period: plannerLike ? '' : String(booking.period || ''),
    recipeId: booking.recipe_id != null ? String(booking.recipe_id) : '',
    recipeName: String(booking.recipe || ''),
    recipeSelectionInfo: String(booking.recipe_selection_info || ''),
    classSize: booking.class_size != null ? String(booking.class_size) : '',
    // Planner selections should prefill as a new booking, not edit the planner row.
    editBookingId: plannerLike ? '' : String(booking.id || '')
  };
  localStorage.setItem(bookClassSharedStateKey, JSON.stringify(sharedState));
  if (scheduleCalendarSharedChannel) {
    scheduleCalendarSharedChannel.postMessage(sharedState);
  }
}

function showInfoToast(message) {
  const text = String(message || '').trim();
  if (!text) return;
  if (window.QC && typeof window.QC.toast === 'function') {
    window.QC.toast(text, 'info');
    return;
  }
  alert(text);
}

async function fetchLinkedRecipesForBooking(bookingId) {
  const response = await fetch(`/api/recipe-matching/linked-recipes/${encodeURIComponent(String(bookingId))}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data && data.error ? data.error : 'Failed to load linked recipes.');
  }
  return Array.isArray(data.recipes) ? data.recipes : [];
}

function choosePlannerRecipeVersion(booking, linkedRecipes) {
  return new Promise((resolve) => {
    const list = Array.isArray(linkedRecipes) ? linkedRecipes : [];
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:10001;';
    const modal = document.createElement('div');
    modal.style.cssText = 'background:#fff;border-radius:10px;box-shadow:0 14px 36px rgba(0,0,0,0.25);padding:1rem 1.1rem;max-width:760px;width:min(92vw,760px);max-height:85vh;overflow:auto;';

    const plannerName = escHtml(String((booking && booking.recipe) || 'Planner Recipe'));
    const choicesHtml = list.map((recipe, idx) => {
      const recipeId = recipe && recipe.recipe_id != null ? recipe.recipe_id : recipe.id;
      const safeId = escHtml(String(recipeId || ''));
      const safeName = escHtml(String((recipe && recipe.name) || `Recipe ${safeId}`));
      const url = String((recipe && recipe.url) || '').trim();
      return `
        <label style="display:block;border:1px solid #e5e7eb;border-radius:8px;padding:0.65rem 0.7rem;margin:0 0 0.55rem 0;cursor:pointer;">
          <div style="display:flex;gap:0.55rem;align-items:flex-start;">
            <input type="radio" name="plannerRecipeChoice" value="${safeId}" ${idx === 0 ? 'checked' : ''} style="margin-top:0.2rem;" />
            <div>
              <div style="font-weight:700;color:#1f2937;">${safeName}</div>
              <div style="font-size:0.82rem;color:#6b7280;">ID: ${safeId}</div>
              ${url ? `<a href="${escHtml(url)}" target="_blank" rel="noopener" style="font-size:0.82rem;color:#1976d2;word-break:break-all;">${escHtml(url)}</a>` : '<div style="font-size:0.82rem;color:#9ca3af;">No source URL</div>'}
            </div>
          </div>
        </label>
      `;
    }).join('');

    modal.innerHTML = `
      <div style="font-size:1.12rem;font-weight:700;color:#1f2937;margin-bottom:0.35rem;">Choose Recipe Version</div>
      <div style="font-size:0.9rem;color:#4b5563;margin-bottom:0.8rem;">Planner item: <strong>${plannerName}</strong></div>
      <div style="font-size:0.82rem;color:#6b7280;margin-bottom:0.6rem;">Select the version to use when booking this class.</div>
      ${choicesHtml || '<div style="color:#9ca3af;font-size:0.9rem;">No linked recipes found for this planner item.</div>'}
      <div style="display:flex;justify-content:flex-end;gap:0.5rem;margin-top:0.8rem;border-top:1px solid #e5e7eb;padding-top:0.75rem;">
        <button type="button" id="plannerVersionCancelBtn" style="padding:0.42rem 0.82rem;border:1px solid #cbd5e1;background:#f8fafc;border-radius:6px;cursor:pointer;">Cancel</button>
        <button type="button" id="plannerVersionAdjustBtn" style="padding:0.42rem 0.82rem;border:1px solid #059669;background:#ecfdf5;color:#065f46;border-radius:6px;cursor:pointer;${list.length ? '' : 'display:none;'}">Adjust Recipe</button>
        <button type="button" id="plannerVersionUseBtn" style="padding:0.42rem 0.82rem;border:none;background:#1976d2;color:#fff;border-radius:6px;cursor:pointer;${list.length ? '' : 'display:none;'}">Use This Version</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const cleanup = () => {
      overlay.remove();
    };

    const cancelBtn = modal.querySelector('#plannerVersionCancelBtn');
    const useBtn = modal.querySelector('#plannerVersionUseBtn');
    const adjustBtn = modal.querySelector('#plannerVersionAdjustBtn');

    if (cancelBtn) {
      cancelBtn.onclick = () => {
        cleanup();
        resolve(null);
      };
    }

    if (adjustBtn) {
      adjustBtn.onclick = () => {
        const selected = modal.querySelector('input[name="plannerRecipeChoice"]:checked');
        if (!selected) { resolve(null); cleanup(); return; }
        const selectedId = String(selected.value || '').trim();
        const selectedRecipe = list.find((item) => String(item.recipe_id != null ? item.recipe_id : item.id) === selectedId) || null;
        cleanup();
        resolve({ action: 'adjust', recipe: selectedRecipe });
      };
    }

    if (useBtn) {
      useBtn.onclick = () => {
        const selected = modal.querySelector('input[name="plannerRecipeChoice"]:checked');
        if (!selected) {
          resolve(null);
          cleanup();
          return;
        }
        const selectedId = String(selected.value || '').trim();
        const selectedRecipe = list.find((item) => String(item.recipe_id != null ? item.recipe_id : item.id) === selectedId) || null;
        cleanup();
        resolve(selectedRecipe);
      };
    }

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        cleanup();
        resolve(null);
      }
    });
  });
}

// Parse a plain-text ingredients list into [{qty, unit, name}] rows
function parseIngredientLines(text) {
  if (!text) return [];
  return String(text).split('\n').map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return null;
    // Match: optional qty (number or fraction), optional unit word, rest as name
    const m = trimmed.match(/^([\d¼½¾⅓⅔⅛⅜⅝⅞\/\.\-\s]+(?:\/\d+)?)\s*([a-zA-Z]+(?:\.))?\s+(.+)$/) ||
              trimmed.match(/^([\d¼½¾⅓⅔⅛⅜⅝⅞\/\.]+)\s+(.+)$/);
    if (m && m.length >= 4) return { qty: m[1].trim(), unit: m[2] ? m[2].trim() : '', name: m[3].trim() };
    if (m && m.length === 3) return { qty: m[1].trim(), unit: '', name: m[2].trim() };
    return { qty: '', unit: '', name: trimmed };
  }).filter(Boolean);
}

function decodeHtmlEntities(text) {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = String(text || '');
  return textarea.value;
}

function htmlListToIngredientText(html) {
  const value = String(html || '').trim();
  if (!value) return '';

  const liMatches = Array.from(value.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi));
  if (liMatches.length) {
    return liMatches
      .map((m) => decodeHtmlEntities(String(m[1] || '').replace(/<br\s*\/?\s*>/gi, ' ').replace(/<[^>]+>/g, ' ')).trim())
      .filter(Boolean)
      .join('\n');
  }

  return decodeHtmlEntities(
    value
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

function getAdjustableIngredientsText(recipe) {
  const directIngredients = String((recipe && recipe.ingredients) || '').trim();
  if (directIngredients) return directIngredients;

  const displayIngredients = htmlListToIngredientText(recipe && recipe.ingredients_display);
  if (displayIngredients) return displayIngredients;

  const extractedRaw = String((recipe && recipe.extracted_ingredients) || '').trim();
  if (!extractedRaw) return '';

  if (extractedRaw.startsWith('[') && extractedRaw.endsWith(']')) {
    try {
      const parsed = JSON.parse(extractedRaw);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => {
            if (typeof item === 'string') return item.trim();
            if (item && typeof item.text === 'string') return item.text.trim();
            return String(item || '').trim();
          })
          .filter(Boolean)
          .join('\n');
      }
    } catch (_) {
      // fall back to plain text handling below
    }
  }

  return extractedRaw;
}

// Show the Adjust Recipe modal — lets user rename + edit ingredients before saving as new recipe
async function showAdjustRecipeModal(baseRecipeRef, plannerBooking) {
  return new Promise(async (resolve) => {
    // Fetch full recipe details from server
    const baseId = baseRecipeRef && (baseRecipeRef.recipe_id != null ? baseRecipeRef.recipe_id : baseRecipeRef.id);
    let fullRecipe = baseRecipeRef;
    try {
      const r = await fetch(`/api/recipes/${encodeURIComponent(String(baseId))}`);
      if (r.ok) fullRecipe = await r.json();
    } catch (_) { /* use what we have */ }

    // Get current user name for default recipe name
    let userName = '';
    try {
      const me = await fetch('/api/auth/me');
      if (me.ok) {
        const meData = await me.json();
        if (meData.user && meData.user.name) userName = meData.user.name.split(' ').slice(-1)[0]; // last name
      }
    } catch (_) { /* ignore */ }

    const baseName = String((fullRecipe && fullRecipe.name) || (plannerBooking && plannerBooking.recipe) || 'Recipe').trim();
    const defaultName = userName ? `${baseName} - ${userName}` : baseName;
    const ingredientLines = parseIngredientLines(getAdjustableIngredientsText(fullRecipe));
    const servingSize = (fullRecipe && fullRecipe.serving_size) || '';

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.52);display:flex;align-items:center;justify-content:center;z-index:10002;';
    const modal = document.createElement('div');
    modal.style.cssText = 'background:#fff;border-radius:10px;box-shadow:0 14px 36px rgba(0,0,0,0.28);padding:1.1rem 1.2rem;max-width:680px;width:min(95vw,680px);max-height:90vh;overflow:auto;';

    const ingredientRowsHtml = ingredientLines.length
      ? ingredientLines.map((ing, i) => `
        <tr data-row="${i}">
          <td style="padding:0.2rem 0.3rem;"><input type="text" class="adj-qty" value="${escHtml(ing.qty)}" style="width:60px;padding:0.2rem 0.35rem;border:1px solid #d1d5db;border-radius:4px;font-size:0.88rem;" placeholder="qty" /></td>
          <td style="padding:0.2rem 0.3rem;"><input type="text" class="adj-unit" value="${escHtml(ing.unit)}" style="width:70px;padding:0.2rem 0.35rem;border:1px solid #d1d5db;border-radius:4px;font-size:0.88rem;" placeholder="unit" /></td>
          <td style="padding:0.2rem 0.3rem;"><input type="text" class="adj-name" value="${escHtml(ing.name)}" style="width:100%;min-width:200px;padding:0.2rem 0.35rem;border:1px solid #d1d5db;border-radius:4px;font-size:0.88rem;" placeholder="ingredient" /></td>
          <td style="padding:0.2rem 0.3rem;"><button type="button" class="adj-remove-row" style="color:#dc2626;background:none;border:none;cursor:pointer;font-size:1rem;line-height:1;" title="Remove">✕</button></td>
        </tr>`).join('')
      : `<tr data-row="0"><td style="padding:0.2rem 0.3rem;"><input type="text" class="adj-qty" style="width:60px;padding:0.2rem 0.35rem;border:1px solid #d1d5db;border-radius:4px;font-size:0.88rem;" placeholder="qty" /></td><td style="padding:0.2rem 0.3rem;"><input type="text" class="adj-unit" style="width:70px;padding:0.2rem 0.35rem;border:1px solid #d1d5db;border-radius:4px;font-size:0.88rem;" placeholder="unit" /></td><td style="padding:0.2rem 0.3rem;"><input type="text" class="adj-name" style="width:100%;min-width:200px;padding:0.2rem 0.35rem;border:1px solid #d1d5db;border-radius:4px;font-size:0.88rem;" placeholder="ingredient" /></td><td><button type="button" class="adj-remove-row" style="color:#dc2626;background:none;border:none;cursor:pointer;font-size:1rem;" title="Remove">✕</button></td></tr>`;

    modal.innerHTML = `
      <div style="font-size:1.12rem;font-weight:700;color:#1f2937;margin-bottom:0.2rem;">Adjust Recipe</div>
      <div style="font-size:0.85rem;color:#6b7280;margin-bottom:0.8rem;">Based on: <strong>${escHtml(baseName)}</strong> (ID ${escHtml(String(baseId || ''))}). Changes are saved as your own copy.</div>
      <div style="margin-bottom:0.6rem;">
        <label style="font-size:0.82rem;font-weight:600;color:#374151;display:block;margin-bottom:0.2rem;">Recipe Name</label>
        <input id="adjRecipeName" type="text" value="${escHtml(defaultName)}" style="width:100%;padding:0.38rem 0.5rem;border:1px solid #d1d5db;border-radius:6px;font-size:0.95rem;box-sizing:border-box;" />
      </div>
      <div style="margin-bottom:0.6rem;">
        <label style="font-size:0.82rem;font-weight:600;color:#374151;display:block;margin-bottom:0.2rem;">Serves (class size)</label>
        <input id="adjServingSize" type="number" value="${escHtml(String(servingSize))}" min="1" style="width:90px;padding:0.38rem 0.5rem;border:1px solid #d1d5db;border-radius:6px;font-size:0.95rem;" />
      </div>
      <div style="margin-bottom:0.4rem;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.35rem;">
          <label style="font-size:0.82rem;font-weight:600;color:#374151;">Ingredients</label>
          <button type="button" id="adjAddRow" style="font-size:0.8rem;padding:0.2rem 0.55rem;border:1px solid #059669;background:#ecfdf5;color:#065f46;border-radius:5px;cursor:pointer;">+ Add Ingredient</button>
        </div>
        <div style="overflow-x:auto;">
          <table id="adjIngredientsTable" style="width:100%;border-collapse:collapse;">
            <thead><tr style="font-size:0.78rem;color:#6b7280;text-align:left;">
              <th style="padding:0.2rem 0.3rem;font-weight:600;">Qty</th>
              <th style="padding:0.2rem 0.3rem;font-weight:600;">Unit</th>
              <th style="padding:0.2rem 0.3rem;font-weight:600;">Ingredient</th>
              <th></th>
            </tr></thead>
            <tbody id="adjIngredientRows">${ingredientRowsHtml}</tbody>
          </table>
        </div>
      </div>
      <div id="adjError" style="color:#dc2626;font-size:0.82rem;margin-top:0.4rem;display:none;"></div>
      <div style="display:flex;justify-content:flex-end;gap:0.5rem;margin-top:0.9rem;border-top:1px solid #e5e7eb;padding-top:0.75rem;">
        <button type="button" id="adjCancelBtn" style="padding:0.42rem 0.82rem;border:1px solid #cbd5e1;background:#f8fafc;border-radius:6px;cursor:pointer;">Cancel</button>
        <button type="button" id="adjSaveBtn" style="padding:0.42rem 0.9rem;border:none;background:#059669;color:#fff;border-radius:6px;cursor:pointer;font-weight:600;">Save My Version</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const cleanup = () => { overlay.remove(); };

    // Remove row buttons
    modal.querySelector('#adjIngredientRows').addEventListener('click', (e) => {
      if (e.target && e.target.classList.contains('adj-remove-row')) {
        const row = e.target.closest('tr');
        if (row) row.remove();
      }
    });

    // Add row button
    modal.querySelector('#adjAddRow').addEventListener('click', () => {
      const tbody = modal.querySelector('#adjIngredientRows');
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding:0.2rem 0.3rem;"><input type="text" class="adj-qty" style="width:60px;padding:0.2rem 0.35rem;border:1px solid #d1d5db;border-radius:4px;font-size:0.88rem;" placeholder="qty" /></td>
        <td style="padding:0.2rem 0.3rem;"><input type="text" class="adj-unit" style="width:70px;padding:0.2rem 0.35rem;border:1px solid #d1d5db;border-radius:4px;font-size:0.88rem;" placeholder="unit" /></td>
        <td style="padding:0.2rem 0.3rem;"><input type="text" class="adj-name" style="width:100%;min-width:200px;padding:0.2rem 0.35rem;border:1px solid #d1d5db;border-radius:4px;font-size:0.88rem;" placeholder="ingredient" /></td>
        <td style="padding:0.2rem 0.3rem;"><button type="button" class="adj-remove-row" style="color:#dc2626;background:none;border:none;cursor:pointer;font-size:1rem;line-height:1;" title="Remove">✕</button></td>
      `;
      tbody.appendChild(tr);
      tr.querySelector('.adj-name').focus();
    });

    modal.querySelector('#adjCancelBtn').addEventListener('click', () => { cleanup(); resolve(null); });

    modal.querySelector('#adjSaveBtn').addEventListener('click', async () => {
      const name = modal.querySelector('#adjRecipeName').value.trim();
      if (!name) {
        const err = modal.querySelector('#adjError');
        err.textContent = 'Recipe name is required.';
        err.style.display = '';
        return;
      }
      // Collect ingredient rows → plain text
      const rows = Array.from(modal.querySelectorAll('#adjIngredientRows tr'));
      const ingredientsText = rows.map((row) => {
        const qty = (row.querySelector('.adj-qty') || {}).value || '';
        const unit = (row.querySelector('.adj-unit') || {}).value || '';
        const ingName = (row.querySelector('.adj-name') || {}).value || '';
        return [qty, unit, ingName].filter(Boolean).join(' ').trim();
      }).filter(Boolean).join('\n');

      const servingSize = modal.querySelector('#adjServingSize').value;
      const saveBtn = modal.querySelector('#adjSaveBtn');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';

      try {
        const res = await fetch(`/api/recipes/${encodeURIComponent(String(baseId))}/adjust`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, ingredients: ingredientsText, serving_size: servingSize || null })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Failed to save adjusted recipe.');
        cleanup();
        resolve({ recipeId: data.recipeId, name });
      } catch (err) {
        const errEl = modal.querySelector('#adjError');
        errEl.textContent = err.message || 'Could not save recipe.';
        errEl.style.display = '';
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save My Version';
      }
    });

    overlay.addEventListener('click', (e) => { if (e.target === overlay) { cleanup(); resolve(null); } });
  });
}

async function handlePlannerChipClick(bookingId) {
  const normalizedId = Number(bookingId);
  if (!Number.isInteger(normalizedId) || normalizedId <= 0) return;
  const bookings = Array.isArray(window.currentScheduleBookings) ? window.currentScheduleBookings : [];
  const plannerBooking = bookings.find((b) => Number(b.id) === normalizedId);
  if (!plannerBooking) {
    showInfoToast('Could not find that planner event in this week.');
    return;
  }

  try {
    const linkedRecipes = await fetchLinkedRecipesForBooking(normalizedId);
    if (!linkedRecipes.length) {
      showInfoToast('This planner event has no linked recipe versions yet. Link versions in Match Planner Recipes first.');
      return;
    }

    const result = await choosePlannerRecipeVersion(plannerBooking, linkedRecipes);
    if (!result) return;

    // Handle "Adjust Recipe" action
    if (result && result.action === 'adjust') {
      const adjustedRecipe = await showAdjustRecipeModal(result.recipe, plannerBooking);
      if (!adjustedRecipe) return;
      const baseId = result.recipe && (result.recipe.recipe_id != null ? result.recipe.recipe_id : result.recipe.id);
      const bookingForForm = {
        ...plannerBooking,
        recipe_id: adjustedRecipe.recipeId,
        recipe: adjustedRecipe.name,
        recipe_selection_info: `Adjusted from version ID ${baseId || '-'} (${result.recipe && result.recipe.name ? result.recipe.name : 'base recipe'})`
      };
      publishBookingToBookClassForm(bookingForForm);
      showInfoToast(`Adjusted recipe saved: ${adjustedRecipe.name}`);
      return;
    }

    const selectedRecipe = result;
    const selectedRecipeId = selectedRecipe.recipe_id != null ? selectedRecipe.recipe_id : selectedRecipe.id;
    const selectedRecipeName = String(selectedRecipe.name || plannerBooking.recipe || '').trim();
    const bookingForForm = {
      ...plannerBooking,
      recipe_id: selectedRecipeId,
      recipe: selectedRecipeName,
      recipe_selection_info: `Using linked version ID ${selectedRecipeId || '-'} (${selectedRecipeName})`
    };
    publishBookingToBookClassForm(bookingForForm);
    showInfoToast(`Selected recipe version: ${selectedRecipeName}`);
  } catch (err) {
    showInfoToast(err && err.message ? err.message : 'Unable to load linked recipes for this planner event.');
  }
}

function toLocalIsoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function normalizePlannerStream(booking) {
  const explicit = String(booking && booking.planner_stream ? booking.planner_stream : '').trim().toLowerCase();
  if (explicit === 'junior') return 'Junior';
  if (explicit === 'senior') return 'Senior';
  if (explicit === 'middle') return 'Middle';

  const className = String(booking && booking.class_name ? booking.class_name : '').toLowerCase();
  if (/(^|\b)jfood(\b|$)|junior/.test(className)) return 'Junior';
  if (/(^|\b)hosp(\b|$)|senior|hp100/.test(className)) return 'Senior';
  return 'Middle';
}

function plannerChipStyle(stream) {
  if (stream === 'Junior') return { bg: '#dcfce7', border: '#86efac', text: '#166534' };
  if (stream === 'Senior') return { bg: '#ffedd5', border: '#fdba74', text: '#9a3412' };
  return { bg: '#dbeafe', border: '#93c5fd', text: '#1e40af' };
}

function isPlannerLikeBooking(booking) {
  const period = String(booking && booking.period ? booking.period : '').trim().toLowerCase();
  if (period === 'planner') return true;

  const hasTeacher = Boolean(String(booking && booking.staff_id ? booking.staff_id : '').trim() ||
    String(booking && booking.staff_name ? booking.staff_name : '').trim());
  if (hasTeacher) return false;

  const className = String(booking && booking.class_name ? booking.class_name : '').trim().toUpperCase();
  return className === 'MFOOD' || className === 'JFOOD' || className === 'HOSP';
}

  // Snap a Saturday (+2) or Sunday (+1) date string to the following Monday
  function snapToNearestMonday(isoDate) {
    const d = new Date(isoDate + 'T00:00:00');
    const dow = d.getDay();
    if (dow === 0) d.setDate(d.getDate() + 1);
    else if (dow === 6) d.setDate(d.getDate() + 2);
    return toLocalIsoDate(d);
  }

function parseLocalIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function getRegionalWeekStartDay() {
  try {
    const locale = new Intl.Locale(userLocale || 'en');
    const firstDay = locale.weekInfo && locale.weekInfo.firstDay;
    if (typeof firstDay === 'number') {
      return firstDay % 7;
    }
  } catch {
    // Ignore and fall back below.
  }
  return 1; // Monday fallback for older browsers.
}

function getStartOfWeek(referenceDate) {
  const date = new Date(referenceDate);
  date.setHours(0, 0, 0, 0);
  const firstDay = getRegionalWeekStartDay();
  const diff = (date.getDay() - firstDay + 7) % 7;
  date.setDate(date.getDate() - diff);
  return date;
}

// Days and periods for the calendar grid
const periods = [1, 2, 3, 4, 5];
let showWeekends = false;

function getVisibleDayIndices(weekDates, includeWeekends = showWeekends) {
  const indices = [];
  for (let i = 0; i < weekDates.length; ++i) {
    if (includeWeekends || !weekDates[i].isWeekend) {
      indices.push(i);
    }
  }
  return indices;
}

function ensureWeekendToggleButton() {
  let toggleBtn = document.getElementById('toggleWeekendBtn');
  if (!toggleBtn) {
    const anchorBtn = document.getElementById('printScheduleBtn') || document.getElementById('nextWeekBtn');
    const parent = anchorBtn && anchorBtn.parentElement;
    if (!parent) return null;

    toggleBtn = document.createElement('button');
    toggleBtn.id = 'toggleWeekendBtn';
    toggleBtn.style.margin = '0 0.3em';
    toggleBtn.style.background = '#455a64';
    toggleBtn.style.color = '#fff';
    toggleBtn.style.border = 'none';
    toggleBtn.style.borderRadius = '5px';
    toggleBtn.style.padding = '0.45rem 1rem';
    toggleBtn.onclick = () => {
      showWeekends = !showWeekends;
      renderScheduleCalendar();
    };

    if (anchorBtn && anchorBtn.nextSibling) {
      parent.insertBefore(toggleBtn, anchorBtn.nextSibling);
    } else {
      parent.appendChild(toggleBtn);
    }
  }

  toggleBtn.textContent = showWeekends ? 'Hide Weekend' : 'Show Weekend';
  return toggleBtn;
}

function getWeekDatesFromMonday(monday) {
  const weekDates = [];
  for (let i = 0; i < WEEK_DAYS_COUNT; ++i) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    weekDates.push({
      display: formatDateShort(d),
      iso: getISODate(d),
      weekday: weekdayFormatter.format(d),
      isWeekend: d.getDay() === 0 || d.getDay() === 6
    });
  }
  return weekDates;
}

function mondayToWeekInputValue(monday) {
  const refMonday = new Date(monday);
  refMonday.setHours(0, 0, 0, 0);
  const thursday = new Date(refMonday);
  thursday.setDate(refMonday.getDate() + 3);
  const year = thursday.getFullYear();
  const jan4 = new Date(year, 0, 4);
  const jan4Day = jan4.getDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setDate(jan4.getDate() - jan4Day + 1);
  const diffDays = Math.round((refMonday - week1Monday) / 86400000);
  const weekNo = Math.floor(diffDays / 7) + 1;
  return `${year}-W${String(weekNo).padStart(2, '0')}`;
}

function weekInputValueToMonday(weekValue) {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekValue || '');
  if (!match) return null;
  const year = Number(match[1]);
  const weekNo = Number(match[2]);
  if (weekNo < 1 || weekNo > 53) return null;
  const jan4 = new Date(year, 0, 4);
  const jan4Day = jan4.getDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setDate(jan4.getDate() - jan4Day + 1);
  const monday = new Date(week1Monday);
  monday.setDate(week1Monday.getDate() + ((weekNo - 1) * 7));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function askWeekToPrint(defaultMonday) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;z-index:9999;';
    const box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,0.2);padding:1rem 1.1rem;min-width:320px;max-width:90vw;';
    const defaultWeek = mondayToWeekInputValue(defaultMonday);
    box.innerHTML = `
      <div style="font-weight:700;font-size:1.05rem;margin-bottom:0.65rem;">Print ${bookingPageLabel} Schedule</div>
      <label for="weekToPrintInput" style="display:block;margin-bottom:0.35rem;">Which week do you want to print?</label>
      <input id="weekToPrintInput" type="week" value="${defaultWeek}" style="width:100%;padding:0.4rem;margin-bottom:0.8rem;" />
      <div style="display:flex;justify-content:flex-end;gap:0.5rem;">
        <button id="weekPrintCancelBtn" style="padding:0.42rem 0.8rem;border:1px solid #bbb;background:#f2f2f2;border-radius:5px;">Cancel</button>
        <button id="weekPrintConfirmBtn" style="padding:0.42rem 0.8rem;border:0;background:#1976d2;color:#fff;border-radius:5px;">Print</button>
      </div>
    `;
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const cleanup = () => {
      overlay.remove();
    };

    box.querySelector('#weekPrintCancelBtn').onclick = () => {
      cleanup();
      resolve(null);
    };

    box.querySelector('#weekPrintConfirmBtn').onclick = () => {
      const weekValue = box.querySelector('#weekToPrintInput').value;
      const monday = weekInputValueToMonday(weekValue);
      cleanup();
      resolve(monday);
    };

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        cleanup();
        resolve(null);
      }
    });
  });
}

function buildPrintGrid(bookings, weekDates) {
  const grid = Array.from({ length: periods.length }, () => Array(weekDates.length).fill(null));
  bookings.forEach(b => {
    if (isPlannerLikeBooking(b)) return;
    const dayIdx = weekDates.findIndex(wd => wd.iso === b.booking_date);
    const periodIdx = periods.indexOf(Number(b.period));
    if (dayIdx !== -1 && periodIdx !== -1) {
      grid[periodIdx][dayIdx] = b;
    }
  });
  return grid;
}

function getPrintBookingTitle(cell, displayMode) {
  if (displayMode === 'recipe') {
    const recipe = String(cell.recipe || '').trim();
    return recipe ? `Recipe: ${recipe}` : `Class: ${cell.class_name || ''}`;
  }
  return `Class: ${cell.class_name || ''}`;
}

async function printScheduleForWeek(printMonday, includeWeekends = showWeekends, displayMode = 'class') {
  if (!printMonday) return;

  const weekDates = getWeekDatesFromMonday(printMonday);
  const bookings = await fetchBookingsForWeek(printMonday);
  const grid = buildPrintGrid(bookings, weekDates);
  const visibleDayIndices = getVisibleDayIndices(weekDates, includeWeekends);
  const visibleWeekDates = visibleDayIndices.map((idx) => weekDates[idx]);
  const weekStart = new Date(printMonday);
  const weekEnd = new Date(printMonday);
  weekEnd.setDate(weekStart.getDate() + 6);
  const printDate = new Date().toLocaleDateString();
  const logoUrl = new URL('images/whs logo circular reo .png', window.location.href).href;

  let tableHtml = '<table class="print-calendar-table"><thead>';
  tableHtml += '<tr><th class="period-col"></th>';
  tableHtml += visibleWeekDates.map(d => `<th>${d.weekday}</th>`).join('');
  tableHtml += '</tr>';
  tableHtml += '<tr><th class="period-col"></th>';
  tableHtml += visibleWeekDates.map(d => `<th class="date-head">${d.display}</th>`).join('');
  tableHtml += '</tr></thead><tbody>';

  for (let p = 0; p < periods.length; ++p) {
    tableHtml += `<tr><td class="period-col">P${periods[p]}</td>`;
    for (let d = 0; d < visibleDayIndices.length; ++d) {
      const dayIdx = visibleDayIndices[d];
      const cell = grid[p][dayIdx];
      if (cell) {
        tableHtml += `<td><div class="booking-box"><div class="booking-title">${getPrintBookingTitle(cell, displayMode)}</div><div class="booking-teacher">Teacher: ${cell.staff_name || ''}</div></div></td>`;
      } else {
        tableHtml += '<td></td>';
      }
    }
    tableHtml += '</tr>';
  }

  tableHtml += '</tbody></table>';

  const win = window.open('', '', 'width=1300,height=850');
  if (!win) {
    alert('Please allow pop-ups to print the schedule.');
    return;
  }

  win.document.write(`
    <html lang="${userLocale}">
      <head>
        <title>${bookingPageLabel} ${formatDateLong(weekStart)} to ${formatDateLong(weekEnd)}</title>
        <style>
          @page { size: A4 landscape; margin: 10mm; }
          * { box-sizing: border-box; }
          body { font-family: "Segoe UI", Arial, sans-serif; color: #1d1d1d; margin: 0; }
          .print-page { width: 100%; }
          .print-header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #1976d2; padding-bottom: 8px; margin-bottom: 10px; }
          .print-brand { display: flex; align-items: center; gap: 10px; }
          .print-brand img { width: 56px; height: 56px; object-fit: contain; }
          .print-title { font-size: 22px; font-weight: 700; color: #1976d2; margin: 0; }
          .print-subtitle { margin: 2px 0 0 0; font-size: 13px; }
          .print-meta { font-size: 12px; text-align: right; }
          .print-calendar-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
          .print-calendar-table th, .print-calendar-table td { border: 1px solid #8f8f8f; padding: 4px; text-align: center; vertical-align: top; font-size: 11px; height: 64px; }
          .print-calendar-table th { background: #1976d2; color: #fff; font-weight: 700; }
          .print-calendar-table th.date-head { background: #eaf1ff; color: #222; font-weight: 600; }
          .period-col { width: 46px; background: #f1f1f1 !important; color: #222 !important; font-weight: 700; }
          .booking-box { background: #e8f5e9; border-radius: 6px; padding: 4px; min-height: 52px; }
          .booking-title { font-weight: 700; margin-bottom: 2px; }
          .booking-teacher { color: #2e7d32; font-weight: 600; }
        </style>
      </head>
      <body>
        <div class="print-page">
          <div class="print-header">
            <div class="print-brand">
              <img src="${logoUrl}" alt="School Logo" />
              <div>
                <h1 class="print-title">${bookingPageLabel}</h1>
                <p class="print-subtitle">Week of ${formatDateLong(weekStart)} to ${formatDateLong(weekEnd)}</p>
              </div>
            </div>
            <div class="print-meta">
              <div><strong>Printed:</strong> ${printDate}</div>
              <div><strong>Total Bookings:</strong> ${bookings.length}</div>
            </div>
          </div>
          ${tableHtml}
        </div>
      </body>
    </html>
  `);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
  }, 300);
}

// Helper to get ISO date string (yyyy-mm-dd) for a given date
function getISODate(date) {
  return toLocalIsoDate(date);
}

function readCurrentSharedStaffId() {
  try {
    const raw = localStorage.getItem(bookClassSharedStateKey);
    if (!raw) return '';
    const parsed = JSON.parse(raw);
    return String(parsed && parsed.staffId || '').trim();
  } catch {
    return '';
  }
}

// Fetch bookings for the current week
async function fetchBookingsForWeek(monday) {
  // Align filtering to the user's regional week start.
  const weekStartDate = getStartOfWeek(monday);
  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setDate(weekStartDate.getDate() + WEEK_DAYS_COUNT - 1);
  const start = toLocalIsoDate(weekStartDate);
  const end = toLocalIsoDate(weekEndDate);
  const params = new URLSearchParams({ start, end });

  const plannerStream = String(scheduleCalendarFilters.plannerStream || '').trim();
  if (plannerStream) {
    params.set('planner_stream', plannerStream);
  }

  if (scheduleCalendarFilters.selectedStaffOnly === true) {
    const selectedStaffId = readCurrentSharedStaffId();
    if (!selectedStaffId) {
      return [];
    }
    params.set('staff_id', selectedStaffId);
  }

  const res = await fetch(`/api/bookings/all?${params.toString()}`);
  const data = await res.json();
  return Array.isArray(data.bookings) ? data.bookings : [];
}

function formatDateShort(date) {
  return shortDateFormatter.format(date);
}

function formatDateLong(date) {
  return longDateFormatter.format(date);
}

// Track the current week start (Monday)
let currentMonday = (() => {
  return getStartOfWeek(new Date());
})();


async function renderScheduleCalendar() {
  const table = document.getElementById('scheduleCalendarTable');
  const weekDates = getWeekDatesFromMonday(currentMonday);
  const visibleDayIndices = getVisibleDayIndices(weekDates, showWeekends);
  const visibleWeekDates = visibleDayIndices.map((idx) => weekDates[idx]);

  // Fetch bookings for this week
  const bookings = await fetchBookingsForWeek(currentMonday);
  window.currentScheduleBookings = bookings;
  buildTeacherColourMap(bookings);

  const grid = buildPrintGrid(bookings, weekDates);

  // Header rows
    let html = `<thead><tr style='background:#1976d2;color:#fff;'>
      <th style='width:48px;background:#1976d2;'></th>` + visibleWeekDates.map((d) => `<th style='padding:0.35rem 0.1rem;font-size:0.98em;background:#1976d2;color:#fff;'>${d.weekday}</th>`).join('') + '</tr>';
    html += `<tr style='background:#e3eafc;color:#222;'>
      <th style='width:48px;'></th>` + visibleWeekDates.map(date => `<th style='padding:0.15rem 0.1rem;font-size:0.92em;'>${date.display}</th>`).join('') + '</tr></thead>';

  // Planner row — year planner entries, each shown individually with a delete button
  html += `<tr><td style='background:#e8eaf6;font-weight:bold;text-align:center;font-size:0.85em;color:#283593;padding:0.3rem 0.1rem;'>Planner</td>`;
  for (let d = 0; d < visibleDayIndices.length; ++d) {
    const dayIdx = visibleDayIndices[d];
    const dayIso = weekDates[dayIdx].iso;
    const plannerEntries = bookings.filter(b =>
      isPlannerLikeBooking(b) &&
        snapToNearestMonday(b.booking_date) === dayIso &&
        String(b.recipe || '').trim()
    );
    if (plannerEntries.length) {
      html += `<td style='vertical-align:top;text-align:center;padding:0.2rem 0.1rem;'>` +
        plannerEntries.map(entry => {
          const style = plannerChipStyle(normalizePlannerStream(entry));
          const safeRecipe = escHtml(entry.recipe);
          return `<div class='planner-chip' data-booking-id='${entry.id}' title='Click to choose a linked recipe version' style='background:${style.bg};border:1px solid ${style.border};border-radius:5px;padding:0.12rem 0.2rem;font-size:0.82em;color:${style.text};font-weight:600;margin-bottom:2px;display:flex;align-items:center;gap:3px;justify-content:space-between;cursor:pointer;'><span style='flex:1;overflow:hidden;text-overflow:ellipsis;white-space:normal;'>${safeRecipe}</span><button class='planner-delete-btn' data-booking-id='${entry.id}' data-recipe='${safeRecipe}' title='Delete this entry' style='background:none;border:none;cursor:pointer;color:${style.text};font-size:1em;opacity:0.7;padding:0 2px;line-height:1;flex-shrink:0;' aria-label='Delete ${safeRecipe}'>&#x2715;</button></div>`;
        }).join('') +
        `</td>`;
    } else {
      html += '<td></td>';
    }
  }
  html += '</tr>';

  // Periods and cells (make bookings clickable)
  for (let p = 0; p < periods.length; ++p) {
    html += `<tr><td style='background:#f5f5f5;font-weight:bold;text-align:center;'>P${periods[p]}</td>`;
      for (let d = 0; d < visibleDayIndices.length; ++d) {
      const dayIdx = visibleDayIndices[d];
      const cell = grid[p][dayIdx];
        if (cell) {
          const cellStyle = getCalendarCellBaseStyle(cell);
          // Add a unique id for each booking cell
          const bookingId = `booking-${cell.id}`;
          const cellLabel = `${escHtml(getCellPrimaryText(cell))}, Teacher: ${escHtml(cell.staff_name)}`;
          const slotHref = `teacher_booking_slots.html?booking_id=${encodeURIComponent(String(cell.id || ''))}&source=${encodeURIComponent(window.location.pathname.split('/').pop() || 'add_booking.html')}`;
          // Add a class for selected state
          html += `<td style='vertical-align:top;text-align:center;padding:0.25rem 0.1rem;'>
            <div class="calendar-booking-cell" id="${bookingId}" data-booking-id="${cell.id}" tabindex="0" role="button" aria-label="${cellLabel}" style='background:${cellStyle.bg};border:1px solid ${cellStyle.border};border-radius:7px;padding:0.32rem 0.18rem;box-shadow:0 1px 2px #0001;cursor:pointer;transition:box-shadow 0.2s;'>
              <div style='font-weight:bold;font-size:0.98em;color:${cellStyle.text};'>${escHtml(getCellPrimaryText(cell))}</div>
              <div style='font-weight:bold;color:${cellStyle.teacherText};font-size:0.95em;'>Teacher: ${escHtml(cell.staff_name)}</div>
              <div style='margin-top:0.24rem;'><a href='${slotHref}' onclick='event.stopPropagation();' style='display:inline-block;padding:0.12rem 0.42rem;border-radius:999px;border:1px solid #1d4ed8;background:#eff6ff;color:#1e3a8a;font-size:0.75rem;text-decoration:none;font-weight:700;'>Slots</a></div>
            </div>
          </td>`;
      } else {
        html += '<td></td>';
      }
    }
    html += '</tr>';
  }

  table.setAttribute('aria-label', `Schedule calendar, week of ${formatDateLong(new Date(currentMonday))}`);
  table.innerHTML = html;

  // Legend: inject above the table
  let legendEl = document.getElementById('planner-stream-legend');
  if (!legendEl) {
    legendEl = document.createElement('div');
    legendEl.id = 'planner-stream-legend';
    table.parentNode.insertBefore(legendEl, table);
  }
  const teacherLegend = (() => {
    if (scheduleViewMode !== 'class') return '';
    const names = [...new Set(bookings.map((b) => String(b.staff_name || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
    if (!names.length) return '';
    const chips = names.slice(0, 14).map((name) => {
      const style = teacherColorFromName(name);
      return `<span style="background:${style.bg};border:1px solid ${style.border};color:${style.teacherText};border-radius:4px;padding:1px 7px;font-weight:600;">&#9632; ${escHtml(name)}</span>`;
    }).join('');
    const overflow = names.length > 14
      ? `<span style="font-size:0.75rem;color:#6b7280;">+${names.length - 14} more</span>`
      : '';
    return `<div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;font-size:0.8rem;margin-bottom:0.45rem;">
      <span style="font-weight:600;color:#374151;">Teachers:</span>
      ${chips}
      ${overflow}
    </div>`;
  })();

  legendEl.innerHTML = `<div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;font-size:0.8rem;margin-bottom:0.45rem;">
    <span style="font-weight:600;color:#374151;">Planner:</span>
    <span style="background:#dbeafe;border:1px solid #93c5fd;color:#1e40af;border-radius:4px;padding:1px 7px;font-weight:600;">&#9632; Middle School</span>
    <span style="background:#dcfce7;border:1px solid #86efac;color:#166534;border-radius:4px;padding:1px 7px;font-weight:600;">&#9632; Junior School</span>
    <span style="background:#ffedd5;border:1px solid #fdba74;color:#9a3412;border-radius:4px;padding:1px 7px;font-weight:600;">&#9632; Senior (HOSP)</span>
    <span style="font-size:0.75rem;color:#6b7280;margin-left:0.25rem;">Click &#x2715; on a chip to delete it.</span>
  </div>${teacherLegend}`;
  // Add or update the Selected Bookings list below the calendar
  let selectedListDiv = document.getElementById('selected-bookings-list');
  if (!selectedListDiv) {
    selectedListDiv = document.createElement('div');
    selectedListDiv.id = 'selected-bookings-list';
    selectedListDiv.style.margin = '2em 0 0 0';
    selectedListDiv.style.fontSize = '1em';
    table.parentNode.appendChild(selectedListDiv);
  }
  function renderSelectedBookings() {
    const selectedIds = window.selectedBookingIds || [];
    if (!selectedIds.length) {
      selectedListDiv.innerHTML = '';
      return;
    }
    let html = '<div style="font-weight:bold;margin-bottom:0.5em;">Selected Bookings</div><ul style="margin:0 0 0 1.2em;padding:0;">';
    selectedIds.forEach(id => {
      const b = bookings.find(bk => bk.id === id);
      if (b) {
        const slotHref = `teacher_booking_slots.html?booking_id=${encodeURIComponent(String(id))}&source=${encodeURIComponent(window.location.pathname.split('/').pop() || 'add_booking.html')}`;
        html += `<li><a href="#" onclick="scrollToDesiredServingsRow(${escHtml(String(id))});return false;">${escHtml(b.booking_date)} | ${escHtml(b.staff_name)} | ${escHtml(b.class_name)} | ${escHtml(b.recipe)}</a> <a href="${slotHref}" style="margin-left:0.4rem;font-size:0.8rem;color:#1e40af;">[Slots]</a></li>`;
      }
    });
    html += '</ul>';
    // Desired Serving Ingredients Table for each selected booking
    html += '<div id="desired-ingredients-section" style="margin-top:1.5em;"></div>';
    selectedListDiv.innerHTML = html;

    // Fetch and render desired serving ingredients for each selected booking
    const section = document.getElementById('desired-ingredients-section');
    if (!section) return;
    section.innerHTML = '';
    selectedIds.forEach(async id => {
      // Debug output for Desired_Servings_Ingredients removed
    });
  }
  renderSelectedBookings();

  // Add click handlers to booking cells for selection
  window.selectedBookingIds = Array.isArray(window.selectedBookingIds)
    ? window.selectedBookingIds.map(id => parseInt(id, 10)).filter(id => Number.isInteger(id) && id > 0)
    : [];

  function applySelectionStyles() {
    const selectedIds = new Set(window.selectedBookingIds || []);
    bookings.forEach(cell => {
      const bookingDiv = document.getElementById(`booking-${cell.id}`);
      if (!bookingDiv) return;
      if (selectedIds.has(parseInt(cell.id, 10))) {
        bookingDiv.style.boxShadow = '0 0 0 3px #1976d2, 0 1px 4px #0001';
        bookingDiv.style.background = '#bbdefb';
      } else {
        const baseStyle = getCalendarCellBaseStyle(cell);
        bookingDiv.style.boxShadow = '0 1px 4px #0001';
        bookingDiv.style.background = baseStyle.bg;
        bookingDiv.style.border = `1px solid ${baseStyle.border}`;
      }
    });
  }

  function setupTeacherQuickSelect() {
    const teacherSelect = document.getElementById('quickSelectTeacher');
    const selectBtn = document.getElementById('selectTeacherBookingsBtn');
    const clearBtn = document.getElementById('clearTeacherSelectionBtn');
    if (!teacherSelect) return;

    const teacherNames = [...new Set(
      bookings
        .map(b => String(b.staff_name || '').trim())
        .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b));

    teacherSelect.innerHTML = '<option value="">-- Select teacher --</option>' +
      teacherNames.map(name => `<option value="${escHtml(name)}">${escHtml(name)}</option>`).join('');

    if (selectBtn) {
      selectBtn.onclick = function() {
        const teacher = String(teacherSelect.value || '').trim();
        if (!teacher) {
          if (window.QC) window.QC.toast('Choose a teacher first', 'warn');
          return;
        }
        window.selectedBookingIds = bookings
          .filter(b => String(b.staff_name || '').trim() === teacher)
          .map(b => parseInt(b.id, 10))
          .filter(id => Number.isInteger(id) && id > 0);
        applySelectionStyles();
        renderSelectedBookings();
        if (window.QC) window.QC.toast(`Selected all bookings for ${teacher}`, 'success');
      };
    }

    if (clearBtn) {
      clearBtn.onclick = function() {
        window.selectedBookingIds = [];
        applySelectionStyles();
        renderSelectedBookings();
      };
    }
  }

  bookings.forEach(cell => {
    const bookingDiv = document.getElementById(`booking-${cell.id}`);
    if (bookingDiv) {
      const toggleBooking = function() {
        const bookingId = parseInt(cell.id, 10);
        const idx = window.selectedBookingIds.indexOf(bookingId);
        if (idx === -1) {
          window.selectedBookingIds.push(bookingId);
          publishBookingToBookClassForm(cell);
        } else {
          window.selectedBookingIds.splice(idx, 1);
        }
        window.selectedBookingIds = [...new Set(window.selectedBookingIds)];
        applySelectionStyles();
        renderSelectedBookings();
      };

      if (!schedulePresetApplied && Number.isInteger(schedulePresetBookingId) && schedulePresetBookingId > 0) {
        const preset = bookings.find(b => parseInt(b.id, 10) === schedulePresetBookingId);
        if (preset) {
          window.selectedBookingIds = [schedulePresetBookingId];
          publishBookingToBookClassForm(preset);
          schedulePresetApplied = true;
        }
      }
      bookingDiv.onclick = toggleBooking;
      bookingDiv.onkeydown = function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleBooking();
        }
      };
    }
  });

  applySelectionStyles();
  setupTeacherQuickSelect();

  // Update week label
  const weekStart = new Date(currentMonday);
  const weekEnd = new Date(currentMonday);
  weekEnd.setDate(weekStart.getDate() + 6);
  document.getElementById('calendarWeekLabel').textContent = `Week of ${formatDateLong(weekStart)} to ${formatDateLong(weekEnd)}`;
  ensureWeekendToggleButton();
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.documentElement) {
    document.documentElement.lang = String(userLocale || 'en');
    // One-time delete handler for planner chips (event delegation on document)
    document.addEventListener('click', async (e) => {
      const btn = e.target.closest('.planner-delete-btn');
      if (!btn) return;
      // Only handle clicks inside the schedule calendar table
      if (!btn.closest('#scheduleCalendarTable')) return;
      const id = btn.dataset.bookingId;
      if (!id) return;
      // aria-label is "Delete <recipe>" and the browser decodes HTML entities for us
      const ariaLabel = btn.getAttribute('aria-label') || '';
      const recipeName = ariaLabel.startsWith('Delete ') ? ariaLabel.slice(7) : (btn.dataset.recipe || '');
      if (!confirm(`Delete planner entry "${recipeName}"?`)) return;
      btn.disabled = true;
      try {
        const res = await fetch(`/api/bookings/${id}`, { method: 'DELETE' });
        if (!res.ok) { alert('Failed to delete entry.'); btn.disabled = false; return; }
        await renderScheduleCalendar();
      } catch { alert('Error deleting entry.'); btn.disabled = false; }
    });

    document.addEventListener('click', async (e) => {
      const chip = e.target.closest('.planner-chip');
      if (!chip) return;
      if (!chip.closest('#scheduleCalendarTable')) return;
      if (e.target.closest('.planner-delete-btn')) return;
      const bookingId = chip.getAttribute('data-booking-id');
      if (!bookingId) return;
      await handlePlannerChipClick(bookingId);
    });
  }
  renderScheduleCalendar();
  // Add click handler for compare button
  const compareBtn = document.getElementById('compareStripFoodItemBtn');
  if (compareBtn) {
    compareBtn.onclick = function() {
      const selected = window.selectedBookingIds && window.selectedBookingIds[0];
      if (selected) {
        window.renderStripFoodItemComparisonTable(selected);
      } else {
        alert('Please select a booking first.');
      }
    };
  }
  document.getElementById('prevWeekBtn').onclick = () => {
    currentMonday.setDate(currentMonday.getDate() - 7);
    renderScheduleCalendar();
  };
  document.getElementById('todayBtn').onclick = () => {
    // Reset to this week's regional start day
    currentMonday = getStartOfWeek(new Date());
    renderScheduleCalendar();
  };
  document.getElementById('nextWeekBtn').onclick = () => {
    currentMonday.setDate(currentMonday.getDate() + 7);
    renderScheduleCalendar();
  };

  const scheduleViewModeSelect = document.getElementById('scheduleViewModeSelect');
  if (scheduleViewModeSelect) {
    scheduleViewModeSelect.value = scheduleViewMode;
    updatePrintButtonLabel();
    scheduleViewModeSelect.onchange = () => {
      const nextMode = String(scheduleViewModeSelect.value || '').trim().toLowerCase();
      scheduleViewMode = nextMode === 'recipe' ? 'recipe' : 'class';
      localStorage.setItem(scheduleViewModeStorageKey, scheduleViewMode);
      updatePrintButtonLabel();
      renderScheduleCalendar();
    };
  }

  const printScheduleBtn = document.getElementById('printScheduleBtn');
  if (printScheduleBtn) {
    printScheduleBtn.onclick = async () => {
      const chosenMonday = await askWeekToPrint(currentMonday);
      if (!chosenMonday) return;
      await printScheduleForWeek(chosenMonday, showWeekends, scheduleViewMode);
    };
  }

  updatePrintButtonLabel();
  ensureWeekendToggleButton();

  if (scheduleCalendarSharedChannel) {
    scheduleCalendarSharedChannel.addEventListener('message', (event) => {
      const state = event && event.data ? event.data : null;
      if (!state) return;
      const refreshAt = Number(state.refreshCalendarAt || 0);
      if (Number.isFinite(refreshAt) && refreshAt > lastCalendarRefreshSignalAt) {
        lastCalendarRefreshSignalAt = refreshAt;
      }
      renderScheduleCalendar();
    });
  }
});

window.publishBookingToBookClassForm = publishBookingToBookClassForm;

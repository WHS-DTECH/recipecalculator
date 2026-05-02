
// --- Populate Staff Dropdown ---

const userLocale = (navigator.languages && navigator.languages[0]) || navigator.language || undefined;
const shortWeekdayFormatter = new Intl.DateTimeFormat(userLocale, { weekday: 'short' });
const localDateFormatter = new Intl.DateTimeFormat(userLocale, {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});
const bookClassPageParams = new URLSearchParams(window.location.search);
const isTeacherEmbedView = bookClassPageParams.get('view') === 'teacher_embed';
const isFormOnlyView = bookClassPageParams.get('form_only') === '1';
const isStudentListOnlyView = bookClassPageParams.get('student_list_only') === '1';
const isTimetableOnlyView = bookClassPageParams.get('hide_booking_form') === '1' && bookClassPageParams.get('hide_student_panel') === '1';
const canPublishSharedEmbedState = !isTeacherEmbedView || isFormOnlyView;
const bookClassSharedStateKey = 'bookClassEmbedSharedState';
const bookClassSharedChannelName = 'bookClassEmbedSharedChannel';
const bookClassEmbedSourceId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const bookClassSharedChannel = isTeacherEmbedView && 'BroadcastChannel' in window
  ? new BroadcastChannel(bookClassSharedChannelName)
  : null;
let isApplyingSharedState = false;
let lastSharedStateAppliedAt = 0;
let pendingSharedRecipeId = '';
let pendingSharedRecipeName = '';

function applyRecipeSelection(targetRecipeId = '', targetRecipeName = '') {
  const select = document.getElementById('recipeSelect');
  if (!select) return false;

  const idToUse = String(targetRecipeId || '').trim();
  const nameToUse = String(targetRecipeName || '').trim().toLowerCase();

  if (idToUse && Array.from(select.options).some((opt) => String(opt.value) === idToUse)) {
    select.value = idToUse;
    select.dispatchEvent(new Event('change'));
    return true;
  }

  if (nameToUse) {
    const byName = Array.from(select.options).find((opt) =>
      String(opt.getAttribute('data-recipe-name') || '').trim().toLowerCase() === nameToUse
    );
    if (byName) {
      select.value = byName.value;
      select.dispatchEvent(new Event('change'));
      return true;
    }
  }

  return false;
}

function toLocalIsoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseLocalIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function parseBookingDate(value) {
  return parseLocalIsoDate(value) || new Date(value);
}

function getTopSelections(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch { return []; }
}

function setTopSelection(key, value) {
  let arr = getTopSelections(key);
  arr = arr.filter(v => v !== value);
  arr.unshift(value);
  if (arr.length > 5) arr = arr.slice(0, 5);
  localStorage.setItem(key, JSON.stringify(arr));
}

function getStaffUsageCounts() {
  try {
    const raw = JSON.parse(localStorage.getItem('staffUsageCounts') || '{}');
    if (!raw || typeof raw !== 'object') return {};
    return raw;
  } catch {
    return {};
  }
}

function incrementStaffUsageCount(staffId) {
  const id = String(staffId || '').trim();
  if (!id) return;
  const counts = getStaffUsageCounts();
  const current = Number(counts[id] || 0);
  counts[id] = Number.isFinite(current) ? current + 1 : 1;
  localStorage.setItem('staffUsageCounts', JSON.stringify(counts));
}

function getStaffDisplayLabel(staff) {
  if (!staff) return '';
  return staff.code
    ? `${staff.last_name}, ${staff.first_name} (${staff.code})`
    : `${staff.last_name}, ${staff.first_name}`;
}

function populateStaffDropdown(staffList = null) {
  const loadStaff = Array.isArray(staffList)
    ? Promise.resolve({ staff: staffList })
    : fetch('/api/staff_upload/dropdown').then(res => res.json());

  return loadStaff.then(data => {
    const select = document.getElementById('staffSelect');
    if (!select) return;
    const currentValue = String(select.value || '').trim();
    select.innerHTML = '';
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Choose Staff member';
    defaultOption.disabled = true;
    defaultOption.selected = true;
    select.appendChild(defaultOption);
    const staffArr = (data.staff || []).slice().sort((a, b) => {
      return getStaffDisplayLabel(a).localeCompare(getStaffDisplayLabel(b), undefined, { sensitivity: 'base' });
    });

    const usageCounts = getStaffUsageCounts();
    const recentStaffIds = getTopSelections('topStaff').slice(0, 5);
    const mostUsedId = staffArr
      .map((s) => ({ id: String(s.id || ''), count: Number(usageCounts[String(s.id || '')] || 0) }))
      .sort((a, b) => b.count - a.count)[0];
    const mostUsedStaffId = mostUsedId && mostUsedId.count > 0 ? mostUsedId.id : '';

    const featuredIds = [];
    if (mostUsedStaffId) featuredIds.push(mostUsedStaffId);
    recentStaffIds.forEach((id) => {
      const sid = String(id || '');
      if (sid && !featuredIds.includes(sid)) featuredIds.push(sid);
    });

    const featuredList = featuredIds
      .map((id) => staffArr.find((s) => String(s.id) === String(id)))
      .filter(Boolean);

    // Featured block: most used first, then recent 5. Kept duplicated in full alphabetical list below.
    featuredList.forEach((staff) => {
      const opt = document.createElement('option');
      opt.value = staff.id;
      opt.textContent = getStaffDisplayLabel(staff);
      select.appendChild(opt);
    });

    if (featuredList.length > 0) {
      const sep = document.createElement('option');
      sep.disabled = true;
      sep.textContent = '──────────────';
      select.appendChild(sep);
    }

    // Full alphabetical list (includes featured users in their natural place as requested).
    staffArr.forEach((staff) => {
      const opt = document.createElement('option');
      opt.value = staff.id;
      opt.textContent = getStaffDisplayLabel(staff);
      select.appendChild(opt);
    });

    if (currentValue && Array.from(select.options).some((opt) => String(opt.value || '') === currentValue)) {
      select.value = currentValue;
    }
  });
}

// --- Populate Class Dropdown ---

function getStaffCodeById(staffId, staffArr) {
  const staff = staffArr.find(s => String(s.id) === String(staffId));
  return staff && staff.code ? staff.code : '';
}

let _staffArrCache = [];
let _currentTeacherTimetablePeriods = [];
let _preferredStaffId = '';

function normalizeToken(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function readCurrentStaffUser() {
  try {
    const raw = sessionStorage.getItem('currentStaffUser');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function deriveCandidateFromAuthUser(user) {
  if (!user) return null;
  const name = String(user.name || '').trim();
  const parts = name ? name.split(/\s+/).filter(Boolean) : [];
  const email = String(user.email || '').trim();
  const emailLocal = email ? email.split('@')[0] : '';
  const emailParts = emailLocal.split(/[._-]+/).filter(Boolean);

  const firstFromName = parts.length ? parts[0] : '';
  const lastFromName = parts.length > 1 ? parts.slice(1).join(' ') : '';
  const firstFromEmail = emailParts.length ? emailParts[0] : '';
  const lastFromEmail = emailParts.length > 1 ? emailParts[emailParts.length - 1] : '';

  return {
    id: user.id || '',
    code: user.code || '',
    first_name: firstFromName || firstFromEmail,
    last_name: lastFromName || lastFromEmail,
    email_school: email || ''
  };
}

async function readCurrentStaffUserWithAuthFallback() {
  const fromStorage = readCurrentStaffUser();
  if (fromStorage) return fromStorage;

  try {
    const resp = await fetch('/api/auth/me', { credentials: 'include' });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data || !data.authenticated || !data.user) return null;
    const candidate = deriveCandidateFromAuthUser(data.user);
    if (candidate) {
      try {
        sessionStorage.setItem('currentStaffUser', JSON.stringify(candidate));
      } catch {
        // Ignore storage write issues.
      }
    }
    return candidate;
  } catch {
    return null;
  }
}

function resolveLoggedInStaffId(staffRows = [], currentUser = null) {
  if (!currentUser || !Array.isArray(staffRows) || !staffRows.length) return '';

  const targetId = String(currentUser.id || '').trim();
  const targetCode = normalizeToken(currentUser.code);
  const targetEmail = normalizeEmail(currentUser.email_school || currentUser.email || '');
  const targetFirst = normalizeToken(currentUser.first_name);
  const targetLast = normalizeToken(currentUser.last_name);
    if (targetEmail) {
      const byEmail = staffRows.find(s => normalizeEmail(s.email_school) === targetEmail);
      if (byEmail) return String(byEmail.id || '');
    }

  const combinedOne = normalizeToken(`${currentUser.first_name || ''}${currentUser.last_name || ''}`);
  const combinedTwo = normalizeToken(`${currentUser.last_name || ''}${currentUser.first_name || ''}`);

  if (targetId) {
    const byId = staffRows.find(s => String(s.id || '') === targetId);
    if (byId) return String(byId.id || '');
  }

  if (targetCode) {
    const byCode = staffRows.find(s => normalizeToken(s.code) === targetCode);
    if (byCode) return String(byCode.id || '');
  }

  const byName = staffRows.find((s) => {
    const first = normalizeToken(s.first_name);
    const last = normalizeToken(s.last_name);
    const joinedOne = normalizeToken(`${s.first_name || ''}${s.last_name || ''}`);
    const joinedTwo = normalizeToken(`${s.last_name || ''}${s.first_name || ''}`);
    return (
      (targetFirst && targetLast && first === targetFirst && last === targetLast) ||
      (combinedOne && joinedOne === combinedOne) ||
      (combinedTwo && joinedTwo === combinedTwo)
    );
  });

  return byName ? String(byName.id || '') : '';
}

function ensureStaffSelected(preferredStaffId = '') {
  const staffSelect = document.getElementById('staffSelect');
  if (!staffSelect) return '';

  if (preferredStaffId) {
    staffSelect.value = String(preferredStaffId);
  }

  if (staffSelect.value) return String(staffSelect.value);

  const firstRealOption = Array.from(staffSelect.options || []).find(opt => !opt.disabled && String(opt.value || '').trim() !== '');
  if (firstRealOption) {
    staffSelect.value = firstRealOption.value;
  }
  return String(staffSelect.value || '');
}

function readSharedEmbedState() {
  if (!isTeacherEmbedView) return null;
  try {
    return JSON.parse(localStorage.getItem(bookClassSharedStateKey) || 'null');
  } catch {
    return null;
  }
}

function writeSharedEmbedState(partialState = {}, options = {}) {
  const forcePublish = !!options.force;
  if (!isTeacherEmbedView || (!canPublishSharedEmbedState && !forcePublish) || isApplyingSharedState) return;
  const nextState = {
    ...(readSharedEmbedState() || {}),
    ...partialState,
    sourceId: bookClassEmbedSourceId,
    updatedAt: Date.now()
  };
  lastSharedStateAppliedAt = nextState.updatedAt;
  localStorage.setItem(bookClassSharedStateKey, JSON.stringify(nextState));
  if (bookClassSharedChannel) {
    bookClassSharedChannel.postMessage(nextState);
  }
}

function ensureClassOption(select, className) {
  if (!select || !className) return;
  const hasOption = Array.from(select.options).some(opt => String(opt.value) === String(className));
  if (hasOption) return;
  const option = document.createElement('option');
  option.value = className;
  option.textContent = `${className} (shared)`;
  option.setAttribute('data-shared-option', '1');
  select.appendChild(option);
}

function setRecipeSelectionInfo(message) {
  const el = document.getElementById('recipeSelectionInfo');
  if (!el) return;
  const text = String(message || '').trim();
  if (!text) {
    el.textContent = '';
    el.style.display = 'none';
    return;
  }
  el.textContent = text;
  el.style.display = '';
}

function getCurrentEmbedState() {
  const saveBtn = document.getElementById('saveBookingBtn');
  return {
    staffId: document.getElementById('staffSelect')?.value || '',
    className: document.getElementById('classSelect')?.value || '',
    bookingDate: document.getElementById('dateInput')?.value || '',
    period: document.getElementById('periodSelect')?.value || '',
    recipeId: document.getElementById('recipeSelect')?.value || '',
    recipeSelectionInfo: document.getElementById('recipeSelectionInfo')?.textContent || '',
    classSize: document.getElementById('classSizeInput')?.value || '',
    editBookingId: saveBtn && saveBtn.dataset ? (saveBtn.dataset.editId || '') : ''
  };
}

function clearFormEditMode() {
  const saveBtn = document.getElementById('saveBookingBtn');
  const masterSaveBtn = document.getElementById('masterSaveBtn');
  const deleteBtn = document.getElementById('deleteBookingBtn');
  if (saveBtn) {
    saveBtn.textContent = 'Save booking';
    delete saveBtn.dataset.editId;
  }
  if (masterSaveBtn) {
    masterSaveBtn.textContent = 'SAVE';
  }
  if (deleteBtn) {
    deleteBtn.style.display = 'none';
    delete deleteBtn.dataset.bookingId;
  }
}

function setFormEditMode(bookingId) {
  const normalizedId = String(bookingId || '').trim();
  const saveBtn = document.getElementById('saveBookingBtn');
  const masterSaveBtn = document.getElementById('masterSaveBtn');
  const deleteBtn = document.getElementById('deleteBookingBtn');
  if (!saveBtn || !normalizedId) return;

  saveBtn.dataset.editId = normalizedId;
  saveBtn.textContent = 'Update booking';
  if (masterSaveBtn) {
    masterSaveBtn.textContent = 'UPDATE';
  }
  if (deleteBtn) {
    deleteBtn.style.display = 'inline-block';
    deleteBtn.dataset.bookingId = normalizedId;
  }
}

function applySharedEmbedState(state = {}) {
  if (!isTeacherEmbedView || !state) return Promise.resolve();
  if (state.sourceId && state.sourceId === bookClassEmbedSourceId) {
    return Promise.resolve();
  }
  if (state.updatedAt && state.updatedAt <= lastSharedStateAppliedAt) {
    return Promise.resolve();
  }

  const staffSelect = document.getElementById('staffSelect');
  const classSelect = document.getElementById('classSelect');
  const dateInput = document.getElementById('dateInput');
  const periodSelect = document.getElementById('periodSelect');
  const recipeSelect = document.getElementById('recipeSelect');
  const classSizeInput = document.getElementById('classSizeInput');
  const targetStaffId = state.staffId || '';
  const targetClassName = state.className || '';
  const targetDate = state.bookingDate || '';
  const targetPeriod = state.period || '';
  const targetRecipeId = state.recipeId || '';
  const targetRecipeName = state.recipeName || '';
  const targetRecipeSelectionInfo = state.recipeSelectionInfo || '';
  const targetClassSize = state.classSize || '';
  const targetEditBookingId = state.editBookingId || '';
  lastSharedStateAppliedAt = state.updatedAt || Date.now();

  isApplyingSharedState = true;

  if (dateInput && targetDate) {
    dateInput.value = targetDate;
    updateBookingDateDayLabel();
  }
  if (periodSelect && targetPeriod) {
    periodSelect.value = targetPeriod;
  }
  if (targetRecipeId || targetRecipeName) {
    const selected = applyRecipeSelection(targetRecipeId, targetRecipeName);
    if (!selected) {
      pendingSharedRecipeId = String(targetRecipeId || '').trim();
      pendingSharedRecipeName = String(targetRecipeName || '').trim();
    }
  }
  setRecipeSelectionInfo(targetRecipeSelectionInfo);
  if (classSizeInput && targetClassSize) {
    classSizeInput.value = targetClassSize;
  }

  const finalize = () => {
    if (classSelect) {
      if (targetClassName) {
        ensureClassOption(classSelect, targetClassName);
        classSelect.value = targetClassName;
      }
      fetchStudentsForClass(classSelect.value || '');
    }
    fetchTeacherTimetableForSelectedDate();
    if (targetEditBookingId) {
      setFormEditMode(targetEditBookingId);
    } else {
      clearFormEditMode();
    }
    isApplyingSharedState = false;
  };

  if (staffSelect && targetStaffId) {
    staffSelect.value = targetStaffId;
    const staffCode = getStaffCodeById(targetStaffId, _staffArrCache);
    return populateClassDropdown(staffCode).then(() => finalize());
  }

  finalize();
  return Promise.resolve();
}

function normalizeClassToken(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function expandTimetableClassTokens(values) {
  return (Array.isArray(values) ? values : [])
    .flatMap(v => String(v || '').split(/[;|]/g))
    .map(v => v.trim())
    .filter(Boolean);
}

function deriveClassCodeFromTimetableToken(token) {
  const raw = String(token || '').trim();
  if (!raw) return '';
  const trimmed = raw.replace(/^-+|-+$/g, '');
  if (!trimmed) return '';

  const parts = trimmed.split('-').map(p => p.trim()).filter(Boolean);
  if (parts.length >= 2 && /^\d{1,3}[A-Z]?$/i.test(parts[0])) {
    return parts[1].toUpperCase();
  }
  if (parts.length >= 3 && /^\d{1,3}[A-Z]?$/i.test(parts[0])) {
    return parts[1].toUpperCase();
  }
  if (parts.length > 1) {
    const best = parts.find(p => /[A-Za-z]/.test(p) && p.length >= 4);
    if (best) return best.toUpperCase();
  }
  return trimmed.toUpperCase();
}

function syncClassDropdownFromTimetable(periods) {
  const classSelect = document.getElementById('classSelect');
  if (!classSelect) return;

  const tokens = (Array.isArray(periods) ? periods : [])
    .flatMap(p => expandTimetableClassTokens(p && p.classes))
    .map(deriveClassCodeFromTimetableToken)
    .filter(Boolean);

  if (!tokens.length) return;

  const uniqueCodes = [...new Set(tokens)];
  const existingNorm = new Set(
    Array.from(classSelect.options)
      .map(opt => normalizeClassToken(opt.value))
      .filter(Boolean)
  );

  uniqueCodes.forEach(code => {
    if (existingNorm.has(normalizeClassToken(code))) return;
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = `${code} (from timetable)`;
    opt.setAttribute('data-timetable-fallback', '1');
    classSelect.appendChild(opt);
  });
}

function autoSelectClassFromSelectedPeriod() {
  const periodSelect = document.getElementById('periodSelect');
  const classSelect = document.getElementById('classSelect');
  if (!periodSelect || !classSelect) return;

  const selectedPeriod = `P${periodSelect.value}`;
  const periodEntry = (_currentTeacherTimetablePeriods || []).find(p => p && p.period === selectedPeriod);
  if (!periodEntry || !Array.isArray(periodEntry.classes) || !periodEntry.classes.length) return;

  const timetableTokens = periodEntry.classes
    .flatMap(item => String(item || '').split(/[;,|]/g))
    .map(token => token.trim())
    .filter(Boolean);

  const options = Array.from(classSelect.options).filter(opt => opt.value);
  if (!options.length || !timetableTokens.length) return;

  const normalizedTokens = timetableTokens.map(normalizeClassToken);
  let matchedOption = null;

  for (const opt of options) {
    const valueNorm = normalizeClassToken(opt.value);
    const textNorm = normalizeClassToken(opt.textContent);
    if (normalizedTokens.some(tok => tok === valueNorm || tok === textNorm || tok.includes(valueNorm) || textNorm.includes(tok))) {
      matchedOption = opt;
      break;
    }
  }

  if (matchedOption) {
    classSelect.value = matchedOption.value;
    fetchStudentsForClass(classSelect.value);
  }
}

function selectClassOptionFromToken(classToken) {
  const classSelect = document.getElementById('classSelect');
  if (!classSelect || !classToken) return false;

  const rawToken = String(classToken || '').trim();
  const tokenNorm = normalizeClassToken(rawToken);
  const tokenParts = rawToken
    .split(/[^A-Za-z0-9]+/g)
    .map(p => normalizeClassToken(p))
    .filter(p => p.length >= 3);
  const options = Array.from(classSelect.options).filter(opt => opt.value);
  if (!options.length) return false;

  let matchedOption = null;

  // Pass 1: strict matching only (exact raw/exact normalized).
  for (const opt of options) {
    const rawValue = String(opt.value || '').trim();
    const rawText = String(opt.textContent || '').trim();
    const valueNorm = normalizeClassToken(opt.value);
    const textNorm = normalizeClassToken(opt.textContent);

    if (
      rawToken.toUpperCase() === rawValue.toUpperCase() ||
      rawToken.toUpperCase() === rawText.toUpperCase() ||
      tokenNorm === valueNorm ||
      tokenNorm === textNorm
    ) {
      matchedOption = opt;
      break;
    }
  }

  // Pass 2: conservative fuzzy matching (only for longer, meaningful tokens).
  if (!matchedOption) {
    for (const opt of options) {
      const valueNorm = normalizeClassToken(opt.value);
      const textNorm = normalizeClassToken(opt.textContent);

      const partExactMatch = tokenParts.some(part => part === valueNorm || part === textNorm);
      const safeContainMatch = tokenNorm.length >= 5 && valueNorm.length >= 5 &&
        (tokenNorm.includes(valueNorm) || valueNorm.includes(tokenNorm));

      if (partExactMatch || safeContainMatch) {
        matchedOption = opt;
        break;
      }
    }
  }

  if (matchedOption) {
    classSelect.value = matchedOption.value;
    fetchStudentsForClass(classSelect.value);
    return true;
  }

  // Fallback: add/select the clicked timetable class if no existing option matches.
  const tempOptId = '__timetableDynamicClassOption';
  const existingTemp = document.getElementById(tempOptId);
  if (existingTemp) existingTemp.remove();

  const fallbackOpt = document.createElement('option');
  fallbackOpt.id = tempOptId;
  fallbackOpt.value = rawToken;
  fallbackOpt.textContent = `${rawToken} (from timetable)`;
  classSelect.appendChild(fallbackOpt);
  classSelect.value = rawToken;
  fetchStudentsForClass(classSelect.value);
  return true;
}

function updateBookingDateDayLabel() {
  const dateInput = document.getElementById('dateInput');
  const dayLabel = document.getElementById('dateDayOfWeek');
  if (!dateInput || !dayLabel) return;
  const value = dateInput.value;
  if (!value) {
    dayLabel.textContent = '';
    return;
  }
  const parsed = parseLocalIsoDate(value);
  if (!parsed || isNaN(parsed.getTime())) {
    dayLabel.textContent = '';
    return;
  }
  dayLabel.textContent = `(${shortWeekdayFormatter.format(parsed)})`;
}

function getWeekMonday(dateObj) {
  const d = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
  const weekday = d.getDay();
  const daysSinceMonday = (weekday + 6) % 7;
  d.setDate(d.getDate() - daysSinceMonday);
  return d;
}

function updateTeacherTimetableDaySelector() {
  const dayButtons = Array.from(document.querySelectorAll('#teacherTimetableDaySelector .teacher-day-btn'));
  if (!dayButtons.length) return;

  const dateInput = document.getElementById('dateInput');
  const parsed = parseLocalIsoDate(dateInput && dateInput.value ? dateInput.value : '') || new Date();
  const selectedWeekday = parsed.getDay();

  dayButtons.forEach((btn) => {
    const btnWeekday = Number(btn.getAttribute('data-weekday') || 0);
    const isActive = btnWeekday === selectedWeekday;
    btn.style.background = isActive ? '#1e40af' : '#e2e8f0';
    btn.style.color = isActive ? '#fff' : '#334155';
    btn.style.border = isActive ? '1px solid #1e40af' : '1px solid #cbd5e1';
    btn.style.borderRadius = '6px';
    btn.style.padding = '0.26rem 0.52rem';
    btn.style.fontSize = '0.82rem';
    btn.style.cursor = 'pointer';
    btn.style.fontWeight = isActive ? '700' : '600';
  });
}

function jumpTeacherTimetableToWeekday(weekdayMonToFri) {
  const dayIndex = Number(weekdayMonToFri);
  if (![1, 2, 3, 4, 5].includes(dayIndex)) return;

  const dateInput = document.getElementById('dateInput');
  if (!dateInput) return;

  const parsed = parseLocalIsoDate(dateInput.value || '') || new Date();
  const monday = getWeekMonday(parsed);
  monday.setDate(monday.getDate() + (dayIndex - 1));
  dateInput.value = toLocalIsoDate(monday);

  updateBookingDateDayLabel();
  updateTeacherTimetableDaySelector();
  fetchTeacherTimetableForSelectedDate();
  writeSharedEmbedState(getCurrentEmbedState(), { force: true });
}

function renderTeacherTimetable(periods, teacherCode, date, weekday) {
  const meta = document.getElementById('teacherTimetableMeta');
  const body = document.getElementById('teacherTimetableBody');
  if (!meta || !body) return;

  meta.textContent = `${teacherCode} timetable for ${date}${weekday ? ` (${weekday})` : ''}`;
  if (!periods || !periods.length) {
    body.innerHTML = '<div class="text-muted">No timetable classes found for this day.</div>';
    return;
  }

  const rows = periods.map(p => {
    const classTokens = expandTimetableClassTokens(p.classes);
    const classText = classTokens.length
      ? classTokens.map(cls => `<button type="button" class="timetable-class-chip" data-period="${p.period}" data-class-token="${String(cls || '').replace(/"/g, '&quot;')}" style="margin:0 0.25rem 0.25rem 0;padding:0.2rem 0.45rem;border:1px solid #90caf9;border-radius:12px;background:#e3f2fd;color:#0d47a1;cursor:pointer;font-size:1rem;">${cls}</button>`).join('')
      : '<span style="color:#999;">No class</span>';
    return `<tr><td style="font-weight:bold;width:60px;">${p.period}</td><td>${classText}</td></tr>`;
  }).join('');
  body.innerHTML = `
    <table class="bookings-table" style="margin-top:0.5rem;">
      <thead><tr><th>Period</th><th>Class(es)</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  _currentTeacherTimetablePeriods = (Array.isArray(periods) ? periods : []).map(p => ({
    ...p,
    classes: expandTimetableClassTokens(p && p.classes)
  }));

  syncClassDropdownFromTimetable(_currentTeacherTimetablePeriods);
  autoSelectClassFromSelectedPeriod();

  body.querySelectorAll('.timetable-class-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const periodSelect = document.getElementById('periodSelect');
      const dateInput = document.getElementById('dateInput');
      if (dateInput && date) {
        dateInput.value = date;
        updateBookingDateDayLabel();
      }

      const periodValue = String(btn.getAttribute('data-period') || '').replace(/^P/i, '');
      if (periodSelect && periodValue) {
        periodSelect.value = periodValue;
      }

      const classToken = btn.getAttribute('data-class-token') || '';
      const wasMatched = selectClassOptionFromToken(classToken);
      if (!wasMatched) {
        autoSelectClassFromSelectedPeriod();
      }
      writeSharedEmbedState(getCurrentEmbedState(), { force: true });
    });
  });
}

function fetchTeacherTimetableForSelectedDate() {
  const staffSelect = document.getElementById('staffSelect');
  const dateInput = document.getElementById('dateInput');
  const meta = document.getElementById('teacherTimetableMeta');
  const body = document.getElementById('teacherTimetableBody');
  if (!staffSelect || !dateInput || !meta || !body) return;

  const staffCode = getStaffCodeById(staffSelect.value, _staffArrCache);
  const date = dateInput.value;
  if (!staffCode || !date) {
    meta.textContent = 'Select teacher and date to view timetable.';
    body.innerHTML = '';
    return;
  }

  meta.textContent = 'Loading timetable...';
  body.innerHTML = '';
  fetch(`/api/upload_timetable/teacher-day?teacherCode=${encodeURIComponent(staffCode)}&date=${encodeURIComponent(date)}`)
    .then(res => res.json())
    .then(data => {
      if (!data || data.success === false) {
        throw new Error(data && data.error ? data.error : 'Failed to load timetable');
      }
      renderTeacherTimetable(data.periods || [], data.teacherCode || staffCode, data.date || date, data.weekday || '');
    })
    .catch(() => {
      _currentTeacherTimetablePeriods = [];
      meta.textContent = 'Failed to load timetable for selected teacher/date.';
      body.innerHTML = '';
    });
}

function renderClassStudents(students = []) {
  const tbody = document.getElementById('classStudentsBody');
  const meta = document.getElementById('classStudentsMeta');
  const classSizeInput = document.getElementById('classSizeInput');
  if (!tbody || !meta) return;

  if (!students.length) {
    tbody.innerHTML = '<tr><td colspan="4">No students found for this class.</td></tr>';
    meta.textContent = '0 students timetabled for selected class.';
    if (classSizeInput) classSizeInput.value = 0;
    return;
  }

  meta.textContent = `${students.length} students timetabled for selected class.`;
  if (classSizeInput) classSizeInput.value = students.length;
  tbody.innerHTML = students.map(s => `
    <tr>
      <td>${s.id_number || ''}</td>
      <td>${s.student_name || ''}</td>
      <td>${s.form_class || ''}</td>
      <td>${s.year_level || ''}</td>
    </tr>
  `).join('');
}

function fetchStudentsForClass(classCode) {
  const meta = document.getElementById('classStudentsMeta');
  const tbody = document.getElementById('classStudentsBody');
  if (!meta || !tbody) return;

  if (!classCode) {
    meta.textContent = 'Choose a class to view students.';
    tbody.innerHTML = '<tr><td colspan="4">No class selected.</td></tr>';
    const classSizeInput = document.getElementById('classSizeInput');
    if (classSizeInput) classSizeInput.value = 1;
    return;
  }

  meta.textContent = 'Loading students...';
  fetch(`/api/student_upload/by-class/${encodeURIComponent(classCode)}`)
    .then(res => res.json())
    .then(data => renderClassStudents(data.students || []))
    .catch(() => {
      meta.textContent = 'Failed to load students for this class.';
      tbody.innerHTML = '<tr><td colspan="4">Could not load students.</td></tr>';
    });
}

function populateClassDropdown(staffCode) {
  let url = '/api/classes/dropdown';
  if (staffCode) url += '?staffCode=' + encodeURIComponent(staffCode);
  return fetch(url)
    .then(res => res.json())
    .then(data => {
      const select = document.getElementById('classSelect');
      if (!select) return;
      select.innerHTML = '';
        // Add default option
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Choose Class';
        defaultOption.disabled = true;
        defaultOption.selected = true;
        select.appendChild(defaultOption);
      const classArr = (data.classes || []).filter(c => c && c.ttcode && c.name);
      const topClasses = getTopSelections('topClasses');
      // Sort: topClasses first, then rest
      const sorted = [
        ...topClasses.map(ttcode => classArr.find(c => c.ttcode === ttcode)).filter(Boolean),
        ...classArr.filter(c => !topClasses.includes(c.ttcode))
      ];
      if (sorted.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No classes available for this staff member';
        select.appendChild(opt);
        fetchStudentsForClass('');
        return;
      }
      sorted.forEach(cls => {
        if (!cls || !cls.ttcode || !cls.name) return;
        const opt = document.createElement('option');
        opt.value = cls.ttcode;
        // Only show TTCode and Name (and Level in brackets if present)
        if (cls.level) {
          opt.textContent = `${cls.ttcode} - ${cls.name} (${cls.level})`;
        } else {
          opt.textContent = `${cls.ttcode} - ${cls.name}`;
        }
        select.appendChild(opt);
      });
      fetchStudentsForClass('');
    });
}

// --- Populate Recipe Dropdown ---
function populateRecipeDropdown() {
  fetch('/api/recipes/display-dropdown')
    .then(res => res.json())
    .then(data => {
      const select = document.getElementById('recipeSelect');
      if (!select) return;
      select.innerHTML = '';
      // Add default option
      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = 'Choose a recipe';
      defaultOption.disabled = true;
      defaultOption.selected = true;
      select.appendChild(defaultOption);
      (data.recipes || []).forEach(recipe => {
        const recipeId = recipe.recipeid != null ? recipe.recipeid : recipe.id;
        const recipeName = recipe.name || '';
        const opt = document.createElement('option');
        opt.value = String(recipeId);
        opt.textContent = `[ID: ${recipeId}] ${recipeName}`;
        opt.setAttribute('data-recipe-id', String(recipeId));
        opt.setAttribute('data-recipe-name', recipeName);
        select.appendChild(opt);
      });

      if (pendingSharedRecipeId || pendingSharedRecipeName) {
        const selected = applyRecipeSelection(pendingSharedRecipeId, pendingSharedRecipeName);
        if (selected) {
          pendingSharedRecipeId = '';
          pendingSharedRecipeName = '';
        }
      }
    });
}

function buildDesiredServingsIngredients(rows, desiredServings) {
  return (Array.isArray(rows) ? rows : []).map(row => {
    const baseQty = row.measure_qty;
    let calculatedQty = baseQty;

    if (baseQty && !isNaN(parseFloat(baseQty))) {
      calculatedQty = (parseFloat(baseQty) * desiredServings).toString();
    }

    return {
      ingredient_id: row.id,
      ingredient_name: row.ingredient_name,
      measure_qty: row.measure_qty,
      measure_unit: row.measure_unit,
      fooditem: row.fooditem,
      calculated_qty: calculatedQty,
      stripFoodItem: row.strip_fooditem || row.stripFoodItem || '',
      aisle_category_id: row.aisle_category_id || ''
    };
  });
}

function saveDesiredServingsInBackground(details = {}) {
  const recipeId = String(details.recipeId || '').trim();
  const classSize = parseInt(String(details.classSize || '').trim(), 10);
  const groups = parseInt(String(details.groups || '').trim(), 10);

  if (!recipeId) {
    return Promise.reject(new Error('Recipe is required for desired servings calculation.'));
  }
  if (isNaN(classSize) || classSize <= 0) {
    return Promise.reject(new Error('Class size is required for desired servings calculation.'));
  }
  if (isNaN(groups) || groups <= 0) {
    return Promise.reject(new Error('Groups is required for desired servings calculation.'));
  }

  const desiredServings = Math.ceil(classSize / groups);

  return fetch('/api/ingredients/inventory/all')
    .then(res => res.json())
    .then(data => {
      const ingredients = Array.isArray(data)
        ? data
        : (Array.isArray(data.data) ? data.data : (Array.isArray(data.ingredients) ? data.ingredients : []));
      const filteredIngredients = ingredients.filter(row => String(row.recipe_id) === recipeId);

      if (!filteredIngredients.length) {
        throw new Error('No recipe ingredients were found to calculate desired servings.');
      }

      return fetch('/api/ingredients/desired_servings_ingredients/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_id: details.bookingId || '',
          teacher: details.teacher || '',
          staff_id: details.staffId || '',
          class_name: details.className || '',
          class_date: details.bookingDate || '',
          class_size: classSize,
          groups,
          desired_servings: desiredServings,
          recipe_id: recipeId,
          ingredients: buildDesiredServingsIngredients(filteredIngredients, desiredServings)
        })
      });
    })
    .then(res => res.json())
    .then(data => {
      if (!data.success) {
        throw new Error(data && data.error ? data.error : 'Failed to save desired serving ingredients.');
      }
      return data;
    });
}

// --- Save Booking ---

function saveBooking(options = {}) {
  const shouldAutoCalculate = !!options.autoCalculate;
  let groupsForAutoCalculate = '';
  const staffSelect = document.getElementById('staffSelect');
  const classSelect = document.getElementById('classSelect');
  const dateInput = document.getElementById('dateInput');
  const periodSelect = document.getElementById('periodSelect');
  const recipeSelect = document.getElementById('recipeSelect');
  const classSizeInput = document.getElementById('classSizeInput');
  const staffId = staffSelect.value;
  const staffName = staffSelect.options[staffSelect.selectedIndex].textContent;
  const className = classSelect.value;
  const bookingDate = dateInput.value;
  const period = periodSelect.value;
  const classSize = classSizeInput.value;
  // Get recipe_id from selected option (assume dropdown options have data-recipe-id)
  let recipeId = '';
  let recipeName = '';
  if (recipeSelect.selectedIndex > 0) {
    const selectedRecipeOption = recipeSelect.options[recipeSelect.selectedIndex];
    recipeId = selectedRecipeOption.getAttribute('data-recipe-id') || selectedRecipeOption.value || '';
    recipeName = selectedRecipeOption.getAttribute('data-recipe-name') || '';
  }

  if (shouldAutoCalculate) {
    const suggestedGroups = Math.max(1, parseInt(String(options.groups || '').trim(), 10) || 1);
    const groupAnswer = prompt('How many groups do you want?', String(suggestedGroups));
    if (groupAnswer === null) {
      return Promise.resolve({ cancelled: true });
    }

    const parsedGroups = parseInt(String(groupAnswer).trim(), 10);
    if (isNaN(parsedGroups) || parsedGroups <= 0) {
      if (window.QC) window.QC.toast('Please enter a valid number of groups', 'warn');
      else alert('Please enter a valid number of groups.');
      return Promise.resolve({ cancelled: true, invalidGroups: true });
    }

    groupsForAutoCalculate = String(parsedGroups);
  }

  // Track most selected
  setTopSelection('topStaff', staffId);
  incrementStaffUsageCount(staffId);
  setTopSelection('topClasses', className);
  const editId = document.getElementById('saveBookingBtn').dataset.editId;
  const method = editId ? 'PUT' : 'POST';
  const url = editId ? `/api/bookings/${editId}` : '/api/bookings';
  return fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      staff_id: staffId,
      staff_name: staffName,
      class_name: className,
      booking_date: bookingDate,
      period,
      recipe: recipeName,
      recipe_id: recipeId,
      class_size: classSize
    })
  })
    .then(res => res.json())
    .then(result => {
      if (result.success) {
        if (window.QC) window.QC.toast('Booking saved successfully', 'success');
        const savedBookingId = result.booking_id || editId || '';

        if (shouldAutoCalculate) {
          return saveDesiredServingsInBackground({
            bookingId: savedBookingId,
            teacher: staffName,
            staffId,
            className,
            bookingDate,
            classSize,
            groups: groupsForAutoCalculate || '1',
            recipeId
          }).then(() => {
            if (window.QC) window.QC.toast('Desired serving ingredients saved', 'success');
            clearFormEditMode();
            document.getElementById('resetBtn').click();
            fetchAndRenderBookings();
            writeSharedEmbedState({ ...getCurrentEmbedState(), refreshCalendarAt: Date.now(), editBookingId: '' }, { force: true });
            return result;
          }).catch(err => {
            if (window.QC) window.QC.toast('Booking saved, but desired servings failed', 'warn');
            else alert('Booking saved, but desired servings failed.');
            console.error('Desired servings background save failed:', err);
            fetchAndRenderBookings();
            writeSharedEmbedState({ ...getCurrentEmbedState(), refreshCalendarAt: Date.now(), editBookingId: '' }, { force: true });
            return { ...result, desiredServingsSaved: false, desiredServingsError: err.message || String(err) };
          });
        }

        clearFormEditMode();
        document.getElementById('resetBtn').click();
        fetchAndRenderBookings();
        writeSharedEmbedState({ ...getCurrentEmbedState(), refreshCalendarAt: Date.now(), editBookingId: '' }, { force: true });
        return result;
      } else {
        if (window.QC) window.QC.toast('Failed to save booking', 'error');
        else alert('Failed to save booking.');
        throw new Error('Failed to save booking.');
      }
    })
    .catch((err) => {
      if (window.QC) window.QC.toast('Failed to save booking', 'error');
      else alert('Failed to save booking.');
      throw err;
    });
}

// Helper to get staff id by name (for edit)
function getStaffIdByName(staffName) {
  const match = (_staffArrCache || []).find(s => `${s.last_name}, ${s.first_name}` === staffName || `${s.code} - ${s.last_name}, ${s.first_name}` === staffName);
  return match ? match.id : '';
}


// --- Fetch and Render Bookings ---
function fetchAndRenderBookings() {
  fetch('/api/bookings/all')
    .then(res => res.json())
    .then(data => {
      renderBookings(data.bookings || []);
    });
}

function renderBookings(bookings = []) {
  const tbody = document.getElementById('scheduledBookings');
  if (!bookings.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-muted">No bookings found.</td></tr>';
    return;
  }
  tbody.innerHTML = bookings.map(b => {
    // Format date using the browser locale.
    let formattedDate = '';
    if (b.booking_date) {
      try {
        const dateObj = parseBookingDate(b.booking_date);
        formattedDate = localDateFormatter.format(dateObj);
      } catch {
        formattedDate = b.booking_date;
      }
    }
    return `<tr data-booking-id="${b.id}">
      <td>${b.id || ''}</td>
      <td>${formattedDate}</td>
      <td>${b.period || ''}</td>
      <td>${b.staff_name || ''}</td>
      <td>${b.class_name || ''}</td>
      <td>${b.class_size || ''}</td>
      <td>${b.recipe_id ? `[ID: ${b.recipe_id}] ` : ''}${b.recipe || ''}</td>
      <td><button class='edit-btn'>Edit</button> <button class='delete-btn'>Delete</button></td>
    </tr>`;
  }).join('');
  // Attach event listeners for delete
  tbody.querySelectorAll('.delete-btn').forEach(btn => {
    btn.onclick = function() {
      const tr = btn.closest('tr');
      const bookingId = tr.getAttribute('data-booking-id');
      if (confirm('Delete this booking?')) {
        fetch(`/api/bookings/${bookingId}`, { method: 'DELETE' })
          .then(res => res.json())
          .then(result => {
            if (result.success) {
              if (window.QC) window.QC.toast('Booking deleted', 'success');
              fetchAndRenderBookings();
            } else {
              if (window.QC) window.QC.toast('Failed to delete booking', 'error');
              else alert('Failed to delete booking.');
            }
          })
          .catch(() => {
            if (window.QC) window.QC.toast('Failed to delete booking', 'error');
            else alert('Failed to delete booking.');
          });
      }
    };
  });
  function loadBookingIntoForm(booking) {
    if (!booking) return;
    const staffSelect = document.getElementById('staffSelect');
    const classSelect = document.getElementById('classSelect');
    const dateInput = document.getElementById('dateInput');
    const periodSelect = document.getElementById('periodSelect');
    const recipeSelect = document.getElementById('recipeSelect');
    const classSizeInput = document.getElementById('classSizeInput');

    const bookingStaffId = String(booking.staff_id || getStaffIdByName(booking.staff_name) || '');
    if (staffSelect && bookingStaffId) {
      staffSelect.value = bookingStaffId;
    }
    const staffCode = getStaffCodeById(bookingStaffId, _staffArrCache);
    populateClassDropdown(staffCode).then(() => {
      if (classSelect) {
        classSelect.value = booking.class_name || '';
        fetchStudentsForClass(classSelect.value || '');
      }
    });

    if (dateInput) {
      dateInput.value = booking.booking_date || '';
      updateBookingDateDayLabel();
    }
    if (periodSelect) {
      periodSelect.value = String(booking.period || '');
    }
    if (recipeSelect) {
      const recipeIdValue = booking.recipe_id ? String(booking.recipe_id) : '';
      if (recipeIdValue) {
        recipeSelect.value = recipeIdValue;
      } else if (booking.recipe) {
        const optionByName = Array.from(recipeSelect.options).find(opt => (opt.getAttribute('data-recipe-name') || '').trim() === String(booking.recipe).trim());
        if (optionByName) recipeSelect.value = optionByName.value;
      }
    }
    if (classSizeInput) {
      classSizeInput.value = booking.class_size || '';
    }
    setFormEditMode(booking.id);
    writeSharedEmbedState({
      ...getCurrentEmbedState(),
      staffId: bookingStaffId,
      className: booking.class_name || '',
      bookingDate: booking.booking_date || '',
      period: String(booking.period || ''),
      recipeId: booking.recipe_id ? String(booking.recipe_id) : '',
      classSize: String(booking.class_size || ''),
      editBookingId: String(booking.id || '')
    }, { force: true });
  }

  // Attach event listeners for edit
  tbody.querySelectorAll('.edit-btn').forEach(btn => {
    btn.onclick = function() {
      const tr = btn.closest('tr');
      const bookingId = tr.getAttribute('data-booking-id');
      // Find booking data
      const booking = bookings.find(b => String(b.id) === String(bookingId));
      if (!booking) return;
      loadBookingIntoForm(booking);
    };
  });
}

// --- Event Listeners ---
window.addEventListener('DOMContentLoaded', () => {
  fetch('/api/staff_upload/dropdown')
    .then(res => res.json())
    .then(async (data) => {
      _staffArrCache = data.staff || [];
      const currentUser = await readCurrentStaffUserWithAuthFallback();
      _preferredStaffId = resolveLoggedInStaffId(_staffArrCache, currentUser);
      if (_preferredStaffId) {
        setTopSelection('topStaff', _preferredStaffId);
      }
      return populateStaffDropdown(_staffArrCache).then(() => {
        const sharedState = readSharedEmbedState();
        const firstStaffId = sharedState && sharedState.staffId
          ? sharedState.staffId
          : (_preferredStaffId || (_staffArrCache.length ? _staffArrCache[0].id : ''));
        const staffSelect = document.getElementById('staffSelect');
        if (staffSelect && firstStaffId) {
          staffSelect.value = firstStaffId;
        }
        const effectiveStaffId = ensureStaffSelected(firstStaffId);
        const staffCode = getStaffCodeById(effectiveStaffId, _staffArrCache);
        return populateClassDropdown(staffCode).then(() => applySharedEmbedState(sharedState || getCurrentEmbedState()));
      });
    });

  const dateInput = document.getElementById('dateInput');
  if (dateInput && !dateInput.value) {
    dateInput.value = toLocalIsoDate(new Date());
  }
  updateBookingDateDayLabel();
  updateTeacherTimetableDaySelector();

  populateRecipeDropdown();
  fetchAndRenderBookings();
  document.getElementById('saveBookingBtn').addEventListener('click', () => {
    saveBooking({ autoCalculate: false }).catch(() => {});
  });
  const masterSaveBtn = document.getElementById('masterSaveBtn');
  if (masterSaveBtn) {
    masterSaveBtn.addEventListener('click', () => {
      saveBooking({ autoCalculate: true }).catch(() => {});
    });
  }
  const deleteBookingBtn = document.getElementById('deleteBookingBtn');
  if (deleteBookingBtn) {
    deleteBookingBtn.addEventListener('click', () => {
      const saveBtn = document.getElementById('saveBookingBtn');
      const bookingId = saveBtn && saveBtn.dataset ? String(saveBtn.dataset.editId || '').trim() : '';
      if (!bookingId) {
        if (window.QC) window.QC.toast('Select an existing booking first', 'warn');
        return;
      }
      if (!confirm('Delete this booking?')) return;
      fetch(`/api/bookings/${encodeURIComponent(bookingId)}`, { method: 'DELETE' })
        .then(res => res.json())
        .then(result => {
          if (!result || !result.success) {
            throw new Error((result && (result.error || result.message)) || 'Delete failed');
          }
          clearFormEditMode();
          document.getElementById('resetBtn').click();
          fetchAndRenderBookings();
          writeSharedEmbedState({ ...getCurrentEmbedState(), refreshCalendarAt: Date.now(), editBookingId: '' }, { force: true });
          if (window.QC) window.QC.toast('Booking deleted', 'success');
        })
        .catch((err) => {
          console.error('[Book a Class] Delete failed', err);
          if (window.QC) window.QC.toast('Failed to delete booking', 'error');
          else alert('Failed to delete booking.');
        });
    });
  }
  document.getElementById('resetBtn').addEventListener('click', () => {
    clearFormEditMode();
    document.getElementById('classSizeInput').value = 1;
    document.getElementById('recipeSelect').selectedIndex = 0;
    setRecipeSelectionInfo('');
    document.getElementById('periodSelect').selectedIndex = 0;
    document.getElementById('dateInput').value = toLocalIsoDate(new Date());
    updateBookingDateDayLabel();
    document.getElementById('classSelect').selectedIndex = 0;
    const staffSelect = document.getElementById('staffSelect');
    if (staffSelect) {
      if (_preferredStaffId) {
        staffSelect.value = _preferredStaffId;
      } else {
        staffSelect.selectedIndex = 0;
      }
    }
    // Reset class dropdown to first staff
    const staffId = document.getElementById('staffSelect').value;
    const staffCode = getStaffCodeById(staffId, _staffArrCache);
    populateClassDropdown(staffCode);
    fetchTeacherTimetableForSelectedDate();
    writeSharedEmbedState(getCurrentEmbedState());
  });
  document.getElementById('staffSelect').addEventListener('change', function() {
    const staffId = this.value;
    setTopSelection('topStaff', staffId);
    incrementStaffUsageCount(staffId);
    const staffCode = getStaffCodeById(staffId, _staffArrCache);
    populateClassDropdown(staffCode);
    fetchTeacherTimetableForSelectedDate();
    writeSharedEmbedState({ ...getCurrentEmbedState(), staffId, className: '' });
  });
  document.getElementById('dateInput').addEventListener('change', function() {
    updateBookingDateDayLabel();
    updateTeacherTimetableDaySelector();
    fetchTeacherTimetableForSelectedDate();
    writeSharedEmbedState(getCurrentEmbedState());
  });

  document.querySelectorAll('#teacherTimetableDaySelector .teacher-day-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      jumpTeacherTimetableToWeekday(btn.getAttribute('data-weekday'));
    });
  });
  document.getElementById('periodSelect').addEventListener('change', function() {
    autoSelectClassFromSelectedPeriod();
    writeSharedEmbedState(getCurrentEmbedState());
  });
  document.getElementById('recipeSelect').addEventListener('change', function() {
    setRecipeSelectionInfo('');
    writeSharedEmbedState(getCurrentEmbedState());
  });
  document.getElementById('classSelect').addEventListener('change', function() {
    fetchStudentsForClass(this.value);
    writeSharedEmbedState(getCurrentEmbedState());
  });
  fetchStudentsForClass('');
  fetchTeacherTimetableForSelectedDate();

  if (isTeacherEmbedView) {
    if (bookClassSharedChannel) {
      bookClassSharedChannel.addEventListener('message', event => {
        if (!event || !event.data) return;
        applySharedEmbedState(event.data);
      });
    }

    if (canPublishSharedEmbedState) {
      window.setTimeout(() => {
        writeSharedEmbedState(getCurrentEmbedState());
      }, 250);
    }
  }

  if (window.QC) {
    window.QC.addSanityButton('Book a Class', [
      {
        name: 'Staff dropdown has options',
        run: async () => {
          const el = document.getElementById('staffSelect');
          return !!el && el.options.length > 1;
        }
      },
      {
        name: 'Class dropdown present',
        run: async () => {
          const el = document.getElementById('classSelect');
          return !!el;
        }
      },
      {
        name: 'Recipe dropdown has options',
        run: async () => {
          const el = document.getElementById('recipeSelect');
          return !!el && el.options.length > 1;
        }
      },
      {
        name: 'Timetable endpoint reachable',
        run: async () => {
          const staffCode = getStaffCodeById(document.getElementById('staffSelect')?.value, _staffArrCache);
          const date = document.getElementById('dateInput')?.value;
          if (!staffCode || !date) return true;
          const res = await fetch(`/api/upload_timetable/teacher-day?teacherCode=${encodeURIComponent(staffCode)}&date=${encodeURIComponent(date)}`);
          return res.ok;
        }
      }
    ]);
  }
});

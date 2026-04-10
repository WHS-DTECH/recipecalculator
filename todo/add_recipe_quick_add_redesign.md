# Add Recipe & Quick Add Redesign Plan

## Current State Issues
- **Heavy inline styles**: Buttons and sections have hardcoded colors and padding.
- **Inconsistent spacing**: Margins and padding vary throughout.
- **No semantic structure**: Sections use divs with manual styling instead of component classes.
- **Hard to maintain**: Color or spacing changes require editing multiple inline styles.

## Redesign Approach

### 1. Page Template
Both pages should follow a consistent layout:

```html
<div class="main-content-margins">
  <h2>Page Title with Status Badge</h2>
  
  <div class="recipe-workflow">
    <!-- Step 1: Load Source -->
    <div class="ui-card">
      <h3>Step 1 – Load Recipe Source</h3>
      <div class="setup-section-desc">Subtitle/instruction text</div>
      <form class="form-grid">
        <div class="form-field">
          <label>URL or File</label>
          <input type="text|file" />
        </div>
      </form>
      <div class="ui-action-bar">
        <button class="btn btn-primary">Load</button>
        <button class="btn btn-secondary">Clear</button>
      </div>
      <div id="step1-status" class="ui-state"></div>
      <div id="step1-progress" class="ui-progress" style="display:none;">
        <div class="ui-progress-bar"></div>
      </div>
    </div>

    <!-- Step 2: Extract Data -->
    <div class="ui-card">
      <h3>Step 2 – Extract Data</h3>
      <div class="setup-section-desc">Subtitle</div>
      <div class="ui-action-bar">
        <button class="btn btn-primary">Extract All</button>
        <button class="btn btn-secondary">Auto-Accept</button>
      </div>
      <table class="ui-data-table">
        <thead>
          <tr>
            <th>Field</th>
            <th>Status</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Title</td>
            <td><span class="ui-status-chip is-success">✓ Extracted</span></td>
            <td>Recipe Title</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Step 3: Save -->
    <div class="ui-card">
      <h3>Step 3 – Save Recipe</h3>
      <div class="ui-action-bar">
        <button class="btn btn-primary">Save Recipe</button>
        <button class="btn btn-secondary">Preview</button>
      </div>
      <div id="step3-status" class="ui-state" style="display:none;"></div>
    </div>
  </div>

  <!-- Database Matrix (Right Column, Sticky) -->
  <aside class="recipe-detail-panel">
    <div class="ui-card">
      <h3>Recipe Details</h3>
      <div id="recipe-matrix"></div>
    </div>
  </aside>
</div>
```

### 2. Shared CSS Classes to Use

#### Card Wrapper
```html
<div class="ui-card">
  <!-- Content -->
</div>
```

#### Buttons
```html
<button class="btn btn-primary">Save</button>
<button class="btn btn-secondary">Cancel</button>
<button class="btn btn-danger">Delete</button>
```

#### Form Grid
```html
<div class="form-grid">
  <div class="form-field">
    <label>Field Label</label>
    <input type="text" />
  </div>
</div>
```

#### Status States
```html
<!-- Success state -->
<div class="ui-state ui-state-success">Recipe saved!</div>

<!-- Error state -->
<div class="ui-state ui-state-error">Upload failed.</div>

<!-- Loading state -->
<div class="ui-state ui-state-loading">Processing...</div>
```

#### Status Chips
```html
<span class="ui-status-chip is-success">✓ Complete</span>
<span class="ui-status-chip is-warning">⚠ Review</span>
<span class="ui-status-chip is-error">✗ Failed</span>
```

#### Progress Bar
```html
<div id="progress" class="ui-progress">
  <div class="ui-progress-bar" style="width: 45%;"></div>
</div>
```

#### Data Table
```html
<table class="ui-data-table">
  <thead>
    <tr>
      <th>Column 1</th>
      <th>Column 2</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Data</td>
      <td>Data</td>
    </tr>
  </tbody>
</table>
```

### 3. Required CSS Additions

Add to [shared/base.css](shared/base.css):

```css
/* Form Grid */
.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--space-4);
  margin: var(--space-3) 0;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

/* Button Variants */
.btn {
  font-weight: 500;
  transition: background 0.2s ease;
  cursor: pointer;
  border: none;
  border-radius: var(--radius-sm);
  padding: var(--space-2) var(--space-4);
}

.btn-primary {
  background: var(--color-primary);
  color: white;
}

.btn-primary:hover {
  background: #1565c0;
}

.btn-secondary {
  background: var(--color-neutral-100);
  color: var(--color-neutral-900);
  border: 1px solid var(--color-neutral-200);
}

.btn-danger {
  background: var(--color-danger);
  color: white;
}

/* Workflow Container */
.recipe-workflow {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  margin: var(--space-5) 0;
}

/* Detail Panel */
.recipe-detail-panel {
  position: sticky;
  top: var(--space-3);
  max-height: 80vh;
  overflow-y: auto;
}

@media (max-width: 1100px) {
  .recipe-workflow + .recipe-detail-panel {
    display: none;
  }
}
```

### 4. JavaScript Status Updates

Replace inline status div styling with class updates:

```javascript
function updateStatus(elementId, type, message) {
  const el = document.getElementById(elementId);
  el.className = `ui-state ui-state-${type}`;
  el.textContent = message;
  el.style.display = 'block';
}

// Usage:
updateStatus('step1-status', 'success', 'Recipe loaded successfully');
updateStatus('step1-status', 'error', 'Failed to load recipe');
```

### 5. Implementation Order
1. Add form-grid and button variants to base.css.
2. Refactor quick_add.html to use the new layout and component classes.
3. Refactor add_recipe.html to match.
4. Update JavaScript status update functions.
5. Test on desktop and mobile.

### Benefits
- **50% less inline CSS** in HTML.
- **Consistent spacing and colors** across both pages.
- **Easier to maintain**: Change a color in design_tokens.css, reflects everywhere.
- **Better accessibility**: Uses semantic button styles with proper hover/focus states.
- **Mobile-ready**: Component classes handle responsive sizing.

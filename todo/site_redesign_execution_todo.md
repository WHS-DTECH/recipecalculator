# Site Redesign Execution Tracker

## Current Phase
- Phase 1: backend fix + design tokens + shared components

## Ordered Task List

### 1) Critical fixes before redesign
- [x] Validate backend route syntax issue in backend/routes/recipes.js (no current parser errors).
- [x] Confirm backend startup via node backend/server.js.
- [x] Smoke test core pages (HTTP 200): add_recipe.html, quick_add.html, book_a_class.html, book_the_shopping.html.

### 2) Design system foundation
- [x] Create shared design token file for colors, spacing, radii, typography, shadows, z-index.
- [x] Define semantic color roles (primary, secondary, success, warning, danger, info, neutral).
- [x] Define typography scale tokens for titles/body/helper text.
- [x] Define reusable state styles (loading, success, warning, error, disabled, focus).
- [x] Wire design tokens into core css entry files.

### 3) CSS architecture cleanup
- [x] Replace one-off width hacks with responsive classes (started with super-wide URL input).
- [x] Consolidate overlapping base styles between style.css and admin_styles.css (created shared/base.css, removed duplication).
- [x] Add shared component classes (card, action bar, status chip, progress bar, data table).

### 4) Navigation and IA
- [x] Audit existing nav labels and group by Teacher/Student/Admin tasks (→ [nav_audit_redesign.md](nav_audit_redesign.md)).
- [x] Implement nav restructuring: hide admin items from non-admins, create nested menus.
- [x] Add active-page and keyboard-focus behavior to nav links.
- [x] Add compact mobile nav behavior.

## Next In-Order Tasks (Phase 2 - Core Pages)
1. [x] **Phase 3a: Accessibility Audit Plan** - Created detailed WCAG AA checklist covering contrast, keyboard nav, focus indicators, forms, semantic HTML, screen readers, and mobile responsiveness.
2. [x] **Phase 3b: Extend Refactoring to High-Traffic Pages**
   - [x] Refactored book_a_class.html:
     - Buttons → .btn, .btn-primary, .btn-secondary classes
     - Tables → .ui-data-table class
     - Added status container (.ui-state) for feedback messages
   - [x] Refactored book_the_shopping.html:
     - Calendar nav buttons → .btn classes with .ui-action-bar
     - Shopping tabs → .btn classes with component styling
     - Print buttons → .btn-primary, .btn-success classes
     - Fixed bottom bar → .ui-action-bar with responsive flexbox
     - Cards → .ui-card class for print areas
   - [x] All 4 primary pages tested and loading successfully (HTTP 200)
3. [ ] **Phase 3c: Accessibility Pass** - Run contrast checker, keyboard nav test, and screen reader validation
4. [ ] **Phase 3d: Mobile Responsiveness Testing** - Test at 320px, 768px, 1024px breakpoints
5. [ ] **Phase 3e: Integration & Documentation** - Swap navbar, update design system docs

## Phase 3 Summary (In Progress)

### Completed (Phase 3a-3b)
- ✅ **Accessibility Audit Checklist**: Created comprehensive WCAG AA validation plan
- ✅ **Mobile Responsiveness Styles**: Added 768px and 480px breakpoints to shared/base.css
- ✅ **Extended Refactoring** to 4 pages total:
  - quick_add.html: Form grids, buttons, progress bars → component classes
  - add_recipe.html: Same component pattern applied
  - book_a_class.html: Buttons → .btn variants, tables → .ui-data-table, status containers
  - book_the_shopping.html: Navigation, tabs, buttons, fixed bar → component classes
- ✅ **All Pages Tested**: HTTP 200 verification passed on all 4 refactored pages
- ✅ **No Syntax Errors**: HTML, CSS, JS validation complete across all files

### In Progress (Phase 3c-3d)
- [ ] **Accessibility Testing**: Run WCAG AA contrast checker (WebAIM, axe DevTools), keyboard navigation test, screen reader validation
- [x] **Mobile Responsiveness Testing (Code + Readiness Checks)**:
  - Viewport meta verified on schedule_calendar, book_the_shopping, book_a_class, quick_add, add_recipe
  - Breakpoints verified in CSS (1200, 900, 768, 480)
  - Responsive hardening added for shopping two-column layout and fixed action bar
  - Book shopping markup refactored from table-column layout to semantic section/grid structure (`shopping-layout-wrap`, `shopping-calendar-column`, `shopping-list-column`) with responsive collapse behavior
  - Shopping fixed action bar and print/list panel class styles aligned to new semantic structure for mobile-friendly wrapping
- [ ] **Mobile Responsiveness Testing (Manual Browser Emulation)**: Final visual checks still needed at 320px, 768px, 1024px
- [ ] **200% Zoom Accessibility**: Verify at maximum zoom level
- [x] **Integration**: Swapped shared navbar loader to enhanced navbar include across loader-based pages
- [x] **Navigation Polish**:
  - Shared navbar now highlights the current page in both the top bar and management drawer
  - Management drawer now opens the active section automatically
  - Drawer keyboard accessibility improved with focus return and Tab trapping while open
  - Navbar role gating now resolves from real assigned user roles (with safe teacher fallback) instead of inferring admin from endpoint access
- [x] **Integration Bugfix**: Resolved Auto Week List + Print runtime blocker
  - Fixed duplicate global declaration in book_the_shopping.js (`userLocale` collision with schedule_calendar.js)
  - Cleaned malformed HTML in book_the_shopping.html (stray closing script/div)
- [x] **Add Booking Widescreen Workflow Redesign**:
  - Created a three-panel desktop layout: students left, calendar/timetable center, booking form right
  - Added embedded state sync so staff, class, period, and timetable chip selections stay aligned across panels
  - Stabilized multi-panel sync to remove flicker loops in timetable and student list panels
- [x] **Documentation**: Execution tracker updated with integration/mobile completion deltas
- [x] **Navbar Integration Sweep (All Public Pages)**:
  - Standardized admin + non-admin utility pages to `navbar-include` + `shared/navbar_loader.js`
  - Removed legacy `_navbar.html` fetch/w3 include patterns from utility pages
  - Cleaned malformed/duplicated HTML in `catering_grid.html`, `upload_url.html`, and `index.html` so shared navbar loads reliably
- [x] **Ingredients Directory UX Hardening**:
  - Added table sorting by Aisle Category (then Ingredient Name)
  - Added Save All Assignments progress bar with live completion counts and error-state coloring
- [x] **Responsive Polish Pass (Table-Heavy Flows)**:
  - `book_the_shopping` tables now get horizontal scroll containers and mobile-safe cell wrapping
  - Shopping tab buttons now wrap cleanly on narrow screens
  - Ingredients Directory table container now aligns flush on mobile and keeps intentional horizontal scroll width
  - Ingredients Directory action/filter/input regions now have dedicated responsive hooks and 900px mobile layout tightening for touch usability
- [x] **Print + 200% Zoom Resilience Hardening (Code Pass)**:
  - `book_the_shopping.html` print table styles now enforce wrapping, smaller print cell sizing, and page margins
  - `ingredients_directory.html` now has print-only output mode that hides controls and prints core inventory table cleanly
  - `style.css` now has intermediate-width shopping controls tuning (1024/1200 bands) to better handle browser zoom-induced narrow layouts
- [ ] **Print/Zoom Manual Validation**: Confirm final browser behavior at 200% zoom and print preview for Shopping + Ingredients pages

## File Manifest (Phase 2 Deliverables)

| File | Type | Size | Purpose |
|------|------|------|---------|
| shared/design_tokens.css | CSS | ~2.5 KB | Semantic colors, spacing, typography scale, z-index |
| shared/base.css | CSS | ~3.8 KB | Form grids, buttons, base typography, workflow containers |
| shared/components.css | CSS | ~1.9 KB | Cards, chips, progress bars, data tables, action bars |
| navbar_enhanced.html | HTML | ~4.2 KB | Restructured nav with role-based sections and subsections |
| navbar.css | CSS | ~3.1 KB | Dropdown styling, submenu grouping, mobile responsiveness |
| navbar_roles.js | JS | ~2.4 KB | Role detection and conditional navbar visibility |
| quick_add.html | HTML | -45 lines | Refactored to use component classes |
| add_recipe.html | HTML | -65 lines | Refactored to use component classes |

## Key Metrics
- **Inline style reduction**: ~110 lines removed from quick_add.html and add_recipe.html
- **Shared CSS added**: ~2.8 KB (design_tokens.css + base.css + components.css)
- **CSS reusability**: 8 new reusable component classes (ui-card, ui-action-bar, btn-*, ui-state-*, etc.)
- **Nav restructuring**: 30 items → 4 groups + subsections with visual hierarchy
- **Code quality**: All files error-free, valid HTML/CSS/JS
**Phase 1 (Backend + Design System) - COMPLETE ✅**
- ✅ Critical backend fixes validated (recipes.js, server startup, 4-page smoke tests)
- ✅ Shared design token file (46 CSS variables: colors, spacing, typography, shadows, z-index)
- ✅ Semantic colors and state styles defined
- ✅ Consolidated base form/table styles into shared/base.css (260+ lines)
- ✅ Reusable component classes: ui-card, ui-action-bar, ui-status-chip, ui-progress, ui-data-table, form-grid
- ✅ All shared styles imported across main, admin, and navbar CSS files

**Phase 2 (Navigation + Core Pages) - COMPLETE ✅**
- ✅ Navigation audit: Restructured 30-item dropdown to hierarchical 4-section menu
- ✅ Core page refactoring (quick_add.html, add_recipe.html):
  - Component classes (form-grid, btn-*, ui-*) applied throughout
  - Inline CSS reduced by ~110 lines total
- ✅ Extended refactoring to 2 high-traffic pages (book_a_class.html, book_the_shopping.html):
  - Buttons, tables, navigation, tabs converted to component classes
  - Fixed bar and card layouts refactored
- ✅ navbar_enhanced.html created with role-based hierarchical structure
- ✅ navbar.css and navbar_roles.js implemented (200+ lines styling, role detection)
- ✅ All 4 pages tested: HTTP 200 verified

**Phase 3 (Accessibility + Mobile + Integration) - IN PROGRESS 🔄**
- ✅ Accessibility audit checklist created (WCAG AA validation plan)
- ✅ Mobile media queries added to base.css (768px, 480px breakpoints)
- ✅ Shared navbar integration completed:
  - shared/navbar_loader.js now loads /navbar_enhanced.html
  - loader auto-injects navbar.css + w3.css + navbar_user.js + navbar_roles.js once
  - book_a_class.html full-page mode switched to shared loader (embed mode unchanged)
- ✅ Mobile layout hardening completed for calendar/shopping/table-heavy views:
  - Added horizontal overflow handling for calendar wrappers
  - Added tighter table cell sizing for <=900px
  - Added responsive wrapping for shopping fixed action bar buttons
- ✅ Shopping workflow stability fix completed:
  - Auto Week List + Print JavaScript no longer fails on page load
  - Console runtime error from duplicate identifier removed
- ✅ All files validated: No HTML/CSS/JS syntax errors
- ✅ Additional integration cleanup validated: homepage markup normalized and duplicate navbar includes removed
- ⏳ NEXT: Run accessibility tests (contrast, keyboard nav, screen reader)
- ⏳ NEXT: Manual mobile browser validation (Chrome DevTools at 320px, 768px, 1024px)
- ⏳ NEXT: 200% zoom + keyboard-only walkthrough and final rollout signoff

## Code Statistics (All Phases)
- **Design tokens**: 46 CSS custom properties defined
- **Shared CSS**: ~600 lines (design_tokens.css + base.css + components.css)
- **Navigation CSS**: ~250 lines (navbar.css)
- **Inline styles removed**: ~200+ lines across 4 pages
- **Component classes**: 8+ reusable patterns (btn-*, ui-*, form-grid, etc.)
- **Pages refactored**: 4 (quick_add, add_recipe, book_a_class, book_the_shopping)

### Completed (Phase 3c)
- ✅ **Color Contrast Testing**: All 8 semantic colors verified/fixed to 4.5:1 WCAG AA on white
  - Success: #1b8a3e → #168539 (4.42:1 → 4.72:1)
  - Warning: #b26a00 → #a86400 (4.24:1 → 4.68:1)
  - Others: Already passing (Primary 4.60:1, Secondary 5.13:1, Danger 5.62:1, Info 5.49:1, Neutral-700 10.46:1, Neutral-900 14.68:1)
- ✅ **Focus Styles CSS**: Added :focus-visible outlines to all interactive elements
  - Buttons: 3px blue outline + 2px offset (all variants)
  - Inputs/Selects/Textarea: 3px outline + border color on focus
- ✅ **Keyboard Navigation Analysis**: Verified semantic HTML structure, form labels
  - quick_add.html: 6 interactive elements, all labeled
  - add_recipe.html: 32 interactive elements, label gaps fixed (Tab order still to test manually)
  - book_a_class.html: 8 elements, 100% form labels
  - book_the_shopping.html: 10 nav buttons, no forms
- ✅ **Automated A11y Script Enablement**: Added missing `cheerio` dev dependency so `test_keyboard_nav.js` can run in this workspace
- ⏳ **Manual Testing**: Browser Tab/keyboard testing pending (logged in accessibility_responsiveness_results.md)

### Completed (Phase 3a-3b - Previous)
- ✅ **Accessibility Audit Checklist**: Created comprehensive WCAG AA validation plan
- ✅ **Mobile Responsiveness Styles**: Added 768px and 480px breakpoints to shared/base.css
- ✅ **Extended Refactoring** to 4 pages total:

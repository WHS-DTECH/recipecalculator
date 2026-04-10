# Phase 3: Accessibility & Responsiveness Audit

## WCAG AA Compliance Checklist

### Color Contrast (WCAG AA requires 4.5:1 for text, 3:1 for UI)
- [ ] Primary color (#1976d2) on white background → Check contrast ratio
- [ ] Secondary color (#2e7d32) on white background → Check contrast ratio
- [ ] Danger color (#c62828) on white background → Check contrast ratio
- [ ] Success color (#1b8a3e) on white background → Check contrast ratio
- [ ] Neutral text (#1f2937) on backgrounds → Check contrast ratio
- [ ] Focus ring color on interactive elements → Visual clarity

### Keyboard Navigation
- [ ] Tab order logical on quick_add.html
- [ ] Tab order logical on add_recipe.html
- [ ] Tab order logical on book_a_class.html
- [ ] Tab order logical on book_the_shopping.html
- [ ] Focus ring visible on all interactive elements
- [ ] Dropdown menus keyboard accessible (arrow keys, Enter)
- [ ] Can dismiss modals with Escape key

### Visible Focus Indicators
- [ ] Buttons have visible :focus-visible outline
- [ ] Form inputs have visible focus ring
- [ ] Links have visible focus ring
- [ ] Focus ring color contrasts with background

### Form Labels & ARIA
- [ ] All form inputs have associated <label> elements
- [ ] Required fields marked with aria-required or visual indicator
- [ ] Error messages linked to form fields with aria-describedby
- [ ] Status messages announced to screen readers

### Semantic HTML
- [ ] Proper heading hierarchy (h1, h2, h3)
- [ ] Button elements used for buttons (not <div> or <a>)
- [ ] Form elements properly wrapped in <form>
- [ ] Table headers marked with <th>
- [ ] Lists use <ul>, <ol>, <li> when appropriate

### Screen Reader Testing
- [ ] Pages are navigable without mouse
- [ ] Button purposes clear from text/aria-label
- [ ] Form field purposes clear
- [ ] Status/error messages announced

### Mobile Responsiveness (Bootstrap breakpoints)
- [x] Viewport meta present on key pages (schedule_calendar, book_the_shopping, book_a_class, quick_add, add_recipe)
- [x] 320px/768px/1024px breakpoints are present in CSS system (style.css + shared/base.css)
- [x] Shopping page responsive hardening added (stacking two-column layout at <=1200px, fixed bar wraps on mobile)
- [ ] 320px (small mobile): Manual visual check in DevTools
- [ ] 768px (tablet): Manual visual check in DevTools
- [ ] 1024px (desktop): Manual visual check in DevTools
- [ ] Touch targets ≥ 48px × 48px (manual tap target validation)

## Pages to Test

### Refactored in Phase 2 ✓
- quick_add.html
- add_recipe.html
- navbar_enhanced.html

### Scheduled for Phase 3b (Refactoring)
- book_a_class.html
- book_the_shopping.html

### High-Priority Remaining Pages
- booking_grid.html (if used by teachers)
- calculate_servings.html
- recipe_setup_main.html

## Test Plan

### Automated Tests
- WebAIM contrast checker (colors vs. WCAG AA)
- axe DevTools accessibility scanner
- Lighthouse accessibility audit

### Manual Tests
1. Keyboard-only navigation (disable mouse)
2. Screen reader test with NVDA or JAWS simulator
3. Chrome DevTools device emulation at 320px, 768px, 1024px widths
4. Font size at 200% zoom (browser + OS level)

## Findings & Updates
- Fixed production issue blocking shopping workflow:
	- Auto Week List + Print was broken due to duplicate global constant declaration (`userLocale`) between schedule_calendar.js and book_the_shopping.js.
	- Renamed shopping-page locale constant to avoid collision.
	- Confirmed combined script parse succeeds and page returns HTTP 200.
- Cleaned malformed HTML in book_the_shopping.html (stray closing script/div tags).
- Remaining work: manual viewport visuals (320/768/1024), keyboard-only pass, and 200% zoom verification.

# Site Redesign TODO (Students + Teachers)

## 1) Critical Fixes Before UI Redesign
- [ ] Fix backend startup error in `backend/routes/recipes.js` (`router` declaration is broken).
- [ ] Confirm `node backend/server.js` starts cleanly with no syntax/runtime errors.
- [ ] Smoke-test core pages after fix: Add Recipe, Quick Add, Book a Class, Shopping.

## 2) Design System Foundation
- [ ] Create a shared design token file (colors, spacing, radii, typography, shadows, z-index).
- [ ] Define semantic color roles: primary, secondary, success, warning, danger, info, neutral.
- [ ] Standardize typography scale for page titles, section titles, body text, helper text.
- [ ] Define reusable state styles for loading, success, warning, error, disabled, focus.

## 3) CSS Architecture Cleanup
- [ ] Reduce inline styles by moving repeated styles into shared CSS classes.
- [ ] Consolidate conflicting styles from `style.css` and `admin_styles.css`.
- [ ] Create shared component classes: card, action bar, status chip, progress bar, data table.
- [ ] Remove one-off width hacks (e.g., very large fixed URL input widths).

## 4) Navigation & Information Architecture
- [ ] Redesign top navigation by user tasks (Teacher, Student, Admin) with clearer grouping.
- [ ] Keep labels action-focused and concise (e.g., Quick Add, Publish, Book Class).
- [ ] Add active-page indicator and keyboard-friendly focus states.
- [ ] Add compact mobile nav behavior for smaller screens.

## 5) Core Workflow UX (Teacher-first)
- [ ] Redesign Add Recipe and Quick Add with a shared page template.
- [ ] Introduce consistent step status states: Not started, Running, Needs review, Completed.
- [ ] Standardize buttons and hierarchy: one primary action, secondary actions, danger actions.
- [ ] Keep progress + inline status visible without popup interruptions.

## 6) Tables, Forms, and Readability
- [ ] Standardize table styling: sticky header, row hover, status chips, readable spacing.
- [ ] Improve long-form inputs/textarea readability with consistent padding and contrast.
- [ ] Introduce reusable form grid patterns for desktop and mobile.
- [ ] Add empty/error/loading states for every data table block.

## 7) Accessibility & Responsiveness
- [ ] Ensure color contrast meets WCAG AA for text and controls.
- [ ] Add visible focus outlines for all keyboard-interactive elements.
- [ ] Verify keyboard-only navigation for menu, forms, and dialogs.
- [ ] Validate layouts on common school device widths (laptop/tablet/mobile).

## 8) Render Deployment Readiness (Frontend)
- [ ] Ensure static assets use cache-busting version strategy where needed.
- [ ] Move environment-specific URLs/config values to env-driven config.
- [ ] Add production-safe error handling UI for failed API/network requests.
- [ ] Create a deployment checklist specific to Render (build/start/env vars/health checks).

## 9) Google Integration Readiness (Future-proof UI)
- [ ] Reserve top-right account area for Google login state (avatar, role, sign-out).
- [ ] Design login-aware UI states (guest, teacher, admin).
- [ ] Add UI flow for emailing recipe suggestions (compose, send state, success/failure).
- [ ] Add calendar sync states in booking pages (synced/pending/conflict/error).

## 10) Suggested Implementation Order
- [ ] Phase 1: backend fix + design tokens + shared components.
- [ ] Phase 2: Add Recipe and Quick Add redesign implementation.
- [ ] Phase 3: Navigation unification + responsive cleanup across high-traffic pages.
- [ ] Phase 4: Google login/calendar/email feature UI integration.

## Notes
- Keep the current extractor workflows and API endpoints intact while redesigning.
- Prioritize minimal behavior regression: visual/style refactor first, workflow logic second.

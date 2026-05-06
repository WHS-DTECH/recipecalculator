# Teacher-First Shopping Implementation TODO

Goal: Make the Teacher Shopping List the source of truth, then generate a finalized Technician ordering list with strong quantity accuracy controls.

## Phase 0 - Safety + Scope Lock ✅

**Decisions confirmed 6 May 2026:**

- [x] Week boundary: **Friday** — all shopping plans are keyed by the Friday date of that week.
- [x] Authority model:
  - [x] **Lead Teacher** (admin role) can finalize and reopen a plan.
  - [x] **Technician** is read-only on the finalized list; can add supplier notes only.
- [x] Quantity policy:
  - [x] Final quantity = **Teacher Qty** when the teacher has explicitly edited it.
  - [x] Else final quantity = **Calculated Qty** (from recipe scaling).

Acceptance
- [x] Written decisions captured in this file before coding starts.

---

## Phase 1 - Data Model (MVP)

### 1.1 New Tables
- [ ] Create migration for `shopping_plan`.
  - Fields: `id`, `week_ending`, `status`, `version`, `created_by`, `created_at`, `finalized_by`, `finalized_at`, `notes`.
- [ ] Create migration for `shopping_plan_classes`.
  - Fields: `id`, `plan_id`, `booking_id`, `class_name`, `teacher_name`, `recipe_id`, `planned_servings`, `included`, `sort_order`.
- [ ] Create migration for `shopping_plan_items`.
  - Fields: `id`, `plan_id`, `category`, `item_name`, `normalized_item_key`, `base_unit`, `calculated_qty`, `teacher_qty`, `final_qty`, `source_type`, `source_detail_json`, `notes`, `sort_order`, `edited_by`, `edited_at`.
- [ ] Create migration for `shopping_plan_item_audit`.
  - Fields: `id`, `plan_item_id`, `field_name`, `old_value`, `new_value`, `reason`, `changed_by`, `changed_at`.

### 1.2 Constraints + Indexes
- [ ] Add unique key on (`week_ending`, `version`) for `shopping_plan`.
- [ ] Add index on `shopping_plan_items(plan_id, category, sort_order)`.
- [ ] Add index on `shopping_plan_classes(plan_id, sort_order)`.

Acceptance
- [ ] Migrations run successfully on local and Render.
- [ ] Rollback path documented.

---

## Phase 2 - Backend API

### 2.1 New Router
- [ ] Create `backend/routes/shopping_plan.js`.
- [ ] Register route in `backend/server.js` as `/api/shopping-plan`.

### 2.2 Endpoints (MVP)
- [ ] `POST /api/shopping-plan/create`
  - Input: `week_ending`, optional selected booking IDs.
  - Behavior: create draft plan + snapshot classes.
- [ ] `POST /api/shopping-plan/:id/generate-draft`
  - Behavior: compute ingredient totals from recipes and servings into `shopping_plan_items.calculated_qty`.
- [ ] `GET /api/shopping-plan/:id`
  - Return: plan header, classes, items, warnings.
- [ ] `PUT /api/shopping-plan/:id/items`
  - Save teacher edits (`teacher_qty`, `base_unit`, `category`, `notes`, add/delete rows).
  - Write audit records for changed fields.
- [ ] `POST /api/shopping-plan/:id/finalize`
  - Compute `final_qty` = `teacher_qty` if present else `calculated_qty`.
  - Lock plan to `status=finalized`.
- [ ] `POST /api/shopping-plan/:id/reopen`
  - Create next version draft copied from finalized plan.
- [ ] `GET /api/shopping-plan/:id/technician-view`
  - Read-only finalized rows, grouped by category.

### 2.3 Validation Rules
- [ ] Block finalize on missing units for quantified lines.
- [ ] Block finalize on invalid qty values (negative, NaN).
- [ ] Warn on high variance vs previous plan version (soft warning only in MVP).

Acceptance
- [ ] Endpoints protected by admin/lead-teacher permissions.
- [ ] Postman or browser test script passes for all endpoint flows.

---

## Phase 3 - Frontend Screens

### 3.1 Weekly Setup Screen
- [ ] Create `backend/public/shopping_plan_setup.html`.
- [ ] Add controls: week ending date, booking selection, generate draft button.
- [ ] Add class snapshot table.

### 3.2 Draft Editor Screen (Core)
- [ ] Create `backend/public/shopping_plan_editor.html`.
- [ ] Group rows by master categories.
- [ ] Columns: category, item, unit, calculated qty, teacher qty, final qty preview, notes, source.
- [ ] Row actions: add, edit, delete, move category.
- [ ] Save Draft and Finalize actions.
- [ ] Show warning panel before finalize.

### 3.3 Technician Screen
- [ ] Create `backend/public/shopping_plan_technician.html`.
- [ ] Read-only finalized list.
- [ ] Print and export buttons.

### 3.4 Navigation
- [ ] Add links in `backend/public/_navbar.html` under Shopping drawer.

Acceptance
- [ ] Full draft-to-finalize-to-technician flow works via UI only.

---

## Phase 4 - Quantity Accuracy Guardrails
- [ ] Add canonical unit conversions for common units (`tsp`, `tbsp`, `g`, `kg`, `ml`, `l`).
- [ ] Add incompatible unit detection and finalize blocker.
- [ ] Add optional safety buffer setting by category.
- [ ] Add missing-recipe-yield warning for classes using incomplete recipes.

Acceptance
- [ ] Test cases show consistent totals for mixed unit inputs.

---

## Phase 5 - Backward Compatibility + Transition
- [ ] Keep current Book Shopping pages intact during MVP rollout.
- [ ] Add banner linking to new Teacher-First flow.
- [ ] Feature flag to switch default shopping workflow after acceptance.

Acceptance
- [ ] No regression on Planner and Add Booking flows.
- [ ] Existing shopping pages still accessible.

---

## Phase 6 - Test Checklist

### Functional
- [ ] Create draft for selected week.
- [ ] Edit teacher quantities and add manual extras.
- [ ] Finalize locks data.
- [ ] Technician view reflects finalized values exactly.
- [ ] Reopen creates a new version and preserves history.

### Accuracy
- [ ] Scaling formula verified for at least 5 recipes with different serving sizes.
- [ ] Duplicate ingredient merge verified across multiple classes.
- [ ] Unit conversion checks pass for tsp/tbsp and g/kg.

### Permissions
- [ ] Non-admin cannot finalize.
- [ ] Technician cannot edit finalized quantities.

### Deployment
- [ ] Render deploy passes.
- [ ] DB migration logs clean.

---

## Tomorrow Start Order (Recommended)
1. Build DB migrations.
2. Build router skeleton + create/get endpoints.
3. Build setup screen and generate draft action.
4. Build editor save/finalize.
5. Build technician read-only output.

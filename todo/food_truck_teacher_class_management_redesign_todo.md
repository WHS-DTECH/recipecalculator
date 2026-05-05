# Food Truck Teacher Class Management Redesign TODO

Goal: Replace the current multi-panel Teacher Calendar List flow with one class-centric table that clearly shows student recipe status and moderation actions.

## Scope (Confirmed)
- [ ] Base workflow on Class Name only (no date-based workflow).
- [ ] Teacher selector should prefer users with Teacher role permission (not full staff list).
- [ ] Class selector should behave like Add Booking class selection.
- [ ] Student list should behave like Add Booking student list.
- [ ] One unified table (not multiple disconnected tables).
- [ ] Show who has recipes, who does not, and who is working in pairs.
- [ ] For students with submitted recipes: provide direct links to student recipe moderation context with Approve/Decline path and source URL access.

Acceptance
- [ ] New page satisfies all points above without reintroducing out-of-context split tables.

---

## Phase 1 - Data + API Foundation

### 1.1 Teacher Role Filter Endpoint
- [ ] Add/verify endpoint returning teachers with Teacher role permission only.
  - Candidate path: `GET /api/user_roles/teachers` or `GET /api/permissions/teachers`.
- [ ] Ensure endpoint returns display name + email + staff ID (if available).

### 1.2 Class-by-Teacher Endpoint
- [ ] Add endpoint to list classes assigned to selected teacher.
  - Input: teacher ID/email.
  - Output: class name list (deduplicated, sorted).
- [ ] Match Add Booking class naming conventions.

### 1.3 Class Students Endpoint
- [ ] Add endpoint returning students for selected class.
  - Input: class name.
  - Output: student ID, student name, class, group/pair markers (if known).

### 1.4 Student Recipe Status Endpoint (Class Scope)
- [ ] Add endpoint that merges class students with recipe submission/moderation status.
  - Input: class name.
  - Output per student:
    - has_recipe (yes/no)
    - recipe_id (if present)
    - recipe_name
    - moderation_status (pending/approved/declined/none)
    - source_url (if present)
    - pair_group_id or partner names (if present)

Acceptance
- [ ] Single API payload can drive one unified table without needing additional client joins.

---

## Phase 2 - New Unified UI Page

### 2.1 Create New Page
- [ ] Create: `backend/public/food_truck_teacher_class_manager.html`.
- [ ] Add page shell + navbar + role checks.

### 2.2 Top Controls (Simple Flow)
- [ ] Teacher dropdown (Teacher role filtered).
- [ ] Class dropdown (based on selected teacher).
- [ ] Load button (or auto-load on class change).
- [ ] No date picker.

### 2.3 One Unified Table
- [ ] Columns (initial proposal):
  - Student
  - Student ID
  - Class
  - Pair / Partner
  - Recipe Submitted
  - Recipe Name
  - Moderation Status
  - Source Link
  - Action
- [ ] Row states:
  - No recipe: clear visual badge + action hint.
  - Pending recipe: quick button to open moderation record.
  - Approved/Declined: show current status and quick open link.
- [ ] Action column:
  - `Review` link to moderation page for that recipe/student.
  - `Open Source` for recipe URL where available.

### 2.4 UX Requirements
- [ ] Keep all class context in this one table.
- [ ] Include summary chips above table:
  - Total students
  - Submitted
  - Not submitted
  - In pairs
  - Pending moderation

Acceptance
- [ ] Teacher can complete full class review without changing to multiple tables/screens.

---

## Phase 3 - Moderation Navigation Integration

### 3.1 Deep Links
- [ ] Add stable deep-link format from table rows to moderation list/detail page.
- [ ] Include student and recipe IDs in query params for direct targeting.

### 3.2 Return Path
- [ ] Add "Back to Class Manager" preserving selected teacher/class.

Acceptance
- [ ] Reviewing a recipe and returning to class list keeps current context.

---

## Phase 4 - Pair Detection and Display

### 4.1 Pair Data Source
- [ ] Confirm where pair/group info is currently stored (booking slots, class roster metadata, or recipe submission metadata).
- [ ] Add backend mapping to emit pair_group_id + partner names.

### 4.2 Table Presentation
- [ ] Show `Solo` or `Pair: Student A + Student B` consistently.
- [ ] Ensure both students in a pair reflect same recipe status where appropriate.

Acceptance
- [ ] Teacher can quickly identify pair work without cross-referencing another panel.

---

## Phase 5 - Permissions + Safety
- [ ] Restrict page access to Teacher/Admin roles.
- [ ] Ensure moderation action links respect existing moderation permissions.
- [ ] Audit logging for approve/decline actions remains unchanged.

Acceptance
- [ ] Unauthorized users cannot access class manager or moderation actions.

---

## Phase 6 - Rollout Strategy
- [ ] Keep existing `teacher_booking_slots.html` untouched during initial rollout.
- [ ] Add new nav link as "FT Class Manager (New)" under FT Teacher drawer.
- [ ] Pilot with one or two teachers, then switch default.

Acceptance
- [ ] No disruption to student recipe add flow or moderation list flow already working.

---

## Test Checklist

### Functional
- [ ] Teacher list only includes teacher-role users.
- [ ] Class list updates correctly when teacher changes.
- [ ] Class table loads all students for selected class.
- [ ] Recipe status accurately reflects submitted/not submitted.
- [ ] Moderation status reflects current DB state.
- [ ] Source links open correctly.

### Pair Handling
- [ ] Pair rows display correctly for both students.
- [ ] Solo rows display correctly.

### Navigation
- [ ] Review link opens correct moderation item.
- [ ] Back navigation returns to same teacher/class context.

### Permissions
- [ ] Non-teacher users blocked.
- [ ] Teacher/admin users allowed.

---

## Tomorrow Start Order (Recommended)
1. Build teacher-role filtered endpoint.
2. Build class + student + recipe-status combined endpoint.
3. Build new unified page with single table and summary chips.
4. Add deep-links to moderation detail and source URL.
5. Add FT drawer link as "FT Class Manager (New)".

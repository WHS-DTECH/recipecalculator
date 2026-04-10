# Navigation Audit & Redesign Proposal

## Current Structure Issues
- **Admin dropdown is overcrowded**: 30+ items in a single dropdown makes it hard to find anything.
- **Mixed user roles**: Teachers see "Admin" section with many items they'll never use.
- **Unclear task grouping**: Items are loosely categorized with disabled headers; no clear "where do I go to do X" flow.
- **Action vs. Management confusion**: Core workflows (Quick Add, Book) mixed with admin setup tasks.

## Proposed Structure

### Navigation Organization by Role

#### For All Users (Core Tasks)
```
Food Room Inventory [Home]
├─ Add Recipe
├─ Add Booking
├─ Book the Shopping
└─ Book a Class
```
**Rationale**: These are the primary teacher/staff workflows; always visible, always action-focused.

#### For Admin Users (Management)
```
Management ▼
├─ Recipes
│  ├─ Quick Add Recipe
│  ├─ Recipe Setup
│  ├─ Recipe Extraction
│  └─ Publish Recipes
├─ Ingredients & Catering
│  ├─ Ingredients Directory
│  ├─ Load Aisle Categories
│  ├─ Load Food Brands
│  └─ Load Aisle Keywords
├─ Staff & Classes
│  ├─ Upload Staff
│  ├─ Upload Timetable
│  ├─ Upload Classes
│  └─ Upload Students
└─ Settings
   ├─ User Roles
   ├─ Permissions
   └─ Department
```
**Rationale**: Grouped by setup domain, reducing cognitive load; admin-only items hidden from regular users.

#### Account Area (Top-Right)
```
[Username] ▼
├─ Profile
└─ Logout
```
**Rationale**: Standard user account pattern; prepares for Google login integration.

## Implementation Plan

### Step 1: Hide Admin Items from Non-Admin Users
- Check user role in navbar_user.js and conditionally render admin dropdown.

### Step 2: Restructure Admin Dropdown
- Create nested menu structure with clear category headers (non-disabled, styled as category labels).
- Use CSS to visually group nested items (left padding, lighter background for parent items).

### Step 3: Add Visual States
- **Active page indicator**: Highlight the current page in the nav.
- **Focus ring**: Visible outline when tabbing through menu items (accessibility).
- **Hover states**: Subtle background change to indicate interactive elements.

### Step 4: Mobile Responsiveness
- On small screens, stack menu items vertically.
- Keep core tasks always visible; collapse admin section into "more" button if needed.

## Navigation Label Refinements
| Current | Proposed | Reason |
|---------|----------|--------|
| "Quick Add Recipe" | "Quick Add Recipe" | Clear but in wrong spot; move to core tasks |
| "Calculate Servings" | Move to Recipe Setup submenu | Not a standalone primary task |
| "Suggest a Recipe" | Under Settings or hidden | Low-priority feature for future |
| "Upload SetupSubjects" | "Upload Classes" | More intuitive for school context |
| "Calculate Qty" | Move to Ingredients submenu | Advanced ingredient management |

## Accessibility Improvements
- Use semantic HTML for dropdown (role="menu", aria-expanded, keyboard arrow support).
- Ensure all items are keyboard-accessible (Tab, Arrow keys, Enter to navigate).
- Visible focus outline (already in base.css).
- Color contrast for active/hover states (verify with design token colors).

## Future: Google Integration
Reserve top-right corner for:
- Google login state (signed in / signed out)
- Calendar sync status indicator
- Quick access to linked Google account options

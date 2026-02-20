# API & Data Structures

## Endpoints (suggested)

- `GET /api/bookings` — List all bookings
- `POST /api/bookings` — Create a new booking
- `GET /api/catering-grid` — Get catering grid data
- `GET /api/class-ingredients` — Get recipes and scheduled bookings
- `GET /api/shoplist` — Get selected bookings, shopping list, and master shopping list
- `GET /api/permissions` — Get roles and permissions
- `GET /api/user-roles` — Get user roles
- `GET /api/staff` — Get staff list
- `GET /api/recipes` — Get all recipes
- `GET /api/suggestions` — Get all recipe suggestions
- `POST /api/suggestions` — Submit a new suggestion
- `GET /api/upload-confirm` — Get recipe titles for upload confirmation
- `GET /api/ingredient-extractor` — Get ingredient extraction strategies/results

## Data Structures (examples)

### Booking
```json
{
  "date": "2026-01-30",
  "period": 1,
  "staff": "Maryke Diplock",
  "class": "300HOSP",
  "size": 4,
  "recipe": "Lemon Curd Muffins Recipe | Chelsea Sugar"
}
```

### Recipe
```json
{
  "name": "Apple and Sultana Crumble",
  "ingredients": ["80.0 plain flour", "60.0 butter or margarine", ...]
}
```

### Suggestion
```json
{
  "date": "2026-01-25",
  "name": "Pavlova",
  "by": "Maryke Diplock",
  "email": "marykediplock@westlandhigh.school.nz",
  "url": "",
  "reason": "T4 - 300Hospo"
}
```

### Permissions/Role
```json
{
  "name": "Admin",
  "permissions": [true, true, true, true, true, true]
}
```

---

Update this file as backend endpoints and data contracts are finalized.

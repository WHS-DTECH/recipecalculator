-- Migration: Create desired_servings_ingredients table
CREATE TABLE IF NOT EXISTS desired_servings_ingredients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER,
    teacher TEXT,
    class_name TEXT,
    class_date TEXT,
    class_size INTEGER,
    groups INTEGER,
    desired_servings INTEGER,
    ingredient_id INTEGER,
    ingredient_name TEXT,
    measure_qty TEXT,
    measure_unit TEXT,
    fooditem TEXT,
    calculated_qty TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

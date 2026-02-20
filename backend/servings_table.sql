-- Table to store user desired servings for each booking/recipe
CREATE TABLE IF NOT EXISTS servings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER,
    recipe_id INTEGER,
    user_id TEXT, -- or staff_id if you want to track by user
    desired_servings INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(booking_id) REFERENCES bookings(id),
    FOREIGN KEY(recipe_id) REFERENCES recipes(id)
);
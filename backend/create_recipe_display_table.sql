-- Create recipe_display table with all fields from recipes except UploadedRecipeID, Raw Data Table, Extracted Instructions
CREATE TABLE IF NOT EXISTS recipe_display (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    description TEXT,
    ingredients TEXT,
    serving_size INTEGER,
    url TEXT,
    instructions TEXT
);
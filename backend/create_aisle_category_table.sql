-- Migration: Create aisle_category table
CREATE TABLE IF NOT EXISTS aisle_category (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    sort_order INTEGER DEFAULT 0
);

-- Example inserts
INSERT INTO aisle_category (name, sort_order) VALUES ('Produce', 1);
INSERT INTO aisle_category (name, sort_order) VALUES ('Dairy', 2);
INSERT INTO aisle_category (name, sort_order) VALUES ('Pantry', 3);
INSERT INTO aisle_category (name, sort_order) VALUES ('Other', 4);

-- To link to ingredients, add a column to your ingredients table:
-- ALTER TABLE ingredients_inventory ADD COLUMN aisle_category_id INTEGER REFERENCES aisle_category(id);

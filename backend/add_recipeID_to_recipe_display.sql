-- Migration: Add recipeID foreign key to recipe_display table
ALTER TABLE recipe_display ADD COLUMN recipeID INTEGER;
-- Optionally, add a foreign key constraint if supported by SQLite version
-- ALTER TABLE recipe_display ADD CONSTRAINT fk_recipeID FOREIGN KEY (recipeID) REFERENCES recipes(id);
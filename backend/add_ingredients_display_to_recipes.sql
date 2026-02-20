-- Add Ingredients_display column to recipes table and copy data from ingredients
ALTER TABLE recipes ADD COLUMN Ingredients_display TEXT;
UPDATE recipes SET Ingredients_display = ingredients;
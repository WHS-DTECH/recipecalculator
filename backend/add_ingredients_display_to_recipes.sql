-- Add Ingredients_display column to recipes table and copy data from ingredients
ALTER TABLE recipes ADD COLUMN ingredients_display TEXT;
UPDATE recipes SET ingredients_display = ingredients;
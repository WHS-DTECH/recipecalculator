-- Migration: Add recipe_id column to desired_servings_ingredients if it doesn't exist
ALTER TABLE desired_servings_ingredients ADD COLUMN recipe_id INTEGER;

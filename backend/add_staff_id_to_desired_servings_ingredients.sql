-- Migration: Add staff_id to desired_servings_ingredients
ALTER TABLE desired_servings_ingredients
ADD COLUMN staff_id INTEGER REFERENCES Staff_upload(ID);
-- Add recipe_id column to bookings table if it does not exist
ALTER TABLE bookings ADD COLUMN recipe_id INTEGER;
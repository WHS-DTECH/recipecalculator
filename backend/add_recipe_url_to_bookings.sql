-- Add recipe_url column to bookings table if it doesn't exist
ALTER TABLE bookings ADD COLUMN recipe_url TEXT DEFAULT '';

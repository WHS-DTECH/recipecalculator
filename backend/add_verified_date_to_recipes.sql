-- Add verified_date column to recipes table to track when ingredients were verified
ALTER TABLE recipes ADD COLUMN verified_date TIMESTAMP;
-- Set verified_date to current time for all existing recipes that have ingredients_display
UPDATE recipes SET verified_date = CURRENT_TIMESTAMP WHERE ingredients_display IS NOT NULL AND ingredients_display != '';

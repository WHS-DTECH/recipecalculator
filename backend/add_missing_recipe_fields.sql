-- Migration: Add missing columns to recipes table for extractor and display features
ALTER TABLE recipes
  ADD COLUMN instructions TEXT,
  ADD COLUMN instructions_extracted TEXT,
  ADD COLUMN ingredients_display TEXT,
  ADD COLUMN extracted_ingredients TEXT,
  ADD COLUMN extracted_serving_size TEXT,
  ADD COLUMN extracted_instructions TEXT;
-- You may need to adjust column types or names based on frontend expectations.
-- Run this migration in your Postgres database to enable all extractor features.
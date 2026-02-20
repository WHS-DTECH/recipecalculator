-- Remove the unused 'instructions' column from the recipes table
-- SQLite does not support DROP COLUMN directly, so we recreate the table

BEGIN TRANSACTION;

CREATE TABLE recipes_new AS SELECT id, uploaded_recipe_id, name, description, ingredients, serving_size, url, instructions_extracted FROM recipes;

DROP TABLE recipes;

ALTER TABLE recipes_new RENAME TO recipes;

COMMIT;

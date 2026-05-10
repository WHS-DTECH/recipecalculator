CREATE TABLE IF NOT EXISTS shopping_routine_extras (
  id SERIAL PRIMARY KEY,
  category TEXT NOT NULL DEFAULT 'Other',
  item_text TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by_email TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO shopping_routine_extras (category, item_text, sort_order, created_by_email)
SELECT se.category, se.item_text, se.sort_order, se.created_by_email
FROM shopping_extras se
WHERE se.is_standing = TRUE
  AND NOT EXISTS (SELECT 1 FROM shopping_routine_extras);

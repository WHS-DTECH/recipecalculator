-- Migration: Teacher-First Shopping Plan tables
-- Run once via: node backend/run_shopping_plan_migration.js
-- Neon Postgres target

-- -------------------------------------------------------
-- shopping_plan
-- One row per week/version. week_ending is always a Friday.
-- status: 'draft' | 'finalized'
-- version: 1 on first create, increments on each reopen.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS shopping_plan (
  id              SERIAL PRIMARY KEY,
  week_ending     DATE        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft', 'finalized')),
  version         INTEGER     NOT NULL DEFAULT 1,
  created_by      TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalized_by    TEXT,
  finalized_at    TIMESTAMPTZ,
  notes           TEXT,
  UNIQUE (week_ending, version)
);

-- -------------------------------------------------------
-- shopping_plan_classes
-- Snapshot of which classes (bookings) are in the plan.
-- booking_id / recipe_id may be nullable to survive deletes.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS shopping_plan_classes (
  id               SERIAL PRIMARY KEY,
  plan_id          INTEGER     NOT NULL REFERENCES shopping_plan(id) ON DELETE CASCADE,
  booking_id       INTEGER     REFERENCES bookings(id) ON DELETE SET NULL,
  class_name       TEXT        NOT NULL,
  teacher_name     TEXT,
  recipe_id        INTEGER     REFERENCES recipes(id) ON DELETE SET NULL,
  planned_servings INTEGER,
  included         BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order       INTEGER     NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_spc_plan_sort
  ON shopping_plan_classes (plan_id, sort_order);

-- -------------------------------------------------------
-- shopping_plan_items
-- One row per ingredient line.
-- final_qty = teacher_qty if set, else calculated_qty.
-- (Computed at finalize time and stored for the read-only view.)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS shopping_plan_items (
  id                   SERIAL PRIMARY KEY,
  plan_id              INTEGER        NOT NULL REFERENCES shopping_plan(id) ON DELETE CASCADE,
  category             TEXT           NOT NULL DEFAULT 'Uncategorised',
  item_name            TEXT           NOT NULL,
  normalized_item_key  TEXT,
  base_unit            TEXT,
  calculated_qty       NUMERIC(10, 4),
  teacher_qty          NUMERIC(10, 4),
  final_qty            NUMERIC(10, 4),
  source_type          TEXT,           -- e.g. 'recipe_scale' | 'manual'
  source_detail_json   JSONB,          -- recipe/class breakdown for transparency
  notes                TEXT,
  sort_order           INTEGER        NOT NULL DEFAULT 0,
  edited_by            TEXT,
  edited_at            TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_spi_plan_cat_sort
  ON shopping_plan_items (plan_id, category, sort_order);

-- -------------------------------------------------------
-- shopping_plan_item_audit
-- Records every field-level change to a shopping_plan_items row.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS shopping_plan_item_audit (
  id            SERIAL PRIMARY KEY,
  plan_item_id  INTEGER     NOT NULL REFERENCES shopping_plan_items(id) ON DELETE CASCADE,
  field_name    TEXT        NOT NULL,
  old_value     TEXT,
  new_value     TEXT,
  reason        TEXT,
  changed_by    TEXT        NOT NULL,
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spia_plan_item
  ON shopping_plan_item_audit (plan_item_id, changed_at);

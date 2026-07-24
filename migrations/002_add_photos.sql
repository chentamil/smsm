-- Adds multi-image support. Existing `photo` column is kept as a fallback
-- for any product that was created before this migration.
ALTER TABLE products ADD COLUMN photos_json TEXT;

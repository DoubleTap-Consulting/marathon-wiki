-- loaded_at was TIMESTAMP (without time zone). Readers that parse such values in their own zone
-- showed the load 6 hours late (03:23Z for a 21:23Z load, read from America/Chicago).
-- Existing values were written with the database session in GMT, so they are UTC.
ALTER TABLE "content_load_records"
  ALTER COLUMN "loaded_at" TYPE TIMESTAMPTZ(3) USING "loaded_at" AT TIME ZONE 'UTC';

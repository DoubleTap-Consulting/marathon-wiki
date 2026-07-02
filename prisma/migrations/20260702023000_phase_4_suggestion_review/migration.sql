ALTER TABLE "wiki_suggestions"
  ADD COLUMN "target_slug" TEXT,
  ADD COLUMN "summary" TEXT,
  ADD COLUMN "review_note" TEXT;

UPDATE "wiki_suggestions" AS suggestion
SET "target_slug" = COALESCE(page."slug", lower(regexp_replace(suggestion."title", '[^a-zA-Z0-9]+', '-', 'g')))
FROM "wiki_pages" AS page
WHERE suggestion."page_id" = page."id"
  AND suggestion."tenant_id" = page."tenant_id"
  AND suggestion."target_slug" IS NULL;

UPDATE "wiki_suggestions"
SET "target_slug" = trim(both '-' from COALESCE("target_slug", lower(regexp_replace("title", '[^a-zA-Z0-9]+', '-', 'g'))))
WHERE "target_slug" IS NULL OR "target_slug" = '';

ALTER TABLE "wiki_suggestions"
  ALTER COLUMN "target_slug" SET NOT NULL;

CREATE INDEX "wiki_suggestions_tenant_id_target_slug_idx" ON "wiki_suggestions"("tenant_id", "target_slug");

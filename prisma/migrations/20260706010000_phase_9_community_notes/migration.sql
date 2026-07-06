CREATE TABLE "wiki_community_notes" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "page_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "note_type" TEXT NOT NULL DEFAULT 'general',
  "body_markdown" TEXT NOT NULL,
  "source_url" TEXT,
  "target_quote" TEXT,
  "review_note" TEXT,
  "metadata" JSONB,
  "created_by" TEXT,
  "reviewed_by" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "wiki_community_notes_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "wiki_community_notes"
  ADD CONSTRAINT "wiki_community_notes_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "wiki_community_notes"
  ADD CONSTRAINT "wiki_community_notes_page_id_fkey"
  FOREIGN KEY ("page_id") REFERENCES "wiki_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "wiki_community_notes_tenant_id_status_idx"
  ON "wiki_community_notes"("tenant_id", "status");

CREATE INDEX "wiki_community_notes_tenant_id_page_id_idx"
  ON "wiki_community_notes"("tenant_id", "page_id");

CREATE INDEX "wiki_community_notes_tenant_id_page_id_status_idx"
  ON "wiki_community_notes"("tenant_id", "page_id", "status");

CREATE INDEX "wiki_community_notes_tenant_id_created_by_idx"
  ON "wiki_community_notes"("tenant_id", "created_by");

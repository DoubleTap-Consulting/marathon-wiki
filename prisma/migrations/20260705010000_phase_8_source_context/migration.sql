ALTER TABLE "wiki_sources"
  ADD COLUMN "source_key" TEXT,
  ADD COLUMN "context_text" TEXT,
  ADD COLUMN "topic_slugs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE UNIQUE INDEX "wiki_sources_tenant_id_source_key_key"
  ON "wiki_sources" ("tenant_id", "source_key");

CREATE INDEX "wiki_sources_tenant_id_source_type_idx"
  ON "wiki_sources" ("tenant_id", "source_type");

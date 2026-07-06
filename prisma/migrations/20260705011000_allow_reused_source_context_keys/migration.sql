DROP INDEX IF EXISTS "wiki_sources_tenant_id_source_key_key";

CREATE INDEX "wiki_sources_tenant_id_source_key_idx"
  ON "wiki_sources" ("tenant_id", "source_key");

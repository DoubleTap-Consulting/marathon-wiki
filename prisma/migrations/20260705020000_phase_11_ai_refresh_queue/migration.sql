CREATE TABLE "ai_refresh_queue_items" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "page_id" TEXT,
  "target_slug" TEXT NOT NULL,
  "page_title" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "scheduled_for" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "dedupe_key" TEXT NOT NULL,
  "last_error" TEXT,
  "error_metadata" JSONB,
  "metadata" JSONB,
  "processed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ai_refresh_queue_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_refresh_queue_items_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ai_refresh_queue_items_page_id_fkey"
    FOREIGN KEY ("page_id") REFERENCES "wiki_pages"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ai_refresh_queue_items_dedupe_key_key"
  ON "ai_refresh_queue_items" ("dedupe_key");

CREATE INDEX "ai_refresh_queue_items_status_scheduled_for_idx"
  ON "ai_refresh_queue_items" ("status", "scheduled_for");

CREATE INDEX "ai_refresh_queue_items_tenant_id_status_scheduled_for_idx"
  ON "ai_refresh_queue_items" ("tenant_id", "status", "scheduled_for");

CREATE INDEX "ai_refresh_queue_items_tenant_id_target_slug_idx"
  ON "ai_refresh_queue_items" ("tenant_id", "target_slug");

CREATE INDEX "ai_refresh_queue_items_source_scheduled_for_idx"
  ON "ai_refresh_queue_items" ("source", "scheduled_for");

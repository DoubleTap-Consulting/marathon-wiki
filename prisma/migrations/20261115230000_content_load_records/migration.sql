-- One row per one-time content load. The unique load_key is what blocks a second run.
CREATE TABLE "content_load_records" (
    "id" TEXT NOT NULL,
    "load_key" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "file_sha256" TEXT NOT NULL,
    "page_count" INTEGER NOT NULL,
    "published_count" INTEGER NOT NULL DEFAULT 0,
    "review_count" INTEGER NOT NULL DEFAULT 0,
    "target" TEXT NOT NULL,
    "loaded_by" TEXT NOT NULL,
    "loaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_load_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "content_load_records_load_key_key" ON "content_load_records"("load_key");

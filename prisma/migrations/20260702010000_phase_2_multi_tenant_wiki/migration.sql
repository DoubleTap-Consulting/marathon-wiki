CREATE TABLE "games" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "franchise" TEXT,
  "developer" TEXT,
  "publisher" TEXT,
  "release_date" TIMESTAMP(3),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tenants" (
  "id" TEXT NOT NULL,
  "game_id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "primary_locale" TEXT NOT NULL DEFAULT 'en',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "wiki_pages" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "body_markdown" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "latest_revision_number" INTEGER NOT NULL DEFAULT 1,
  "created_by" TEXT,
  "updated_by" TEXT,
  "published_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "wiki_pages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "wiki_page_revisions" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "page_id" TEXT NOT NULL,
  "revision_number" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "body_markdown" TEXT NOT NULL,
  "change_note" TEXT,
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "wiki_page_revisions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "wiki_sources" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "page_id" TEXT,
  "revision_id" TEXT,
  "source_type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "url" TEXT,
  "publisher" TEXT,
  "retrieved_at" TIMESTAMP(3),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "wiki_sources_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "wiki_categories" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "wiki_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "wiki_tags" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "wiki_tags_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "wiki_page_categories" (
  "tenant_id" TEXT NOT NULL,
  "page_id" TEXT NOT NULL,
  "category_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "wiki_page_categories_pkey" PRIMARY KEY ("tenant_id","page_id","category_id")
);

CREATE TABLE "wiki_page_tags" (
  "tenant_id" TEXT NOT NULL,
  "page_id" TEXT NOT NULL,
  "tag_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "wiki_page_tags_pkey" PRIMARY KEY ("tenant_id","page_id","tag_id")
);

CREATE TABLE "wiki_suggestions" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "page_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'new',
  "suggestion_type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body_markdown" TEXT NOT NULL,
  "source_url" TEXT,
  "metadata" JSONB,
  "created_by" TEXT,
  "reviewed_by" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "wiki_suggestions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "games_slug_key" ON "games"("slug");
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");
CREATE INDEX "tenants_game_id_idx" ON "tenants"("game_id");
CREATE UNIQUE INDEX "wiki_pages_tenant_id_slug_key" ON "wiki_pages"("tenant_id","slug");
CREATE INDEX "wiki_pages_tenant_id_status_idx" ON "wiki_pages"("tenant_id","status");
CREATE UNIQUE INDEX "wiki_page_revisions_tenant_id_page_id_revision_number_key" ON "wiki_page_revisions"("tenant_id","page_id","revision_number");
CREATE INDEX "wiki_page_revisions_tenant_id_page_id_idx" ON "wiki_page_revisions"("tenant_id","page_id");
CREATE INDEX "wiki_sources_tenant_id_page_id_idx" ON "wiki_sources"("tenant_id","page_id");
CREATE INDEX "wiki_sources_tenant_id_revision_id_idx" ON "wiki_sources"("tenant_id","revision_id");
CREATE UNIQUE INDEX "wiki_categories_tenant_id_slug_key" ON "wiki_categories"("tenant_id","slug");
CREATE INDEX "wiki_categories_tenant_id_sort_order_idx" ON "wiki_categories"("tenant_id","sort_order");
CREATE UNIQUE INDEX "wiki_tags_tenant_id_slug_key" ON "wiki_tags"("tenant_id","slug");
CREATE INDEX "wiki_page_categories_tenant_id_category_id_idx" ON "wiki_page_categories"("tenant_id","category_id");
CREATE INDEX "wiki_page_tags_tenant_id_tag_id_idx" ON "wiki_page_tags"("tenant_id","tag_id");
CREATE INDEX "wiki_suggestions_tenant_id_status_idx" ON "wiki_suggestions"("tenant_id","status");
CREATE INDEX "wiki_suggestions_tenant_id_page_id_idx" ON "wiki_suggestions"("tenant_id","page_id");

ALTER TABLE "tenants" ADD CONSTRAINT "tenants_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "wiki_pages" ADD CONSTRAINT "wiki_pages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wiki_page_revisions" ADD CONSTRAINT "wiki_page_revisions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wiki_page_revisions" ADD CONSTRAINT "wiki_page_revisions_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "wiki_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wiki_sources" ADD CONSTRAINT "wiki_sources_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wiki_sources" ADD CONSTRAINT "wiki_sources_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "wiki_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wiki_sources" ADD CONSTRAINT "wiki_sources_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "wiki_page_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "wiki_categories" ADD CONSTRAINT "wiki_categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wiki_tags" ADD CONSTRAINT "wiki_tags_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wiki_page_categories" ADD CONSTRAINT "wiki_page_categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wiki_page_categories" ADD CONSTRAINT "wiki_page_categories_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "wiki_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wiki_page_categories" ADD CONSTRAINT "wiki_page_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "wiki_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wiki_page_tags" ADD CONSTRAINT "wiki_page_tags_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wiki_page_tags" ADD CONSTRAINT "wiki_page_tags_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "wiki_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wiki_page_tags" ADD CONSTRAINT "wiki_page_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "wiki_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wiki_suggestions" ADD CONSTRAINT "wiki_suggestions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wiki_suggestions" ADD CONSTRAINT "wiki_suggestions_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "wiki_pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

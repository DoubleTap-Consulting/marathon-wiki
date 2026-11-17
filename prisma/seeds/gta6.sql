INSERT INTO "games" (
  "id",
  "slug",
  "title",
  "franchise",
  "developer",
  "publisher",
  "release_date",
  "metadata"
)
VALUES (
  'game_gta6',
  'gta6',
  'Grand Theft Auto VI',
  'Grand Theft Auto',
  'Rockstar Games',
  'Rockstar Games',
  TIMESTAMPTZ '2026-11-19 00:00:00+00',
  '{"seed":"gta6-starter","genres":["action-adventure","open world"]}'::jsonb
)
ON CONFLICT ("slug") DO UPDATE SET
  "title" = EXCLUDED."title",
  "franchise" = EXCLUDED."franchise",
  "developer" = EXCLUDED."developer",
  "publisher" = EXCLUDED."publisher",
  "release_date" = EXCLUDED."release_date",
  "metadata" = EXCLUDED."metadata",
  "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "tenants" (
  "id",
  "game_id",
  "slug",
  "name",
  "status",
  "primary_locale"
)
VALUES (
  'tenant_gta6',
  'game_gta6',
  'gta6',
  'Grand Theft Auto VI',
  'active',
  'en'
)
ON CONFLICT ("slug") DO UPDATE SET
  "game_id" = EXCLUDED."game_id",
  "name" = EXCLUDED."name",
  "status" = EXCLUDED."status",
  "primary_locale" = EXCLUDED."primary_locale",
  "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "wiki_categories" (
  "id",
  "tenant_id",
  "slug",
  "name",
  "description",
  "sort_order"
)
VALUES
  ('category_gta6_overview', 'tenant_gta6', 'overview', 'Overview', 'Release date, platforms, editions, and buying information.', 10),
  ('category_gta6_gameplay', 'tenant_gta6', 'gameplay', 'Gameplay', 'Officially described features, trailers, music, and platform notes.', 20),
  ('category_gta6_lore', 'tenant_gta6', 'lore', 'Story and characters', 'The official premise and characters Rockstar has introduced.', 30),
  ('category_gta6_locations', 'tenant_gta6', 'locations', 'Locations', 'Leonida, Vice City, and other places official sources have named.', 40)
ON CONFLICT ("tenant_id", "slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "sort_order" = EXCLUDED."sort_order",
  "updated_at" = CURRENT_TIMESTAMP;

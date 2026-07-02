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
  'game_marathon',
  'marathon',
  'Marathon',
  'Marathon',
  'Bungie',
  'Bungie',
  NULL,
  '{"seed":"phase-2","genres":["extraction shooter","sci-fi"]}'::jsonb
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
  'tenant_marathon',
  'game_marathon',
  'marathon',
  'Marathon Wiki',
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
  ('category_overview', 'tenant_marathon', 'overview', 'Overview', 'Core landing and orientation pages for the Marathon wiki.', 10),
  ('category_gameplay', 'tenant_marathon', 'gameplay', 'Gameplay', 'Systems, modes, and player-facing mechanics.', 20),
  ('category_lore', 'tenant_marathon', 'lore', 'Lore', 'Story, setting, factions, and world context.', 30),
  ('category_equipment', 'tenant_marathon', 'equipment', 'Equipment', 'Weapons, gear, and loadout-focused pages.', 40),
  ('category_locations', 'tenant_marathon', 'locations', 'Locations', 'Maps, points of interest, and world spaces.', 50)
ON CONFLICT ("tenant_id", "slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "sort_order" = EXCLUDED."sort_order",
  "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "wiki_tags" (
  "id",
  "tenant_id",
  "slug",
  "name",
  "description"
)
VALUES
  ('tag_starter', 'tenant_marathon', 'starter', 'Starter', 'Seeded starter pages for the first tenant.'),
  ('tag_canon', 'tenant_marathon', 'canon', 'Canon', 'Pages intended to track official game information.'),
  ('tag_live-service', 'tenant_marathon', 'live-service', 'Live Service', 'Pages likely to change as the game evolves.')
ON CONFLICT ("tenant_id", "slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "wiki_pages" (
  "id",
  "tenant_id",
  "slug",
  "title",
  "summary",
  "body_markdown",
  "status",
  "latest_revision_number",
  "created_by",
  "updated_by",
  "published_at"
)
VALUES
  (
    'page_marathon_overview',
    'tenant_marathon',
    'overview',
    'Marathon Overview',
    'A starter overview of Marathon and the purpose of this wiki.',
    'Marathon is a sci-fi extraction shooter from Bungie. This wiki tracks durable game knowledge for players, including gameplay systems, factions, equipment, and locations.',
    'published',
    1,
    'phase-2-seed',
    'phase-2-seed',
    CURRENT_TIMESTAMP
  ),
  (
    'page_marathon_gameplay',
    'tenant_marathon',
    'gameplay',
    'Gameplay',
    'A high-level reference for Marathon gameplay systems.',
    'Gameplay pages should explain the player loop, extraction rules, team structure, objectives, progression hooks, and recurring systems as official details become available.',
    'published',
    1,
    'phase-2-seed',
    'phase-2-seed',
    CURRENT_TIMESTAMP
  ),
  (
    'page_marathon_factions',
    'tenant_marathon',
    'factions',
    'Factions',
    'Starter page for Marathon factions and organizations.',
    'Faction pages should capture official names, motives, relationships, and any gameplay implications tied to Marathon''s setting.',
    'published',
    1,
    'phase-2-seed',
    'phase-2-seed',
    CURRENT_TIMESTAMP
  ),
  (
    'page_marathon_weapons',
    'tenant_marathon',
    'weapons',
    'Weapons',
    'Starter page for weapons and equipment references.',
    'Weapon pages should track archetypes, known names, damage behavior, perks, acquisition, and patch-sensitive changes when confirmed.',
    'published',
    1,
    'phase-2-seed',
    'phase-2-seed',
    CURRENT_TIMESTAMP
  ),
  (
    'page_marathon_locations',
    'tenant_marathon',
    'locations',
    'Locations',
    'Starter page for Marathon maps and points of interest.',
    'Location pages should organize maps, named points of interest, extraction zones, environmental hazards, and discovered routes.',
    'published',
    1,
    'phase-2-seed',
    'phase-2-seed',
    CURRENT_TIMESTAMP
  )
ON CONFLICT ("tenant_id", "slug") DO UPDATE SET
  "title" = EXCLUDED."title",
  "summary" = EXCLUDED."summary",
  "body_markdown" = EXCLUDED."body_markdown",
  "status" = EXCLUDED."status",
  "latest_revision_number" = EXCLUDED."latest_revision_number",
  "updated_by" = EXCLUDED."updated_by",
  "published_at" = COALESCE("wiki_pages"."published_at", EXCLUDED."published_at"),
  "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "wiki_page_revisions" (
  "id",
  "tenant_id",
  "page_id",
  "revision_number",
  "title",
  "summary",
  "body_markdown",
  "change_note",
  "created_by"
)
VALUES
  (
    'revision_marathon_overview_1',
    'tenant_marathon',
    'page_marathon_overview',
    1,
    'Marathon Overview',
    'A starter overview of Marathon and the purpose of this wiki.',
    'Marathon is a sci-fi extraction shooter from Bungie. This wiki tracks durable game knowledge for players, including gameplay systems, factions, equipment, and locations.',
    'Initial seeded overview page.',
    'phase-2-seed'
  ),
  (
    'revision_marathon_gameplay_1',
    'tenant_marathon',
    'page_marathon_gameplay',
    1,
    'Gameplay',
    'A high-level reference for Marathon gameplay systems.',
    'Gameplay pages should explain the player loop, extraction rules, team structure, objectives, progression hooks, and recurring systems as official details become available.',
    'Initial seeded gameplay page.',
    'phase-2-seed'
  ),
  (
    'revision_marathon_factions_1',
    'tenant_marathon',
    'page_marathon_factions',
    1,
    'Factions',
    'Starter page for Marathon factions and organizations.',
    'Faction pages should capture official names, motives, relationships, and any gameplay implications tied to Marathon''s setting.',
    'Initial seeded factions page.',
    'phase-2-seed'
  ),
  (
    'revision_marathon_weapons_1',
    'tenant_marathon',
    'page_marathon_weapons',
    1,
    'Weapons',
    'Starter page for weapons and equipment references.',
    'Weapon pages should track archetypes, known names, damage behavior, perks, acquisition, and patch-sensitive changes when confirmed.',
    'Initial seeded weapons page.',
    'phase-2-seed'
  ),
  (
    'revision_marathon_locations_1',
    'tenant_marathon',
    'page_marathon_locations',
    1,
    'Locations',
    'Starter page for Marathon maps and points of interest.',
    'Location pages should organize maps, named points of interest, extraction zones, environmental hazards, and discovered routes.',
    'Initial seeded locations page.',
    'phase-2-seed'
  )
ON CONFLICT ("tenant_id", "page_id", "revision_number") DO UPDATE SET
  "title" = EXCLUDED."title",
  "summary" = EXCLUDED."summary",
  "body_markdown" = EXCLUDED."body_markdown",
  "change_note" = EXCLUDED."change_note";

INSERT INTO "wiki_sources" (
  "id",
  "tenant_id",
  "page_id",
  "revision_id",
  "source_type",
  "title",
  "url",
  "publisher",
  "metadata"
)
VALUES
  (
    'source_marathon_official_site',
    'tenant_marathon',
    'page_marathon_overview',
    'revision_marathon_overview_1',
    'official',
    'Official Marathon site',
    'https://www.marathonthegame.com/',
    'Bungie',
    '{"seed":"phase-2"}'::jsonb
  ),
  (
    'source_marathon_bungie_page',
    'tenant_marathon',
    'page_marathon_overview',
    'revision_marathon_overview_1',
    'official',
    'Marathon at Bungie',
    'https://www.bungie.net/7/en/Marathon',
    'Bungie',
    '{"seed":"phase-2"}'::jsonb
  )
ON CONFLICT ("id") DO UPDATE SET
  "page_id" = EXCLUDED."page_id",
  "revision_id" = EXCLUDED."revision_id",
  "source_type" = EXCLUDED."source_type",
  "title" = EXCLUDED."title",
  "url" = EXCLUDED."url",
  "publisher" = EXCLUDED."publisher",
  "metadata" = EXCLUDED."metadata",
  "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "wiki_page_categories" ("tenant_id", "page_id", "category_id")
VALUES
  ('tenant_marathon', 'page_marathon_overview', 'category_overview'),
  ('tenant_marathon', 'page_marathon_gameplay', 'category_gameplay'),
  ('tenant_marathon', 'page_marathon_factions', 'category_lore'),
  ('tenant_marathon', 'page_marathon_weapons', 'category_equipment'),
  ('tenant_marathon', 'page_marathon_locations', 'category_locations')
ON CONFLICT ("tenant_id", "page_id", "category_id") DO NOTHING;

INSERT INTO "wiki_page_tags" ("tenant_id", "page_id", "tag_id")
VALUES
  ('tenant_marathon', 'page_marathon_overview', 'tag_starter'),
  ('tenant_marathon', 'page_marathon_overview', 'tag_canon'),
  ('tenant_marathon', 'page_marathon_gameplay', 'tag_starter'),
  ('tenant_marathon', 'page_marathon_gameplay', 'tag_live-service'),
  ('tenant_marathon', 'page_marathon_factions', 'tag_starter'),
  ('tenant_marathon', 'page_marathon_weapons', 'tag_starter'),
  ('tenant_marathon', 'page_marathon_weapons', 'tag_live-service'),
  ('tenant_marathon', 'page_marathon_locations', 'tag_starter')
ON CONFLICT ("tenant_id", "page_id", "tag_id") DO NOTHING;

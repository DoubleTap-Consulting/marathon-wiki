/**
 * Idempotent upsert of the GTA 6 game, tenant, and categories.
 * Used by the one-time generated-pages loader in the same transaction as the import.
 * Pure SQL against a client; the caller starts and commits (or rolls back) the transaction.
 */
import type { PoolClient } from "@neondatabase/serverless";

export type TenantCategorySpec = {
  id: string;
  slug: string;
  name: string;
  description: string;
  sortOrder: number;
};

export type GameTenantUpsertSpec = {
  gameId: string;
  gameSlug: string;
  gameTitle: string;
  franchise: string;
  developer: string;
  publisher: string;
  releaseDate: string;
  gameMetadata: unknown;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  status: string;
  primaryLocale: string;
  categories: TenantCategorySpec[];
};

/** Same rows as prisma/seeds/gta6.sql. */
export const GTA6_TENANT_UPSERT: GameTenantUpsertSpec = {
  gameId: "game_gta6",
  gameSlug: "gta6",
  gameTitle: "Grand Theft Auto VI",
  franchise: "Grand Theft Auto",
  developer: "Rockstar Games",
  publisher: "Rockstar Games",
  releaseDate: "2026-11-19T00:00:00+00",
  gameMetadata: { seed: "gta6-starter", genres: ["action-adventure", "open world"] },
  tenantId: "tenant_gta6",
  tenantSlug: "gta6",
  tenantName: "Grand Theft Auto VI",
  status: "active",
  primaryLocale: "en",
  categories: [
    { id: "category_gta6_overview", slug: "overview", name: "Overview", description: "Release date, platforms, editions, and buying information.", sortOrder: 10 },
    { id: "category_gta6_gameplay", slug: "gameplay", name: "Gameplay", description: "Officially described features, trailers, music, and platform notes.", sortOrder: 20 },
    { id: "category_gta6_lore", slug: "lore", name: "Story and characters", description: "The official premise and characters Rockstar has introduced.", sortOrder: 30 },
    { id: "category_gta6_locations", slug: "locations", name: "Locations", description: "Leonida, Vice City, and other places official sources have named.", sortOrder: 40 },
  ],
};

export async function upsertGameTenantAndCategories(
  client: PoolClient,
  spec: GameTenantUpsertSpec,
): Promise<{ tenantId: string; created: boolean }> {
  const existing = await client.query("select id from tenants where slug = $1", [spec.tenantSlug]);
  const created = existing.rows.length === 0;

  await client.query(
    `insert into games (id, slug, title, franchise, developer, publisher, release_date, metadata)
     values ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8::jsonb)
     on conflict (slug) do update set
       title = excluded.title,
       franchise = excluded.franchise,
       developer = excluded.developer,
       publisher = excluded.publisher,
       release_date = excluded.release_date,
       metadata = excluded.metadata,
       updated_at = current_timestamp`,
    [
      spec.gameId,
      spec.gameSlug,
      spec.gameTitle,
      spec.franchise,
      spec.developer,
      spec.publisher,
      spec.releaseDate,
      JSON.stringify(spec.gameMetadata),
    ],
  );

  const tenant = await client.query(
    `insert into tenants (id, game_id, slug, name, status, primary_locale)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (slug) do update set
       game_id = excluded.game_id,
       name = excluded.name,
       status = excluded.status,
       primary_locale = excluded.primary_locale,
       updated_at = current_timestamp
     returning id`,
    [spec.tenantId, spec.gameId, spec.tenantSlug, spec.tenantName, spec.status, spec.primaryLocale],
  );

  const tenantId: string = tenant.rows[0].id;
  for (const category of spec.categories) {
    await client.query(
      `insert into wiki_categories (id, tenant_id, slug, name, description, sort_order)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (tenant_id, slug) do update set
         name = excluded.name,
         description = excluded.description,
         sort_order = excluded.sort_order,
         updated_at = current_timestamp`,
      [category.id, tenantId, category.slug, category.name, category.description, category.sortOrder],
    );
  }

  return { tenantId, created };
}

export function upsertGta6Tenant(client: PoolClient) {
  return upsertGameTenantAndCategories(client, GTA6_TENANT_UPSERT);
}

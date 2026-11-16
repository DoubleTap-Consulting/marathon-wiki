import type { Kysely } from "kysely";

import type { DB } from "./types";

/** The five categories every Marathon page files under; test wikis need them because a published page always has one. */
export const MARATHON_CATEGORY_SLUGS = ["overview", "gameplay", "lore", "equipment", "locations"] as const;

export async function seedTestCategories(db: Kysely<DB>, tenantId: string) {
  await db
    .insertInto("wiki_categories")
    .values(
      MARATHON_CATEGORY_SLUGS.map((slug, index) => ({
        id: `${tenantId}_cat_${slug}`,
        tenant_id: tenantId,
        slug,
        name: slug[0].toUpperCase() + slug.slice(1),
        sort_order: (index + 1) * 10,
      })),
    )
    .execute();
}

/**
 * Decides whether pages may be unpublished or republished, and applies the status change.
 * Pure decision rules are unit-tested; scripts/content/unpublish-pages.ts does the I/O.
 *
 * Unpublish sets status to "archived". Rows and revisions are kept. Public queries
 * already require status = "published", so archived pages 404 and drop out of the
 * sitemap, search index, and category lists. Republish sets status back to "published".
 */
import type { PoolClient } from "@neondatabase/serverless";

import { PROD_LOAD_FLAG, type LoadTarget } from "./load-approved-revisions";

export { PROD_LOAD_FLAG };
export type { LoadTarget };

export const UNPUBLISHED_STATUS = "archived";
export const PUBLISHED_STATUS = "published";

export type UnpublishAction = "unpublish" | "republish";

export type UnpublishDecision =
  | { ok: true; target: LoadTarget; action: UnpublishAction; phrase: string; slugs: string[] }
  | { ok: false; reason: string; phrase?: string };

export function normalizeUnpublishSlugs(raw: string | string[]): string[] {
  const text = Array.isArray(raw) ? raw.join(",") : raw;
  const unique = new Set(text.split(/[,\s]+/).map((slug) => slug.trim()).filter(Boolean));
  return [...unique].sort();
}

export function unpublishConfirmationPhrase(input: {
  tenantSlug: string;
  slugs: string[];
  target: LoadTarget;
  action?: UnpublishAction;
}) {
  const slugs = normalizeUnpublishSlugs(input.slugs);
  const action = input.action ?? "unpublish";
  if (action === "republish") {
    return `republish ${input.tenantSlug} ${slugs.join(",")} into ${input.target}`;
  }
  return `unpublish ${input.tenantSlug} ${slugs.join(",")} from ${input.target}`;
}

export function decideUnpublishPages(input: {
  env: Record<string, string | undefined>;
  guard: { ok: true } | { ok: false; reason: string };
  pointsAtProduction: boolean;
  confirm: string | null;
  tenantSlug: string;
  slugs: string[];
  action?: UnpublishAction;
}): UnpublishDecision {
  const action = input.action ?? "unpublish";
  if (input.env.VERCEL || input.env.VERCEL_ENV) {
    return { ok: false, reason: "refusing to run on Vercel; run it by hand from an operator machine" };
  }
  const slugs = normalizeUnpublishSlugs(input.slugs);
  if (slugs.length === 0) return { ok: false, reason: "pass --slugs with one or more page slugs" };
  if (!input.tenantSlug.trim()) return { ok: false, reason: "pass --tenant" };

  let target: LoadTarget;
  if (input.pointsAtProduction) {
    if (input.env[PROD_LOAD_FLAG] !== "1") {
      return { ok: false, reason: `the target is the production database; set ${PROD_LOAD_FLAG}=1 for this run` };
    }
    target = "production";
  } else if (input.guard.ok) {
    target = "non-production";
  } else {
    return { ok: false, reason: `database guard: ${input.guard.reason}` };
  }

  const phrase = unpublishConfirmationPhrase({ tenantSlug: input.tenantSlug, slugs, target, action });
  if (input.confirm !== phrase) {
    return { ok: false, reason: input.confirm ? "the confirmation does not match" : "missing --confirm", phrase };
  }
  return { ok: true, target, action, phrase, slugs };
}

export type UnpublishApplyResult = {
  changed: string[];
  already: string[];
};

export async function applyUnpublishPages(
  client: PoolClient,
  input: {
    tenantId: string;
    slugs: string[];
    action: UnpublishAction;
    actor: string;
  },
): Promise<UnpublishApplyResult> {
  const slugs = normalizeUnpublishSlugs(input.slugs);
  const wanted = input.action === "republish" ? PUBLISHED_STATUS : UNPUBLISHED_STATUS;
  const existing = await client.query(
    `select slug, status from wiki_pages where tenant_id = $1 and slug = any($2::text[])`,
    [input.tenantId, slugs],
  );
  const bySlug = new Map(existing.rows.map((row: { slug: string; status: string }) => [row.slug, row.status]));
  const missing = slugs.filter((slug) => !bySlug.has(slug));
  if (missing.length) {
    throw new Error(`no page row for: ${missing.join(", ")}`);
  }

  const changed: string[] = [];
  const already: string[] = [];
  const now = new Date().toISOString();
  for (const slug of slugs) {
    if (bySlug.get(slug) === wanted) {
      already.push(slug);
      continue;
    }
    await client.query(
      `update wiki_pages
       set status = $3, updated_by = $4, updated_at = $5, published_at = case when $3 = 'published' then coalesce(published_at, $5) else published_at end
       where tenant_id = $1 and slug = $2`,
      [input.tenantId, slug, wanted, input.actor, now],
    );
    changed.push(slug);
  }
  return { changed, already };
}

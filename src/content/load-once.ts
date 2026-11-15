/**
 * Decides whether the one-time load of content/marathon/generated/pages.json may run.
 * Pure, so the rules are unit-tested; scripts/content/load-generated-once.ts does the I/O.
 * No path aliases: the script imports this file with plain Node.
 *
 * Rules (all must hold):
 * - never on Vercel (an operator runs it once, by hand);
 * - a production target needs WIKI_ALLOW_PROD_CONTENT_LOAD=1 (off by default);
 * - any other target must pass the normal non-production guard;
 * - --confirm must repeat the exact phrase, which names the page count, the file hash, the
 *   target class and the wiki, so a stale or different file cannot be confirmed by habit.
 * The database record (unique load key) then blocks a second run; see loadKeyFor.
 */
export const PROD_LOAD_FLAG = "WIKI_ALLOW_PROD_CONTENT_LOAD";

export type LoadTarget = "production" | "non-production";

export type LoadDecision =
  | { ok: true; target: LoadTarget; phrase: string; loadKey: string }
  | { ok: false; reason: string; phrase?: string };

export function confirmationPhrase(input: { pageCount: number; fileSha256: string; target: LoadTarget; tenantSlug: string }) {
  return `load ${input.pageCount} pages ${input.fileSha256.slice(0, 12)} into ${input.target} ${input.tenantSlug}`;
}

export function loadKeyFor(tenantSlug: string) {
  return `generated-pages:${tenantSlug}`;
}

export function decideGeneratedLoad(input: {
  env: Record<string, string | undefined>;
  guard: { ok: true } | { ok: false; reason: string };
  pointsAtProduction: boolean;
  confirm: string | null;
  fileSha256: string;
  pageCount: number;
  tenantSlug: string;
}): LoadDecision {
  if (input.env.VERCEL || input.env.VERCEL_ENV) return { ok: false, reason: "refusing to run on Vercel; run it once by hand from an operator machine" };
  if (input.pageCount === 0) return { ok: false, reason: "the generated file has no pages" };

  let target: LoadTarget;
  if (input.pointsAtProduction) {
    if (input.env[PROD_LOAD_FLAG] !== "1") return { ok: false, reason: `the target is the production database; set ${PROD_LOAD_FLAG}=1 for this one run` };
    target = "production";
  } else if (input.guard.ok) {
    target = "non-production";
  } else {
    return { ok: false, reason: `database guard: ${input.guard.reason}` };
  }

  const phrase = confirmationPhrase({ pageCount: input.pageCount, fileSha256: input.fileSha256, target, tenantSlug: input.tenantSlug });
  if (input.confirm !== phrase) {
    return { ok: false, reason: input.confirm ? "the confirmation does not match" : "missing --confirm", phrase };
  }
  return { ok: true, target, phrase, loadKey: loadKeyFor(input.tenantSlug) };
}

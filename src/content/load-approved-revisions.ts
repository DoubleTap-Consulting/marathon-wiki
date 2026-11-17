/**
 * Decides whether approved paraphrase revisions may be loaded into a wiki database.
 * Pure, so the rules are unit-tested; scripts/content/load-approved-revisions.ts does the I/O.
 *
 * Unlike the one-time generated-pages load, this applies a reviewed set of page
 * revisions (exactly the approved file) and uses a distinct load_key so it can
 * run after generated-pages has already been recorded.
 *
 * Rules (all must hold):
 * - never on Vercel (an operator runs it by hand);
 * - a production target needs WIKI_ALLOW_PROD_CONTENT_LOAD=1 (off by default);
 * - any other target must pass the normal non-production guard;
 * - --confirm must repeat the exact phrase, which names the revision count, the
 *   file hash, the target class and the wiki.
 */
export const PROD_LOAD_FLAG = "WIKI_ALLOW_PROD_CONTENT_LOAD";

export type LoadTarget = "production" | "non-production";

export type LoadDecision =
  | { ok: true; target: LoadTarget; phrase: string; loadKey: string }
  | { ok: false; reason: string; phrase?: string };

export function approvedConfirmationPhrase(input: { revisionCount: number; fileSha256: string; target: LoadTarget; tenantSlug: string }) {
  return `apply ${input.revisionCount} approved revisions ${input.fileSha256.slice(0, 12)} into ${input.target} ${input.tenantSlug}`;
}

export function approvedLoadKeyFor(tenantSlug: string, fileSha256: string) {
  return `approved-paraphrase-revisions:${tenantSlug}:${fileSha256.slice(0, 12)}`;
}

export function decideApprovedRevisionLoad(input: {
  env: Record<string, string | undefined>;
  guard: { ok: true } | { ok: false; reason: string };
  pointsAtProduction: boolean;
  confirm: string | null;
  fileSha256: string;
  revisionCount: number;
  tenantSlug: string;
}): LoadDecision {
  if (input.env.VERCEL || input.env.VERCEL_ENV) return { ok: false, reason: "refusing to run on Vercel; run it by hand from an operator machine" };
  if (input.revisionCount === 0) return { ok: false, reason: "the approved revisions file has no pages" };

  let target: LoadTarget;
  if (input.pointsAtProduction) {
    if (input.env[PROD_LOAD_FLAG] !== "1") return { ok: false, reason: `the target is the production database; set ${PROD_LOAD_FLAG}=1 for this run` };
    target = "production";
  } else if (input.guard.ok) {
    target = "non-production";
  } else {
    return { ok: false, reason: `database guard: ${input.guard.reason}` };
  }

  const phrase = approvedConfirmationPhrase({ revisionCount: input.revisionCount, fileSha256: input.fileSha256, target, tenantSlug: input.tenantSlug });
  if (input.confirm !== phrase) {
    return { ok: false, reason: input.confirm ? "the confirmation does not match" : "missing --confirm", phrase };
  }
  return { ok: true, target, phrase, loadKey: approvedLoadKeyFor(input.tenantSlug, input.fileSha256) };
}

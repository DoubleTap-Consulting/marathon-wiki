import { describe, expect, it } from "vitest";

import {
  PROD_LOAD_FLAG,
  approvedConfirmationPhrase,
  approvedLoadKeyFor,
  decideApprovedRevisionLoad,
} from "./load-approved-revisions";

const sha = "abcdef0123456789".padEnd(64, "0");
const base = {
  env: {},
  guard: { ok: true } as const,
  pointsAtProduction: false,
  confirm: null,
  fileSha256: sha,
  updatedCount: 24,
  newCount: 1,
  tenantSlug: "marathon",
};
const prodGuard = { ok: false, reason: "DATABASE_URL points at the production database endpoint" } as const;

describe("approved paraphrase revision load", () => {
  it("asks a non-production target for the exact phrase, then allows it", () => {
    const first = decideApprovedRevisionLoad(base);
    expect(first).toEqual({
      ok: false,
      reason: "missing --confirm",
      phrase: "apply 24 updated + 1 new revisions abcdef012345 into non-production marathon",
    });
    expect(decideApprovedRevisionLoad({ ...base, confirm: "yes" })).toMatchObject({ ok: false, reason: "the confirmation does not match" });
    expect(decideApprovedRevisionLoad({ ...base, confirm: first.phrase! })).toEqual({
      ok: true,
      target: "non-production",
      phrase: first.phrase,
      loadKey: "approved-paraphrase-revisions:marathon:abcdef012345",
    });
  });

  it("refuses production unless the override flag is set, and the phrase names production", () => {
    const prod = { ...base, guard: prodGuard, pointsAtProduction: true };
    const nonProdPhrase = approvedConfirmationPhrase({ updatedCount: 24, newCount: 1, fileSha256: sha, target: "non-production", tenantSlug: "marathon" });
    expect(decideApprovedRevisionLoad({ ...prod, confirm: nonProdPhrase })).toMatchObject({ ok: false, reason: expect.stringContaining(PROD_LOAD_FLAG) });
    const flagged = { ...prod, env: { [PROD_LOAD_FLAG]: "1" } };
    expect(decideApprovedRevisionLoad({ ...flagged, confirm: nonProdPhrase })).toMatchObject({
      ok: false,
      phrase: "apply 24 updated + 1 new revisions abcdef012345 into production marathon",
    });
    expect(decideApprovedRevisionLoad({ ...flagged, confirm: "apply 24 updated + 1 new revisions abcdef012345 into production marathon" })).toMatchObject({
      ok: true,
      target: "production",
    });
    expect(
      decideApprovedRevisionLoad({
        ...flagged,
        env: { [PROD_LOAD_FLAG]: "true" },
        confirm: "apply 24 updated + 1 new revisions abcdef012345 into production marathon",
      }).ok,
    ).toBe(false);
  });

  it("uses a load key distinct from the one-time generated-pages load", () => {
    expect(approvedLoadKeyFor("marathon", sha)).toBe("approved-paraphrase-revisions:marathon:abcdef012345");
    expect(approvedLoadKeyFor("marathon", sha)).not.toContain("generated-pages:");
  });

  it("ties the phrase to the file, refuses on Vercel and when the target cannot be classified", () => {
    const phrase = approvedConfirmationPhrase({ updatedCount: 24, newCount: 1, fileSha256: sha, target: "non-production", tenantSlug: "marathon" });
    expect(decideApprovedRevisionLoad({ ...base, fileSha256: "ffff".padEnd(64, "1"), confirm: phrase }).ok).toBe(false);
    expect(decideApprovedRevisionLoad({ ...base, env: { VERCEL: "1" }, confirm: phrase }).ok).toBe(false);
    expect(decideApprovedRevisionLoad({ ...base, guard: { ok: false, reason: "no database URL is set" }, confirm: phrase })).toMatchObject({
      ok: false,
      reason: "database guard: no database URL is set",
    });
  });
});

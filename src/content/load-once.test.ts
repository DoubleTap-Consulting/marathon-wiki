import { describe, expect, it } from "vitest";

import { PROD_LOAD_FLAG, confirmationPhrase, decideGeneratedLoad, loadKeyFor } from "./load-once";

const sha = "abcdef0123456789".padEnd(64, "0");
const base = { env: {}, guard: { ok: true } as const, pointsAtProduction: false, confirm: null, fileSha256: sha, pageCount: 40, tenantSlug: "marathon" };
const prodGuard = { ok: false, reason: "DATABASE_URL points at the production database endpoint" } as const;

describe("one-time generated content load", () => {
  it("asks a non-production target for the exact phrase, then allows it", () => {
    const first = decideGeneratedLoad(base);
    expect(first).toEqual({ ok: false, reason: "missing --confirm", phrase: "load 40 pages abcdef012345 into non-production marathon" });
    expect(decideGeneratedLoad({ ...base, confirm: "yes" })).toMatchObject({ ok: false, reason: "the confirmation does not match" });
    expect(decideGeneratedLoad({ ...base, confirm: first.phrase! })).toEqual({ ok: true, target: "non-production", phrase: first.phrase, loadKey: "generated-pages:marathon" });
  });

  it("refuses production unless the override flag is set, and the phrase names production", () => {
    const prod = { ...base, guard: prodGuard, pointsAtProduction: true };
    const nonProdPhrase = confirmationPhrase({ pageCount: 40, fileSha256: sha, target: "non-production", tenantSlug: "marathon" });
    expect(decideGeneratedLoad({ ...prod, confirm: nonProdPhrase })).toMatchObject({ ok: false, reason: expect.stringContaining(PROD_LOAD_FLAG) });
    const flagged = { ...prod, env: { [PROD_LOAD_FLAG]: "1" } };
    expect(decideGeneratedLoad({ ...flagged, confirm: nonProdPhrase })).toMatchObject({ ok: false, phrase: "load 40 pages abcdef012345 into production marathon" });
    expect(decideGeneratedLoad({ ...flagged, confirm: "load 40 pages abcdef012345 into production marathon" })).toMatchObject({ ok: true, target: "production" });
    expect(decideGeneratedLoad({ ...flagged, env: { [PROD_LOAD_FLAG]: "true" }, confirm: "load 40 pages abcdef012345 into production marathon" }).ok).toBe(false);
  });

  it("ties the phrase to the file, refuses on Vercel and when the target cannot be classified", () => {
    const phrase = confirmationPhrase({ pageCount: 40, fileSha256: sha, target: "non-production", tenantSlug: "marathon" });
    expect(decideGeneratedLoad({ ...base, fileSha256: "ffff".padEnd(64, "1"), confirm: phrase }).ok).toBe(false);
    expect(decideGeneratedLoad({ ...base, env: { VERCEL: "1" }, confirm: phrase }).ok).toBe(false);
    expect(decideGeneratedLoad({ ...base, guard: { ok: false, reason: "no database URL is set" }, confirm: phrase })).toMatchObject({ ok: false, reason: "database guard: no database URL is set" });
    expect(loadKeyFor("marathon")).toBe("generated-pages:marathon");
  });
});

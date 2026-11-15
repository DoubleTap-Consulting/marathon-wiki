import { describe, expect, it } from "vitest";

import { checkNonProductionTarget, endpointIdOf } from "./db-guard.mjs";

const PROD = "ep-prod-example-111111";
const url = (host: string) => `postgresql://user:secret@${host}/neondb?sslmode=require`;

describe("endpointIdOf", () => {
  it("matches pooled and unpooled hosts of one endpoint", () => {
    expect(endpointIdOf(url(`${PROD}-pooler.c-8.us-east-2.aws.neon.tech`))).toBe(PROD);
    expect(endpointIdOf(`${PROD}.c-8.us-east-2.aws.neon.tech`)).toBe(PROD);
    expect(endpointIdOf(PROD.toUpperCase())).toBe(PROD);
  });
});

describe("checkNonProductionTarget", () => {
  const base = { WIKI_PRODUCTION_DB_ENDPOINTS: PROD };

  it("fails when no database URL is set", () => {
    expect(checkNonProductionTarget(base).ok).toBe(false);
  });

  it("uses the built-in production endpoint when no env override is set", () => {
    expect(checkNonProductionTarget({ DATABASE_URL: url("ep-branch-222222.neon.tech") })).toEqual({ ok: true });
  });

  it("fails when any database var points at production, pooled or not", () => {
    const result = checkNonProductionTarget({
      ...base,
      DATABASE_URL_UNPOOLED: url("ep-branch-222222.neon.tech"),
      DATABASE_URL: url(`${PROD}-pooler.neon.tech`),
    });
    expect(result).toEqual({ ok: false, reason: "DATABASE_URL points at the production database endpoint" });
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("passes for a branch endpoint", () => {
    expect(
      checkNonProductionTarget({
        ...base,
        DATABASE_URL_UNPOOLED: url("ep-branch-222222.neon.tech"),
        DATABASE_URL: url("ep-branch-222222-pooler.neon.tech"),
        PGHOST: "ep-branch-222222-pooler.neon.tech",
      }),
    ).toEqual({ ok: true });
  });
});

describe("production endpoint constant", () => {
  const pooled = "ep-dawn-unit-atl2b0aj-pooler.c-9.us-east-1.aws.neon.tech";
  const unpooled = "ep-dawn-unit-atl2b0aj.c-9.us-east-1.aws.neon.tech";

  it.each([
    ["DATABASE_URL", url(pooled)],
    ["DATABASE_URL", url(unpooled)],
    ["DATABASE_URL_UNPOOLED", url(unpooled)],
    ["DATABASE_URL_UNPOOLED", url(pooled)],
    ["PGHOST", pooled],
    ["PGHOST_UNPOOLED", unpooled],
  ])("refuses %s = %s", (name, value) => {
    const env: Record<string, string> = { DATABASE_URL_UNPOOLED: url("ep-branch-222222.neon.tech"), [name]: value };
    expect(checkNonProductionTarget(env)).toEqual({ ok: false, reason: `${name} points at the production database endpoint` });
  });

  it("refuses the bare hosts as the target URL too", () => {
    expect(endpointIdOf(pooled)).toBe("ep-dawn-unit-atl2b0aj");
    expect(endpointIdOf(unpooled)).toBe("ep-dawn-unit-atl2b0aj");
  });
});

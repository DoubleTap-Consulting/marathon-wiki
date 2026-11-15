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

  it("fails when the production endpoint is unknown", () => {
    expect(checkNonProductionTarget({ DATABASE_URL: url("ep-branch-222222.neon.tech") }).ok).toBe(false);
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

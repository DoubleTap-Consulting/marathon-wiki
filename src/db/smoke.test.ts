import { afterEach, describe, expect, it } from "vitest";

try {
  process.loadEnvFile(".env.local");
} catch {
  // CI can provide DATABASE_URL directly.
}

import { checkStorage } from "./smoke";

const configuredDatabaseUrl = process.env.DATABASE_URL;

if (!configuredDatabaseUrl) {
  throw new Error("DATABASE_URL is required for storage smoke tests.");
}

afterEach(() => {
  process.env.DATABASE_URL = configuredDatabaseUrl;
});

describe("storage smoke checks", () => {
  it("reports storage as unconfigured without exposing secrets", async () => {
    delete process.env.DATABASE_URL;

    const result = await checkStorage();

    expect(result).toMatchObject({
      ok: false,
      configured: false,
      message: "DATABASE_URL is not configured.",
    });
    expect(JSON.stringify(result)).not.toContain(configuredDatabaseUrl);
  });

  it("checks configured storage connectivity without returning the connection string", async () => {
    const result = await checkStorage();

    expect(result).toMatchObject({
      ok: true,
      configured: true,
    });
    expect(result.checkedAt).toEqual(expect.any(String));
    expect(JSON.stringify(result)).not.toContain(configuredDatabaseUrl);
  });
});

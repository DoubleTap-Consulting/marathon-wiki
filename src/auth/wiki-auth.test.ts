import { afterEach, describe, expect, it } from "vitest";

import {
  canReviewSuggestions,
  getAuthMode,
  isClerkConfigured,
  isDevAuthEnabled,
  type WikiActor,
} from "./wiki-auth";

const ENV_KEYS = [
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "WIKI_ENABLE_DEV_AUTH",
  "WIKI_DEV_AUTH_ROLE",
  "WIKI_EDITOR_USER_IDS",
  "WIKI_EDITOR_EMAILS",
] as const;

const originalEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
);

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];

    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("wiki auth configuration", () => {
  it("reports unconfigured auth when no Clerk or dev auth values are set", () => {
    clearAuthEnv();

    expect(isClerkConfigured()).toBe(false);
    expect(isDevAuthEnabled()).toBe(false);
    expect(getAuthMode()).toBe("unconfigured");
  });

  it("prefers Clerk when both Clerk keys are present", () => {
    clearAuthEnv();
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test";
    process.env.CLERK_SECRET_KEY = "sk_test";
    process.env.WIKI_ENABLE_DEV_AUTH = "true";

    expect(isClerkConfigured()).toBe(true);
    expect(getAuthMode()).toBe("clerk");
  });

  it("allows a dev editor only when dev auth role is editor", () => {
    const actor: WikiActor = {
      id: "local-editor",
      email: "editor@example.local",
      name: "Local Editor",
      provider: "dev",
    };

    clearAuthEnv();
    process.env.WIKI_DEV_AUTH_ROLE = "viewer";
    expect(canReviewSuggestions(actor)).toBe(false);

    process.env.WIKI_DEV_AUTH_ROLE = "editor";
    expect(canReviewSuggestions(actor)).toBe(true);
  });

  it("allows Clerk reviewers by id or email allowlist", () => {
    const actor: WikiActor = {
      id: "user_123",
      email: "Editor@Example.com",
      name: "Editor",
      provider: "clerk",
    };

    clearAuthEnv();
    expect(canReviewSuggestions(actor)).toBe(false);

    process.env.WIKI_EDITOR_USER_IDS = "other,user_123";
    expect(canReviewSuggestions(actor)).toBe(true);

    process.env.WIKI_EDITOR_USER_IDS = "";
    process.env.WIKI_EDITOR_EMAILS = "editor@example.com";
    expect(canReviewSuggestions(actor)).toBe(true);
  });
});

function clearAuthEnv() {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
}

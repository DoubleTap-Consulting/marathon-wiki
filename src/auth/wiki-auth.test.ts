import { afterEach, describe, expect, it } from "vitest";

import {
  canReviewSuggestions,
  getAuthMode,
  isClerkConfigured,
  isDevAuthEnabled,
  requireWikiEditor,
  wikiNavAuthFromActor,
  type WikiActor,
} from "./wiki-auth";
import {
  displayInitials,
  safeInternalPath,
  shouldShowFooterReview,
  wikiSidebarAccountItems,
} from "./wiki-nav";

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

  it("refuses editor access for a signed-in Clerk user who is not on the allowlist", () => {
    const actor: WikiActor = {
      id: "user_suggester",
      email: "reader@example.com",
      name: "Reader",
      provider: "clerk",
    };

    clearAuthEnv();
    process.env.WIKI_EDITOR_EMAILS = "editor@example.com";
    process.env.WIKI_EDITOR_USER_IDS = "user_123";

    expect(canReviewSuggestions(actor)).toBe(false);
    expect(() => requireWikiEditor(actor)).toThrow(/permission to review/);
    expect(() => requireWikiEditor(null)).toThrow(/permission to review/);
  });

  it("returns the actor from requireWikiEditor when the allowlist matches", () => {
    const actor: WikiActor = {
      id: "user_123",
      email: "editor@example.com",
      name: "Editor",
      provider: "clerk",
    };

    clearAuthEnv();
    process.env.WIKI_EDITOR_EMAILS = "editor@example.com";
    expect(requireWikiEditor(actor)).toBe(actor);
  });
});

describe("wiki sidebar account items", () => {
  const signedOut = { status: "signed_out" } as const;
  const suggester = {
    status: "signed_in",
    canReview: false,
    canSignOut: true,
    displayName: "Mike Flores",
  } as const;
  const editor = {
    status: "signed_in",
    canReview: true,
    canSignOut: true,
    displayName: "Mike Flores",
  } as const;
  const devUser = {
    status: "signed_in",
    canReview: false,
    canSignOut: false,
    displayName: "Local Preview User",
  } as const;

  it("renders a Sign in link for signed-out visitors and no Review link", () => {
    expect(
      wikiSidebarAccountItems({
        tenantSlug: "marathon",
        currentPath: "/marathon/ranked",
        auth: signedOut,
      }),
    ).toEqual([
      {
        kind: "link",
        href: "/marathon/sign-in?redirect=%2Fmarathon%2Franked",
        label: "Sign in",
      },
      {
        kind: "hint",
        text: "Suggest edits; an editor reviews every change.",
      },
    ]);
  });

  it("gives a signed-in non-editor Suggest an edit and Sign out, but not Review", () => {
    expect(
      wikiSidebarAccountItems({
        tenantSlug: "marathon",
        currentPath: "/marathon",
        auth: suggester,
      }),
    ).toEqual([
      { kind: "identity", displayName: "Mike Flores", initials: "MF" },
      { kind: "link", href: "/marathon/suggest", label: "Suggest an edit" },
      {
        kind: "link",
        href: "/marathon/sign-out?redirect=%2Fmarathon",
        label: "Sign out",
      },
    ]);
  });

  it("shows Review only for allowlisted editors", () => {
    const labels = wikiSidebarAccountItems({
      tenantSlug: "marathon",
      currentPath: "/marathon",
      auth: editor,
    }).flatMap((item) => (item.kind === "link" ? [item.label] : []));

    expect(labels).toEqual(["Suggest an edit", "Review", "Sign out"]);
  });

  it("omits Sign out for the local dev auth fallback", () => {
    const labels = wikiSidebarAccountItems({
      tenantSlug: "marathon",
      currentPath: "/marathon",
      auth: devUser,
    }).flatMap((item) => (item.kind === "link" ? [item.label] : []));

    expect(labels).toEqual(["Suggest an edit"]);
  });

  it("waits to render account links until auth has loaded", () => {
    expect(
      wikiSidebarAccountItems({
        tenantSlug: "marathon",
        currentPath: "/marathon",
        auth: null,
      }),
    ).toEqual([]);
  });

  it("builds signed-out nav auth from a missing actor", () => {
    expect(wikiNavAuthFromActor(null, "clerk")).toEqual({ status: "signed_out" });
  });
});

describe("safeInternalPath and initials", () => {
  it("rejects open redirects and protocol-relative paths", () => {
    expect(safeInternalPath("/marathon/review", "/marathon")).toBe("/marathon/review");
    expect(safeInternalPath("/marathon/ranked?x=1", "/marathon")).toBe("/marathon/ranked?x=1");
    expect(safeInternalPath("//evil.example/phish", "/marathon")).toBe("/marathon");
    expect(safeInternalPath("https://evil.example", "/marathon")).toBe("/marathon");
    expect(safeInternalPath("/\\evil.example", "/marathon")).toBe("/marathon");
    expect(safeInternalPath("/%2f%2fevil.example", "/marathon")).toBe("/marathon");
    expect(safeInternalPath("/marathon/../admin", "/marathon")).toBe("/marathon");
    expect(safeInternalPath(null, "/marathon")).toBe("/marathon");
  });

  it("derives compact initials from a name or email", () => {
    expect(displayInitials("Mike Flores")).toBe("MF");
    expect(displayInitials("mike@michaelflores.io")).toBe("MI");
    expect(displayInitials("  ")).toBe("?");
  });
});

describe("footer Review visibility", () => {
  it("matches the menu: Review is only for signed-in allowlisted editors", () => {
    expect(shouldShowFooterReview(null)).toBe(false);
    expect(shouldShowFooterReview({ status: "signed_out" })).toBe(false);
    expect(shouldShowFooterReview({ status: "signed_in", canReview: false, canSignOut: true, displayName: "Reader" })).toBe(false);
    expect(shouldShowFooterReview({ status: "signed_in", canReview: true, canSignOut: true, displayName: "Editor" })).toBe(true);
  });
});

function clearAuthEnv() {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
}

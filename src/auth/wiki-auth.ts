import { auth, currentUser } from "@clerk/nextjs/server";

export type WikiActor = {
  id: string;
  email: string | null;
  name: string | null;
  provider: "clerk" | "dev";
};

export type WikiAuthMode = "clerk" | "dev" | "unconfigured";

export function isClerkConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
  );
}

export function isDevAuthEnabled() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.WIKI_ENABLE_DEV_AUTH === "true"
  );
}

export function getAuthMode(): WikiAuthMode {
  if (isClerkConfigured()) {
    return "clerk";
  }

  if (isDevAuthEnabled()) {
    return "dev";
  }

  return "unconfigured";
}

export async function getCurrentWikiActor(): Promise<WikiActor | null> {
  if (isClerkConfigured()) {
    const authState = await auth();

    if (!authState.userId) {
      return null;
    }

    const user = await currentUser();
    const email =
      user?.primaryEmailAddress?.emailAddress ??
      user?.emailAddresses[0]?.emailAddress ??
      null;
    const name =
      user?.fullName ??
      user?.username ??
      [user?.firstName, user?.lastName].filter(Boolean).join(" ") ??
      null;

    return {
      id: authState.userId,
      email,
      name: name || email,
      provider: "clerk",
    };
  }

  if (isDevAuthEnabled()) {
    return {
      id: process.env.WIKI_DEV_USER_ID ?? "dev-user",
      email: process.env.WIKI_DEV_USER_EMAIL ?? "dev@example.local",
      name: process.env.WIKI_DEV_USER_NAME ?? "Local Preview User",
      provider: "dev",
    };
  }

  return null;
}

export function canReviewSuggestions(actor: WikiActor | null) {
  if (!actor) {
    return false;
  }

  if (actor.provider === "dev" && process.env.WIKI_DEV_AUTH_ROLE === "editor") {
    return true;
  }

  const allowedIds = splitEnvList(process.env.WIKI_EDITOR_USER_IDS);
  const allowedEmails = splitEnvList(process.env.WIKI_EDITOR_EMAILS).map((email) =>
    email.toLowerCase(),
  );

  return (
    allowedIds.includes(actor.id) ||
    Boolean(actor.email && allowedEmails.includes(actor.email.toLowerCase()))
  );
}

export function requireConfiguredAuth() {
  if (getAuthMode() === "unconfigured") {
    throw new Error(
      "Authentication is not configured. Set Clerk keys, or enable WIKI_ENABLE_DEV_AUTH=true outside production for local preview.",
    );
  }
}

function splitEnvList(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

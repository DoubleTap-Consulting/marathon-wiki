export type WikiNavAuth =
  | { status: "signed_out" }
  | {
      status: "signed_in";
      canReview: boolean;
      canSignOut: boolean;
      displayName: string;
    };

export type WikiSidebarItem =
  | { kind: "link"; href: string; label: string }
  | { kind: "identity"; displayName: string; initials: string }
  | { kind: "hint"; text: string };

export const SIGNED_OUT_ACCOUNT_HINT =
  "Suggest edits; an editor reviews every change.";

export function displayInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return "?";
  }

  if (parts.length === 1) {
    const token = parts[0];
    const at = token.indexOf("@");
    const local = at > 0 ? token.slice(0, at) : token;
    return local.slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function safeInternalPath(
  value: string | null | undefined,
  fallback: string,
) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  const pathOnly = value.split("?")[0] ?? value;
  if (
    value.includes("\\") ||
    value.includes("://") ||
    pathOnly.includes("//") ||
    pathOnly.includes("..") ||
    !/^\/[A-Za-z0-9/_?=&.,\-]*$/.test(value)
  ) {
    return fallback;
  }

  return value;
}

export function wikiSidebarAccountItems({
  tenantSlug,
  currentPath,
  auth,
}: {
  tenantSlug: string;
  currentPath: string;
  auth: WikiNavAuth | null;
}): WikiSidebarItem[] {
  if (!auth) {
    return [];
  }

  const fallback = `/${tenantSlug}`;
  const redirect = `?redirect=${encodeURIComponent(safeInternalPath(currentPath, fallback))}`;

  if (auth.status === "signed_out") {
    return [
      { kind: "link", href: `${fallback}/sign-in${redirect}`, label: "Sign in" },
      { kind: "hint", text: SIGNED_OUT_ACCOUNT_HINT },
    ];
  }

  const items: WikiSidebarItem[] = [
    {
      kind: "identity",
      displayName: auth.displayName,
      initials: displayInitials(auth.displayName),
    },
    { kind: "link", href: `${fallback}/suggest`, label: "Suggest an edit" },
  ];

  if (auth.canReview) {
    items.push({ kind: "link", href: `${fallback}/review`, label: "Review" });
  }

  if (auth.canSignOut) {
    items.push({ kind: "link", href: `${fallback}/sign-out${redirect}`, label: "Sign out" });
  }

  return items;
}

export function shouldShowFooterReview(auth: WikiNavAuth | null) {
  return auth?.status === "signed_in" && auth.canReview;
}

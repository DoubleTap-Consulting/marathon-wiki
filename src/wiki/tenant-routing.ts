const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);
const HOSTS_WITH_RESERVED_SUBDOMAINS = ["vercel.app"];
const RESERVED_PATHS = new Set(["api", "_next", "favicon.ico", "robots.txt"]);
const FALLBACK_DEFAULT_TENANT_SLUG = "marathon";

export function getDefaultTenantSlug() {
  return normalizeTenantSlug(
    process.env.NEXT_PUBLIC_DEFAULT_TENANT_SLUG ??
      process.env.DEFAULT_TENANT_SLUG ??
      FALLBACK_DEFAULT_TENANT_SLUG,
  );
}

export function normalizeTenantSlug(slug: string) {
  return slug.trim().toLowerCase();
}

export function normalizeWikiSlug(slug: string) {
  return slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getTenantSlugFromHost(hostHeader: string | null) {
  if (!hostHeader) {
    return null;
  }

  const host = hostHeader.split(":")[0]?.toLowerCase();

  if (!host || LOCAL_HOSTS.has(host) || host.endsWith(".localhost")) {
    return null;
  }

  const configuredRoot =
    process.env.NEXT_PUBLIC_WIKI_ROOT_DOMAIN ?? process.env.WIKI_ROOT_DOMAIN;

  if (configuredRoot) {
    const root = configuredRoot.toLowerCase();

    if (host === root) {
      return null;
    }

    if (host.endsWith(`.${root}`)) {
      return normalizeTenantSlug(host.slice(0, -(root.length + 1)).split(".")[0]);
    }
  }

  if (HOSTS_WITH_RESERVED_SUBDOMAINS.some((domain) => host.endsWith(`.${domain}`))) {
    return null;
  }

  const labels = host.split(".");

  if (labels.length < 3 || labels[0] === "www") {
    return null;
  }

  return normalizeTenantSlug(labels[0]);
}

export function isPublicFilePath(pathname: string) {
  const firstSegment = pathname.split("/").filter(Boolean)[0];

  return (
    !firstSegment ||
    RESERVED_PATHS.has(firstSegment) ||
    /\.[a-z0-9]+$/i.test(pathname)
  );
}

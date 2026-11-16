/** The network every game wiki belongs to: one value for the whole network, never in a game manifest. */
export const network: { label: string | null; href: string | null } = { label: null, href: null };

/** Shown on preview builds until the network has a name, so its places can be reviewed. */
export const NETWORK_PLACEHOLDER = "Network Name";

export type NetworkBrand = { name: string; href: string | null; placeholder: boolean };

/**
 * The network brand to show, or null for today's per-game naming. Production keeps today's names
 * until the network has a label; every other build shows the network, with a placeholder name.
 */
export function networkBrand(env: Record<string, string | undefined> = process.env): NetworkBrand | null {
  if (network.label) return { name: network.label, href: network.href, placeholder: false };
  if (env.VERCEL_ENV === "production") return null;
  return { name: NETWORK_PLACEHOLDER, href: null, placeholder: true };
}

/** The network every game wiki belongs to: one value for the whole network, never in a game manifest. */
export const network: { label: string | null; href: string | null } = { label: "WikiDen", href: null };

/** Shown on preview builds until the network has a name, so its places can be reviewed. */
export const NETWORK_PLACEHOLDER = "Network Name";

export type NetworkBrand = { name: string; href: string | null; placeholder: boolean };

/**
 * The network brand to show, or null for per-game naming. When the network has a label it is used
 * in every environment; otherwise production keeps per-game names and every other build shows a
 * placeholder.
 */
export function networkBrand(env: Record<string, string | undefined> = process.env): NetworkBrand | null {
  if (network.label) return { name: network.label, href: network.href, placeholder: false };
  if (env.VERCEL_ENV === "production") return null;
  return { name: NETWORK_PLACEHOLDER, href: null, placeholder: true };
}

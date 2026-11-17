/** Network-level legal pages: kept out of tenant routing and linked from every footer. */
export const LEGAL_EFFECTIVE_DATE = "November 16, 2026";
export const LEGAL_CONTACT_EMAIL = "mike@michaelflores.io";

export const legalNav = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
] as const;

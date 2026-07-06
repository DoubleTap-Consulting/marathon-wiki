export const WIKI_SOURCE_AUTHORITY_TIERS = {
  official: "official",
  reputableEditorial: "reputable_editorial",
  communityWiki: "community_wiki",
  community: "community",
} as const;

export type WikiSourceAuthorityTier =
  (typeof WIKI_SOURCE_AUTHORITY_TIERS)[keyof typeof WIKI_SOURCE_AUTHORITY_TIERS];

export type CuratedWikiSource = {
  id: string;
  gameSlug: string;
  sourceKey: string;
  title: string;
  url: string;
  publisher: string;
  sourceType: string;
  authorityTier: WikiSourceAuthorityTier;
  authorityScore: number;
  topicSlugs: string[];
  refreshCadenceDays: number;
  extraction: {
    strategy: "required-term-summary";
    requiredTerms: string[];
    aliases?: Record<string, string[]>;
    contextSummary: string;
    fallbackContext: string;
  };
};

const MARATHON_FACTION_TERMS = [
  "Arachne",
  "Cyberacme",
  "Nucaloric",
  "Sekiguchi",
  "Traxus",
  "MIDA",
];

export const MARATHON_CURATED_SOURCE_REGISTRY = [
  {
    id: "marathon-factions-pcgamer-guide",
    gameSlug: "marathon",
    sourceKey: "marathon-factions-pcgamer-guide",
    title: "Marathon guide: what we know about Bungie's extraction shooter",
    url: "https://www.pcgamer.com/games/fps/marathon-guide/",
    publisher: "PC Gamer",
    sourceType: "editorial_reference",
    authorityTier: WIKI_SOURCE_AUTHORITY_TIERS.reputableEditorial,
    authorityScore: 82,
    topicSlugs: ["factions", "lore", "overview"],
    refreshCadenceDays: 7,
    extraction: {
      strategy: "required-term-summary",
      requiredTerms: MARATHON_FACTION_TERMS,
      aliases: {
        "Nucaloric": ["NuCal", "Nucaloric"],
        "MIDA": ["MIDA", "Mida"],
      },
      contextSummary:
        "PC Gamer reports that Bungie has revealed six Marathon factions: Arachne, Cyberacme, Sekiguchi, MIDA, Traxus, and NuCal/Nucaloric.",
      fallbackContext:
        "PC Gamer is tracked as a reputable editorial source for Marathon faction coverage and identifies Arachne, Cyberacme, Sekiguchi, MIDA, Traxus, and NuCal/Nucaloric as the revealed faction set.",
    },
  },
  {
    id: "marathon-factions-techradar-launch-roadmap",
    gameSlug: "marathon",
    sourceKey: "marathon-factions-techradar-launch-roadmap",
    title: "Marathon launch and roadmap coverage",
    url: "https://www.techradar.com/gaming/marathon-will-launch-in-march-2026-at-usd40-and-will-include-a-roadmap-of-free-gameplay-updates",
    publisher: "TechRadar",
    sourceType: "editorial_reference",
    authorityTier: WIKI_SOURCE_AUTHORITY_TIERS.reputableEditorial,
    authorityScore: 78,
    topicSlugs: ["factions", "lore", "launch"],
    refreshCadenceDays: 7,
    extraction: {
      strategy: "required-term-summary",
      requiredTerms: MARATHON_FACTION_TERMS,
      aliases: {
        "Nucaloric": ["NuCal", "Nucaloric"],
        "MIDA": ["MIDA", "Mida"],
      },
      contextSummary:
        "TechRadar coverage lists the six Marathon factions as Arachne, Cyberacme, Nucaloric, Sekiguchi, Traxus, and MIDA.",
      fallbackContext:
        "TechRadar is tracked as a reputable editorial source for Marathon launch coverage and corroborates Arachne, Cyberacme, Nucaloric/NuCal, Sekiguchi, Traxus, and MIDA as the current faction list.",
    },
  },
  {
    id: "marathon-factions-gamesradar-cryo-archive",
    gameSlug: "marathon",
    sourceKey: "marathon-factions-gamesradar-cryo-archive",
    title: "Marathon Cryo Archive faction puzzle coverage",
    url: "https://www.gamesradar.com/games/fps/new-marathon-update-takes-players-closer-to-finally-unlocking-the-cryo-archive-map-once-they-figure-out-more-mind-bending-puzzles/",
    publisher: "GamesRadar+",
    sourceType: "editorial_reference",
    authorityTier: WIKI_SOURCE_AUTHORITY_TIERS.reputableEditorial,
    authorityScore: 76,
    topicSlugs: ["factions", "lore", "locations"],
    refreshCadenceDays: 7,
    extraction: {
      strategy: "required-term-summary",
      requiredTerms: MARATHON_FACTION_TERMS,
      aliases: {
        "Nucaloric": ["NuCal", "Nucaloric"],
        "MIDA": ["MIDA", "Mida"],
      },
      contextSummary:
        "GamesRadar+ reports that Cryo Archive access involves all six factions: Cyberacme, Nucaloric/NuCal, Traxus, MIDA, Arachne, and Sekiguchi.",
      fallbackContext:
        "GamesRadar+ is tracked as a reputable editorial source for Marathon event coverage and corroborates Cyberacme, Nucaloric/NuCal, Traxus, MIDA, Arachne, and Sekiguchi as the six-faction set.",
    },
  },
] satisfies CuratedWikiSource[];

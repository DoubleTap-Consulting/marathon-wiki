import { describe, expect, it } from "vitest";

import {
  extractImportantClaims,
  verifyCanonicalClaims,
} from "./wiki-claim-verification";
import type { WikiSourceReference } from "@/src/db/wiki";

describe("canonical claim verification", () => {
  it("extracts important factual claims from generated markdown", () => {
    expect(
      extractImportantClaims(
        "## Overview\n\nCurrent sources identify six Marathon factions: Arachne, Cyberacme, Sekiguchi, MIDA, Traxus, and NuCal/Nucaloric.",
      ),
    ).toEqual([
      "Current sources identify six Marathon factions: Arachne, Cyberacme, Sekiguchi, MIDA, Traxus, and NuCal/Nucaloric.",
    ]);
  });

  it("marks claims supported when source context matches key terms", () => {
    const [claim] = verifyCanonicalClaims({
      title: "Factions",
      summary: null,
      bodyMarkdown:
        "## Overview\n\nCurrent sources identify six Marathon factions: Arachne, Cyberacme, Sekiguchi, MIDA, Traxus, and NuCal/Nucaloric.",
      sourceReferences: [
        buildSource(
          "source_factions",
          "Faction source",
          "PC Gamer reports that Bungie revealed six Marathon factions: Arachne, Cyberacme, Sekiguchi, MIDA, Traxus, and NuCal/Nucaloric.",
        ),
      ],
    });

    expect(claim).toMatchObject({
      status: "supported",
      matchedSourceIds: ["source_factions"],
      matchedSourceKeys: ["factions-source"],
    });
    expect(claim?.supportScore).toBeGreaterThan(0.35);
  });

  it("marks unsupported claims without matching source terms", () => {
    const [claim] = verifyCanonicalClaims({
      title: "Factions",
      summary: null,
      bodyMarkdown:
        "## Overview\n\nCurrent sources identify a playable city-building mode for Marathon faction settlements.",
      sourceReferences: [
        buildSource(
          "source_factions",
          "Faction source",
          "PC Gamer reports that Bungie revealed six Marathon factions: Arachne, Cyberacme, Sekiguchi, MIDA, Traxus, and NuCal/Nucaloric.",
        ),
      ],
    });

    expect(claim).toMatchObject({
      status: "unsupported",
      matchedSourceIds: [],
    });
    expect(claim?.missingTerms).toEqual(
      expect.arrayContaining(["playable", "city", "building", "settlements"]),
    );
  });

  it("marks official-list claims contradicted when source context denies that status", () => {
    const [claim] = verifyCanonicalClaims({
      title: "Factions",
      summary: null,
      bodyMarkdown:
        "## Overview\n\nBungie has published an official canonical list of Marathon factions.",
      sourceReferences: [
        buildSource(
          "source_factions",
          "Faction source",
          "Coverage names Marathon factions but says there is no official canonical list of all faction names yet.",
        ),
      ],
    });

    expect(claim).toMatchObject({
      status: "contradicted",
      matchedSourceIds: ["source_factions"],
    });
  });

  it("does not contradict claims that source context also says no official list exists", () => {
    const [claim] = verifyCanonicalClaims({
      title: "Factions",
      summary: null,
      bodyMarkdown:
        "## Overview\n\nPublic sources say Bungie has not published an official canonical list of Marathon factions, but names include Arachne, Cyberacme, Sekiguchi, MIDA, Traxus, and NuCal/Nucaloric.",
      sourceReferences: [
        buildSource(
          "source_factions",
          "Faction source",
          "Coverage names Arachne, Cyberacme, Sekiguchi, MIDA, Traxus, and NuCal/Nucaloric and says there is no official canonical list of all faction names yet.",
        ),
      ],
    });

    expect(claim).toMatchObject({
      status: "supported",
      matchedSourceIds: ["source_factions"],
    });
  });
});

function buildSource(
  id: string,
  title: string,
  contextText: string,
): WikiSourceReference {
  return {
    id,
    sourceKey: "factions-source",
    sourceType: "editorial_reference",
    title,
    url: "https://example.com/source",
    publisher: "Example",
    contextText,
    topicSlugs: ["factions"],
    retrievedAt: new Date("2026-07-06T00:00:00.000Z"),
    metadata: {
      origin: "test",
      authorityTier: "reputable_editorial",
      authorityScore: 80,
    },
  };
}

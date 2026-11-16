import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { figureSpecs } from "../../src/wiki/figure-data.ts";
import marathon from "../../themes/marathon/theme.ts";
import { checkImages, imageSize } from "./rules.ts";

const root = new URL("../../", import.meta.url);
const json = (path: string) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const registry = json("content/marathon/images.json");
const specs: Array<{ slug: string; category: string }> = json("content/marathon/pages.json");
const generated: Array<{ slug: string; aiProvenance?: { claimSupport?: never[] } }> = json("content/marathon/generated/pages.json");
const pages = specs.map((spec) => ({
  slug: spec.slug,
  category: spec.category,
  claims: generated.find((page) => page.slug === spec.slug)?.aiProvenance?.claimSupport ?? [],
}));
const readFile = (path: string) => {
  const url = new URL(path, root);
  return existsSync(url) ? new Uint8Array(readFileSync(url)) : null;
};
const run = (entries: unknown[], manifest = marathon) =>
  checkImages({ slug: "marathon", manifest, entries, pages, specs: figureSpecs, readFile });
const edit = (id: string, change: Record<string, unknown>) =>
  registry.images.map((image: { id: string }) => (image.id === id ? { ...image, ...change } : image));

describe("image license gate", () => {
  it("passes the committed registry", () => {
    expect(run(registry.images).errors).toEqual([]);
  });

  it("fails when an entry loses its credit, naming the id and the field", () => {
    const entries = registry.images.map((image: { id: string; credit?: string }) => {
      if (image.id !== "proxima-b-surface") return image;
      const { credit: _credit, ...rest } = image;
      return rest;
    });
    expect(run(entries).errors.join("\n")).toMatch(/proxima-b-surface: credit/);
  });

  it("fails an NC license and an unknown one", () => {
    expect(run(edit("proxima-b-surface", { license: "CC-BY-NC-4.0" })).errors.join("\n")).toMatch(/proxima-b-surface: license "CC-BY-NC-4.0"/);
    expect(run(edit("proxima-b-surface", { license: "unknown" })).errors.join("\n")).toMatch(/proxima-b-surface/);
    expect(run(edit("proxima-b-surface", { license: "CC-BY-ND-4.0" })).errors).not.toEqual([]);
  });

  it("fails Tier C on a plate, on a Gameplay hub, or depicting game content", () => {
    expect(run(edit("lhs-3844b-surface", { usedOn: [{ page: "ranked", slot: "plate" }] })).errors.join("\n")).toMatch(/may not fill a plate/);
    const gameplay = { ...marathon, imagery: { ...marathon.imagery!, hubBands: { ...marathon.imagery!.hubBands, gameplay: "lhs-3844b-surface", locations: "x" } } };
    expect(run(edit("lhs-3844b-surface", { usedOn: [{ page: "categories/gameplay", slot: "hub-band" }] }), gameplay).errors.join("\n")).toMatch(/Lore and Locations only/);
    expect(run(edit("lhs-3844b-surface", { depicts: "game-content" })).errors.join("\n")).toMatch(/requires Tier A/);
  });

  it("fails a file that changed after it was registered, and undisclosed modifications", () => {
    expect(run(edit("cosmic-cliffs-mono", { sha256: "0".repeat(64) })).errors.join("\n")).toMatch(/sha256 mismatch/);
    expect(run(edit("cosmic-cliffs-mono", { modifications: "Colour graded" })).errors.join("\n")).toMatch(/modifications must appear/);
  });

  it("fails a Tier B row whose claim isn't on the page", () => {
    expect(run(edit("ranked-run-flow", { generator: { kind: "ranked-run-flow", page: "ranked", claimIds: ["claim_ranked_1"] } })).errors.join("\n")).toMatch(/must equal the claims/);
  });

  it("fails an orphan and an image the manifest names but the registry lacks", () => {
    const manifest = { ...marathon, imagery: { ...marathon.imagery!, homeBand: "missing-image" } };
    const errors = run(registry.images, manifest).errors.join("\n");
    expect(errors).toMatch(/missing-image: named by the theme manifest/);
    expect(errors).toMatch(/cosmic-cliffs-mono/);
  });

  it("reads JPEG dimensions from the header", () => {
    expect(imageSize(readFile("public/img/marathon/eso1629a.jpg")!)).toEqual({ width: 2560, height: 640 });
  });
});

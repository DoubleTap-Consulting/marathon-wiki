import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { figureSpecs } from "../../src/wiki/figure-data.ts";
import marathon from "../../themes/marathon/theme.ts";
import { MOBILE_HERO_MAX_BYTES, checkImages, imageSize } from "./rules.ts";

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
      if (image.id !== "davis-cylinder-endcap") return image;
      const { credit: _credit, ...rest } = image;
      return rest;
    });
    expect(run(entries).errors.join("\n")).toMatch(/davis-cylinder-endcap: credit/);
  });

  it("holds the house collection to public domain or CC0: CC BY, NC, ND and unknown licenses fail", () => {
    expect(run(edit("davis-cylinder-endcap", { license: "CC-BY-NC-4.0" })).errors.join("\n")).toMatch(/davis-cylinder-endcap: license "CC-BY-NC-4.0"/);
    expect(run(edit("davis-cylinder-endcap", { license: "unknown" })).errors.join("\n")).toMatch(/davis-cylinder-endcap/);
    expect(run(edit("davis-cylinder-endcap", { license: "CC-BY-4.0" })).errors.join("\n")).toMatch(/PD or CC0 only/);
    expect(run(edit("trouvelot-orion-nebula", { license: "Unsplash" })).errors.join("\n")).toMatch(/PD or CC0 only/);
  });

  it("fails a Tier C image without its collection record, and a photograph", () => {
    expect(run(edit("davis-cylinder-endcap", { art: undefined })).errors.join("\n")).toMatch(/Tier C needs an art record/);
    const photo = registry.images.find((image: { id: string }) => image.id === "davis-cylinder-endcap");
    expect(run(edit("davis-cylinder-endcap", { art: { ...photo.art, medium: "photograph" } })).errors.join("\n")).toMatch(/davis-cylinder-endcap: art\.medium/);
  });

  it("fails a source narrower than 1600px: swap it for another work in the family", () => {
    expect(run(edit("guidice-bernal-cutaway", { width: 1049, height: 818 })).errors.join("\n")).toMatch(/needs ≥ 1600px/);
  });

  it("fails Tier C on a diagram plate or depicting game content; an article override must be a painting", () => {
    expect(run(edit("davis-cylinder-endcap", { usedOn: [{ page: "categories/locations", slot: "hub-band" }, { page: "ranked", slot: "plate" }] })).errors.join("\n")).toMatch(/may not fill a plate/);
    expect(run(edit("davis-cylinder-endcap", { depicts: "game-content" })).errors.join("\n")).toMatch(/requires Tier A/);
    expect(run(edit("ranked-run-flow", { usedOn: [{ page: "ranked", slot: "article-art" }] })).errors.join("\n")).toMatch(/ranked-run-flow: article-art overrides take a house-collection painting only/);
    const override = run(edit("davis-cylinder-endcap", { usedOn: [{ page: "categories/locations", slot: "hub-band" }, { page: "ranked", slot: "article-art" }] }));
    expect(override.errors).toEqual([]);
  });

  it("fails a rendition that changed, went missing, or is over its byte budget", () => {
    const art = registry.images.find((image: { id: string }) => image.id === "davis-torus-interior").art;
    const renditions = art.renditions.map((r: { crop: string; format: string; width: number }) => r);
    const changed = renditions.map((r: { crop: string; format: string; sha256: string }) => (r.crop === "tall" && r.format === "avif" ? { ...r, sha256: "0".repeat(64) } : r));
    expect(run(edit("davis-torus-interior", { art: { ...art, renditions: changed } })).errors.join("\n")).toMatch(/tall 828w avif: sha256 mismatch/);
    const missing = renditions.filter((r: { crop: string; format: string }) => !(r.crop === "tall" && r.format === "webp"));
    expect(run(edit("davis-torus-interior", { art: { ...art, renditions: missing } })).errors.join("\n")).toMatch(/missing tall 828w webp rendition/);
    // A tall AVIF the size of the 2400w wide one is over the mobile hero budget.
    const wide = renditions.find((r: { crop: string; format: string; width: number }) => r.crop === "wide" && r.format === "avif" && r.width === 2400);
    const heavy = renditions.map((r: { crop: string; format: string }) => (r.crop === "tall" && r.format === "avif" ? { ...wide, crop: "tall", width: 828 } : r));
    expect(run(edit("davis-torus-interior", { art: { ...art, renditions: heavy } })).errors.join("\n")).toMatch(new RegExp(`over the ${MOBILE_HERO_MAX_BYTES}-byte budget`));
  });

  it("keeps every mobile hero (tall 828w AVIF) at or under the old band's 18,741 bytes", () => {
    for (const image of registry.images.filter((entry: { art?: unknown }) => entry.art)) {
      const tall = image.art.renditions.find((r: { crop: string; format: string }) => r.crop === "tall" && r.format === "avif");
      expect(tall.bytes, image.id).toBeLessThanOrEqual(MOBILE_HERO_MAX_BYTES);
    }
  });

  it("fails undisclosed modifications", () => {
    expect(run(edit("davis-torus-interior", { modifications: "Colour graded" })).errors.join("\n")).toMatch(/modifications must appear/);
  });

  it("fails a Tier B row whose claim isn't on the page", () => {
    expect(run(edit("ranked-run-flow", { generator: { kind: "ranked-run-flow", page: "ranked", claimIds: ["claim_ranked_1"] } })).errors.join("\n")).toMatch(/must equal the claims/);
  });

  it("fails an orphan and an image the manifest names but the registry lacks", () => {
    const manifest = { ...marathon, imagery: { ...marathon.imagery!, homeBand: "missing-image" } };
    const errors = run(registry.images, manifest).errors.join("\n");
    expect(errors).toMatch(/missing-image: named by the theme manifest/);
    expect(errors).toMatch(/davis-torus-interior/);
  });

  it("fails the build on placeholder caption, alt or approval copy", () => {
    const fails = (id: string, change: Record<string, unknown>, field: RegExp) =>
      expect(run(edit(id, change)).errors.join("\n")).toMatch(field);
    fails("davis-cylinder-endcap", { caption: "Caption pending" }, /davis-cylinder-endcap: caption is placeholder copy/);
    fails("davis-cylinder-endcap", { alt: "TODO describe the image" }, /davis-cylinder-endcap: alt is placeholder copy/);
    fails("davis-cylinder-endcap", { approvedBy: "pending" }, /davis-cylinder-endcap: approvedBy is placeholder copy/);
    fails("davis-cylinder-endcap", { captionAuthor: "pending-human" }, /davis-cylinder-endcap: captionAuthor/);
    fails("trouvelot-orion-nebula", { caption: "" }, /trouvelot-orion-nebula: caption is required/);
    fails("ranked-run-flow", { alt: "Flow of {network}" }, /ranked-run-flow: a generated diagram's caption and alt come from its data/);
    fails("ranked-run-flow", { captionAuthor: "human", alt: "x", caption: "y" }, /ranked-run-flow: Tier B captions and alt are generated/);
    fails("ranked-run-flow", { title: "Placeholder title" }, /ranked-run-flow: title must match/);
  });

  it("reads AVIF and WebP dimensions from the header", () => {
    expect(imageSize(readFile("public/img/marathon/art/davis-torus-interior-tall-828.avif")!)).toEqual({ width: 828, height: 789 });
    expect(imageSize(readFile("public/img/marathon/art/davis-torus-interior-wide-1600.webp")!)).toEqual({ width: 1600, height: 800 });
  });
});

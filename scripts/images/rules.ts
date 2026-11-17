// The image license gate's rules, as a pure function so tests can feed it broken registries.
// scripts/images/check.ts wires it to the files on disk and fails the build on any error.
import { createHash } from "node:crypto";

import { imageAsset, type ArtRendition, type ImageAsset } from "../../content/imagery-schema.ts";
import { claimStates, figureAlt, figureCaptionTitle, type ClaimLike, type FigureSpec } from "../../src/wiki/figure-data.ts";
import type { ThemeManifest } from "../../themes/types.ts";

export type GatePage = { slug: string; category: string; claims: ClaimLike[] };
export type GateInput = {
  slug: string;
  manifest: ThemeManifest;
  /** Raw registry entries, before parsing: a bad license or missing field must name the entry. */
  entries: unknown[];
  /** Page specs (slug → category) and the generated claims per page. */
  pages: GatePage[];
  specs: Record<string, FigureSpec>;
  readFile: (path: string) => Uint8Array | null;
};

const SLOT_MIN_WIDTH = { "home-band": 2560, "hub-band": 2560, "article-art": 1600, plate: 1600, inline: 1600 } as const;
const HOUSE_LICENSES = new Set(["PD-US-GOV", "PD-US-EXPIRED", "CC0-1.0"]);
/** A painting whose best source is narrower than this is swapped for another work in its family. */
export const ART_MIN_SOURCE_WIDTH = 1600;
/**
 * The mobile hero (tall 828w AVIF) may weigh no more than the band it replaced: the old home band
 * (weic2205a-mono, 828w AVIF at q60 from the Next optimizer) was 18,741 bytes. Prod LCP had 65 ms of headroom.
 */
export const MOBILE_HERO_MAX_BYTES = 18_741;
/** Every painting ships these renditions, each in AVIF and WebP (spec: Performance). */
export const REQUIRED_RENDITIONS = { wide: [828, 1600, 2400], tall: [828], strip: [828, 1600, 2400], full: [640] } as const;
/** AVIF ceilings per width; WebP is the fallback for browsers without AVIF and may weigh 2.5× as much. */
const AVIF_MAX_BYTES: Record<number, number> = { 640: 100 * 1024, 828: 60 * 1024, 1600: 120 * 1024, 2400: 220 * 1024 };
const WEBP_FACTOR = 2.5;

export function checkRenditions(renditions: ArtRendition[], readFile: GateInput["readFile"]) {
  const errors: string[] = [];
  for (const [crop, widths] of Object.entries(REQUIRED_RENDITIONS))
    for (const width of widths)
      for (const format of ["avif", "webp"] as const)
        if (!renditions.some((r) => r.crop === crop && r.width === width && r.format === format)) errors.push(`missing ${crop} ${width}w ${format} rendition`);
  for (const r of renditions) {
    const name = `${r.crop} ${r.width}w ${r.format}`;
    if (!/^public\/img\/[a-z0-9-]+\/art\/[\w.-]+\.(?:avif|webp)$/.test(r.file) || !r.file.endsWith(`.${r.format}`)) errors.push(`${name}: file ${r.file} must be public/img/<slug>/art/*.${r.format}`);
    const bytes = readFile(r.file);
    if (!bytes) {
      errors.push(`${name}: file ${r.file} not found`);
      continue;
    }
    if (createHash("sha256").update(bytes).digest("hex") !== r.sha256) errors.push(`${name}: sha256 mismatch for ${r.file}`);
    if (bytes.byteLength !== r.bytes) errors.push(`${name}: registry says ${r.bytes} bytes, file is ${bytes.byteLength}`);
    const size = imageSize(bytes);
    if (!size || size.width !== r.width || size.height !== r.height) errors.push(`${name}: dimensions ${size ? `${size.width}×${size.height}` : "unreadable"} don't match ${r.width}×${r.height}`);
    const avifCap = r.crop === "tall" ? MOBILE_HERO_MAX_BYTES : AVIF_MAX_BYTES[r.width];
    const cap = avifCap === undefined ? undefined : r.format === "avif" ? avifCap : Math.round(avifCap * WEBP_FACTOR);
    if (cap === undefined) errors.push(`${name}: no byte budget for ${r.width}w`);
    else if (bytes.byteLength > cap) errors.push(`${name}: ${bytes.byteLength} bytes is over the ${cap}-byte budget`);
  }
  return errors;
}
/** Master file ceiling; the served AVIF budget (band ≤ 120 KB at 1280) is checked on the preview. */
const MAX_MASTER_BYTES = 512 * 1024;
const PLACEHOLDER = /\b(?:pending|placeholder|todo|tbd|tk|lorem|ipsum|fixme|xxx)\b|\{[^}]*\}/i;
const BANNED_LICENSE = /\b(NC|ND|GFDL|GPL|unknown)\b/i;

export function checkImages(input: GateInput) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const fail = (id: string, message: string) => errors.push(`${input.slug}/${id}: ${message}`);
  const images: ImageAsset[] = [];

  input.entries.forEach((entry, index) => {
    const id = (entry as { id?: unknown })?.id;
    const name = typeof id === "string" ? id : `#${index}`;
    const license = (entry as { license?: unknown })?.license;
    if (typeof license === "string" && BANNED_LICENSE.test(license)) {
      fail(name, `license "${license}" is not allowed (NC, ND, GFDL, GPL and unknown licenses fail)`);
      return;
    }
    const parsed = imageAsset.safeParse(entry);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) fail(name, `${issue.path.join(".") || "entry"}: ${issue.message}`);
      return;
    }
    images.push(parsed.data);
  });

  const ids = new Set<string>();
  for (const image of images) {
    if (ids.has(image.id)) fail(image.id, "duplicate id");
    ids.add(image.id);
  }

  const imagery = input.manifest.imagery;
  const tiers = new Set(imagery?.tiers ?? []);
  const referenced = new Map<string, string>(); // id → slot it fills in the manifest
  if (imagery?.homeBand) referenced.set(imagery.homeBand, "home-band");
  for (const id of Object.values(imagery?.hubBands ?? {})) referenced.set(id, "hub-band");
  for (const [id] of referenced) if (!ids.has(id)) fail(id, "named by the theme manifest but missing from the registry");

  const pageBySlug = new Map(input.pages.map((page) => [page.slug, page]));

  for (const image of images) {
    const f = (message: string) => fail(image.id, message);
    if (!tiers.has(image.tier)) f(`tier ${image.tier} is not in the manifest's imagery.tiers`);

    // 2. License allow-list per tier.
    const lic = image.license;
    if (image.tier === "A") {
      const ok =
        (lic === "Bungie-written-permission" && image.permissionRef) || (lic === "Fair-use" && imagery?.fairUse?.approvedRef);
      if (!ok) f(`Tier A needs Bungie-written-permission with permissionRef, or Fair-use with imagery.fairUse.approvedRef (got ${lic})`);
    } else if (image.tier === "B") {
      if (lic !== "Own") f(`Tier B must be Own (got ${lic})`);
      if (!image.generator) f("Tier B needs a generator");
    } else if (image.tier === "C") {
      // Tier C is the house collection: public-domain or CC0 paintings, nothing else (SPEC-art-direction).
      if (!HOUSE_LICENSES.has(lic)) f(`license ${lic} is not allowed for Tier C (house collection is PD or CC0 only)`);
      if (!image.art) f("Tier C needs an art record (family, medium, rightsStatus, renditions)");
      else if ((lic === "CC0-1.0") !== (image.art.rightsStatus === "CC0")) f(`rightsStatus ${image.art.rightsStatus} doesn't match license ${lic}`);
    } else if (image.tier === "D") {
      if (!["CC0-1.0", "CC-BY-4.0", "CC-BY-SA-4.0"].includes(lic) || !image.permissionRef)
        f(`Tier D needs CC0, CC BY 4.0 or CC BY-SA 4.0 with permissionRef (got ${lic})`);
    }
    if (image.licenseSnapshot && !input.readFile(image.licenseSnapshot)) f(`licenseSnapshot ${image.licenseSnapshot} not found`);

    // 3. Required text, and the credit verbatim inside what the caption renders.
    for (const field of ["sourceUrl", "licenseUrl", "author", "credit", "attributionText", "retrievedAt", "approvedBy"] as const) {
      if (!String(image[field] ?? "").trim()) f(`${field} is empty`);
    }
    if (!image.attributionText.includes(image.credit)) f("credit must appear verbatim in attributionText");
    // No placeholder copy reaches production: these fail the build, they don't warn.
    const spec = image.generator ? input.specs[image.generator.kind] : undefined;
    const copy =
      image.captionAuthor === "generated" && spec
        ? { title: spec.title, caption: figureCaptionTitle(spec, 1), alt: figureAlt(spec) }
        : { title: image.title, caption: image.caption, alt: image.alt };
    if (image.captionAuthor === "generated") {
      if (image.tier !== "B" || !spec) f('captionAuthor "generated" is for Tier B diagrams with a generator');
      if (image.caption || image.alt) f("a generated diagram's caption and alt come from its data; leave them empty in the registry");
      if (spec && image.title !== spec.title) f(`title must match the generator's title ("${spec.title}")`);
    } else if (image.tier === "B") f('Tier B captions and alt are generated (captionAuthor "generated")');
    if (!copy.alt.trim()) f("alt is required");
    if (image.tier === "C" && !copy.caption.trim()) f("caption is required");
    for (const [field, text] of Object.entries({ ...copy, approvedBy: image.approvedBy }))
      if (PLACEHOLDER.test(text)) f(`${field} is placeholder copy ("${text.match(PLACEHOLDER)?.[0]}")`);
    if (image.captionAuthor === "source-quotation" && image.captionSourceUrl !== image.sourceUrl) f("a quoted caption needs captionSourceUrl equal to sourceUrl");

    // 4. Honesty rules.
    if (image.depicts === "game-content" && image.tier !== "A") f('depicts "game-content" requires Tier A');
    if (image.tier === "C" && image.depicts !== "atmosphere") f('Tier C must depict "atmosphere"');
    if (image.art && image.tier !== "C") f("only Tier C (the house collection) carries an art record");
    for (const use of image.usedOn) {
      if (image.tier === "C" && use.slot === "plate") f("Tier C may not fill a plate");
      if (use.slot === "article-art") {
        if (image.tier !== "C") f("article-art overrides take a house-collection painting only");
        if (!pageBySlug.has(use.page)) f(`usedOn page ${use.page} is not a page`);
        continue;
      }
      if (image.tier === "C" && use.slot === "inline" && pageBySlug.get(use.page)?.category !== "lore")
        f(`Tier C inline figures are allowed on Lore pages only (${use.page})`);
      if (use.slot === "home-band" || use.slot === "hub-band") {
        if (referenced.get(image.id) !== use.slot) f(`used as ${use.slot} but the manifest doesn't place it there`);
        if (use.slot === "home-band" && use.page !== "home") f('home-band must be on page "home"');
        if (use.slot === "hub-band") {
          const hub = Object.entries(imagery?.hubBands ?? {}).find(([, id]) => id === image.id)?.[0];
          if (use.page !== `categories/${hub}`) f(`hub-band page must be categories/${hub}`);
        }
      } else if (!pageBySlug.has(use.page)) f(`usedOn page ${use.page} is not a page`);
    }

    // 1. No orphans: every entry fills a slot the manifest or an article asks for.
    if (image.tier !== "B" && !referenced.has(image.id) && !image.usedOn.some((use) => use.slot === "inline" || use.slot === "article-art"))
      f("orphan: not placed by the manifest or on any page");

    // Tier B: the generator exists, sits on its own page, and every row is a supported claim there.
    if (image.generator) {
      const spec = input.specs[image.generator.kind];
      const page = pageBySlug.get(image.generator.page);
      if (!spec) f(`generator ${image.generator.kind} is not defined in src/wiki/figure-data.ts`);
      else if (spec.page !== image.generator.page) f(`generator ${spec.kind} draws ${spec.page}, not ${image.generator.page}`);
      if (!image.usedOn.every((use) => use.page === image.generator?.page)) f("a Tier B figure may only appear on its generator's page");
      if (!page) f(`generator page ${image.generator.page} is not a page`);
      if (spec && page) {
        const rowClaims = new Set(spec.rows.map((row) => row.claimId));
        const listed = new Set(image.generator.claimIds);
        if ([...rowClaims].some((id) => !listed.has(id)) || [...listed].some((id) => !rowClaims.has(id)))
          f(`generator.claimIds ${[...listed].join(", ")} must equal the claims the rows draw (${[...rowClaims].join(", ")})`);
        for (const row of spec.rows) {
          const claim = page.claims.find((candidate) => candidate.claimId === row.claimId);
          if (!claim) f(`row ${row.key}: claim ${row.claimId} is not on ${page.slug}`);
          else if (!claimStates(claim, row.match)) f(`row ${row.key}: claim ${row.claimId} is not supported or doesn't state ${row.match.join(" + ")}`);
        }
      }
    }

    // 5. Files: self-hosted, hash and size match, big enough for the slot, within budget.
    if (image.file !== null) {
      if (!/^public\/img\/[a-z0-9-]+\/[\w.-]+\.(?:jpg|jpeg|png|webp|avif)$/.test(image.file)) f(`file ${image.file} must live under public/img/<slug>/`);
      const bytes = input.readFile(image.file);
      if (!bytes) f(`file ${image.file} not found`);
      else {
        const sha = createHash("sha256").update(bytes).digest("hex");
        if (image.sha256 && sha !== image.sha256) f(`sha256 mismatch for ${image.file}`);
        if (!image.sha256) f("sha256 is required for files");
        const size = imageSize(bytes);
        if (!size) f(`can't read the dimensions of ${image.file}`);
        else {
          if (size.width !== image.width || size.height !== image.height)
            f(`dimensions ${size.width}×${size.height} don't match the registry (${image.width}×${image.height})`);
          for (const use of image.usedOn)
            if (size.width < SLOT_MIN_WIDTH[use.slot]) f(`${use.slot} needs a master ≥ ${SLOT_MIN_WIDTH[use.slot]}px wide`);
        }
        if (bytes.byteLength > MAX_MASTER_BYTES) f(`master is ${Math.round(bytes.byteLength / 1024)} KB (max ${MAX_MASTER_BYTES / 1024} KB)`);
      }
      if (image.tier === "B") f("Tier B is rendered SVG; file must be null");
    } else if (image.tier !== "B" && !image.art) f("file is required outside Tier B and the house collection");
    if (image.art) {
      if (image.file !== null) f("a house-collection painting serves its renditions; file must be null");
      if (image.width < ART_MIN_SOURCE_WIDTH) f(`source is ${image.width}px wide; the house collection needs ≥ ${ART_MIN_SOURCE_WIDTH}px (swap for another work in the family)`);
      for (const error of checkRenditions(image.art.renditions, input.readFile)) f(error);
    }

    // 6. Changes are disclosed in the visible credit.
    if (image.modifications && !image.attributionText.includes(image.modifications)) f("modifications must appear in attributionText");
  }

  return { errors, warnings, images };
}

const ascii = (bytes: Uint8Array, at: number, length: number) => String.fromCharCode(...bytes.subarray(at, at + length));

/** Width and height of a JPEG, PNG, WebP or AVIF, from its header. */
export function imageSize(bytes: Uint8Array): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return { width: view.getUint32(16), height: view.getUint32(20) };
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    const chunk = ascii(bytes, 12, 4);
    if (chunk === "VP8X") return { width: 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)), height: 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) };
    if (chunk === "VP8 ") return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    if (chunk === "VP8L") {
      const bits = view.getUint32(21, true);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    return null;
  }
  if (ascii(bytes, 4, 4) === "ftyp" && /avif|avis/.test(ascii(bytes, 8, 4))) {
    // The first image spatial extents ("ispe") property: 4 bytes version/flags, then width and height.
    for (let at = 0; at + 16 < bytes.length && at < 4096; at++)
      if (bytes[at] === 0x69 && ascii(bytes, at, 4) === "ispe") return { width: view.getUint32(at + 8), height: view.getUint32(at + 12) };
    return null;
  }
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    const length = view.getUint16(offset + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

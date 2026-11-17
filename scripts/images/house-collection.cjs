// Builds the house-collection renditions (SPEC-art-direction): crop each painting for its surfaces, resize,
// soften the part that sits under the 0.85 ink scrim (it is ~15% visible there, and detail under it costs
// bytes the mobile LCP budget can't spare), then encode AVIF and WebP into public/img/<slug>/art/.
//
//   ART_SOURCES=/path/to/downloaded/masters node scripts/images/house-collection.cjs marathon
//
// Masters are the files at each record's fileUrl (content/<slug>/art-works.json names them); they are not
// committed. After a run, update the registry's renditions from the printed manifest.
const { createRequire } = require("node:module");
const sharp = createRequire(require.resolve("next"))("sharp");
const fs = require("fs");
const path = require("path");
sharp.cache(false);
const slug = process.argv[2];
const root = path.join(__dirname, "../..");
const OUT = path.join(root, "public/img", slug, "art");
const works = JSON.parse(fs.readFileSync(path.join(root, "content", slug, "art-works.json"), "utf8")).map((work) => ({
  ...work,
  src: path.join(process.env.ART_SOURCES, work.master),
}));
fs.mkdirSync(OUT, { recursive: true });
const CROPS = {
  wide: { aspect: 2, widths: [828, 1600, 2400], soften: 0.44, pre: 0.4, q: { avif: 42, webp: 50 } },
  tall: { aspect: 1.05, widths: [828], soften: 0.42, pre: 1.0, q: { avif: 40, webp: 45 } },
  strip: { aspect: 4, widths: [828, 1600, 2400], soften: 0.42, pre: 0.4, q: { avif: 42, webp: 50 } },
  full: { aspect: null, widths: [640], soften: null, pre: 0.5, q: { avif: 38, webp: 50 } },
};
async function render(src, box, w, h, softenAt, spec_pre) {
  const meta = await sharp(src, { limitInputPixels: false }).metadata();
  const [x0, y0, x1, y1] = box;
  const left = Math.round(x0 * meta.width), top = Math.round(y0 * meta.height);
  const cw = Math.round((x1 - x0) * meta.width), ch = Math.round((y1 - y0) * meta.height);
  const crisp = await sharp(src, { limitInputPixels: false }).extract({ left, top, width: cw, height: ch }).resize(w, h, { fit: "cover", kernel: "lanczos3" }).blur(spec_pre || 0.3).removeAlpha().raw().toBuffer();
  const soft = softenAt === null ? crisp : await sharp(crisp, { raw: { width: w, height: h, channels: 3 } }).blur(Math.max(4, w / 100)).raw().toBuffer();
  // Feathered vertical mix: crisp above softenAt-0.06, soft below softenAt+0.04.
  const out = Buffer.alloc(w * h * 3);
  const a0 = softenAt === null ? Infinity : (softenAt - 0.08) * h, a1 = softenAt === null ? Infinity : (softenAt + 0.04) * h;
  let sum = [0, 0, 0];
  for (let y = 0; y < h; y++) {
    const t = a0 === Infinity ? 0 : Math.min(1, Math.max(0, (y - a0) / (a1 - a0)));
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      for (let c = 0; c < 3; c++) { out[i + c] = Math.round(crisp[i + c] * (1 - t) + soft[i + c] * t); sum[c] += crisp[i + c]; }
    }
  }
  const n = w * h;
  const dominant = "#" + sum.map((s) => Math.round(s / n).toString(16).padStart(2, "0")).join("");
  return { img: sharp(out, { raw: { width: w, height: h, channels: 3 } }), dominant };
}
(async () => {
  const manifestPath = process.env.ART_MANIFEST ?? path.join(require("node:os").tmpdir(), `${slug}-art-manifest.json`);
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : {};
  const only = process.env.ART_ONLY ? new Set(process.env.ART_ONLY.split(",")) : null;
  for (const work of works) {
    if (only && !only.has(work.id)) continue;
    // ART_CROPS=tall rebuilds only those crops and keeps the work's other renditions in the manifest.
    const crops = process.env.ART_CROPS ? new Set(process.env.ART_CROPS.split(",")) : null;
    const kept = crops ? (manifest[work.id]?.renditions ?? []).filter((r) => !crops.has(r.crop)) : [];
    manifest[work.id] = { ...(crops ? manifest[work.id] : {}), renditions: kept };
    for (const [crop, spec] of Object.entries(CROPS)) {
      const box = work.crops[crop]; const q = { ...spec.q, ...(work.q?.[crop] ?? {}) };
      if (!box || (crops && !crops.has(crop))) continue;
      for (const w of spec.widths) {
        const aspect = spec.aspect ?? work.fullAspect; const h = Math.round(w / aspect);
        const { img, dominant } = await render(work.src, box, w, h, spec.soften, work.pre?.[crop] ?? spec.pre);
        if (crop === "wide" && w === 828) manifest[work.id].dominant = dominant;
        for (const fmt of ["avif", "webp"]) {
          const file = `${work.id}-${crop}-${w}.${fmt}`;
          const enc = fmt === "avif" ? img.clone().avif({ quality: q.avif, effort: 6, chromaSubsampling: "4:2:0" }) : img.clone().webp({ quality: q.webp, effort: 6, smartSubsample: true });
          await enc.toFile(path.join(OUT, file));
          const bytes = fs.statSync(path.join(OUT, file)).size;
          manifest[work.id].renditions.push({ crop, width: w, height: h, format: fmt, file, bytes });
          const sha256 = require("node:crypto").createHash("sha256").update(fs.readFileSync(path.join(OUT, file))).digest("hex");
          manifest[work.id].renditions.at(-1).sha256 = sha256;
          manifest[work.id].renditions.at(-1).file = `public/img/${slug}/art/${file}`;
          console.log(file, bytes);
        }
      }
    }
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
})();

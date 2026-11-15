/**
 * Copies what the AI editor queue produced on a dev/preview database back into the local runs
 * cache, so `generate.ts --write-only` can rebuild the committed generated files from it.
 *
 *   node --import ./scripts/content/register-ts-paths.mjs scripts/content/export-from-db.ts <slug ...> [--tenant marathon]
 *
 * For each slug it takes the newest outcome of the queue for that page:
 * - a published revision: the cached version moves to runs/<slug>.history.json (unless it was a
 *   version held for review, which was never published) and the revision becomes the current
 *   version (the preview then shows both, with the diff);
 * - a pending AI suggestion (the gate said needs_review): it becomes the current version and the
 *   page's history is cleared, so the committed file files it for Review instead of publishing.
 * Exporting the same version twice changes nothing.
 * Refuses on Vercel and on any database the db-guard cannot prove is non-production. Read-only.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { checkNonProductionTarget } from "../db-guard.mjs";

if (process.env.VERCEL || process.env.VERCEL_ENV) {
  console.error("export-from-db: refusing to run on Vercel.");
  process.exit(1);
}
const root = new URL("../../", import.meta.url).pathname;
const args = process.argv.slice(2);
const tenantIndex = args.indexOf("--tenant");
const tenantSlug = tenantIndex >= 0 ? args[tenantIndex + 1] : "marathon";
const slugs = args.filter((arg, index) => !arg.startsWith("--") && args[index - 1] !== "--tenant");

const envFile = path.join(root, ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (match && ["DATABASE_URL", "DATABASE_URL_UNPOOLED"].includes(match[1]) && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}
const guard = checkNonProductionTarget(process.env);
if (!guard.ok) {
  console.error(`export-from-db: database guard refused: ${guard.reason}.`);
  process.exit(1);
}

const { getDb } = await import("@/src/db/client");
const { CONTENT_SPECS } = await import("@/src/content/editor-store");
const db = getDb();
const runsDir = path.resolve(process.env.CONTENT_WORK_DIR ?? path.join(root, "../marathon-wiki-content"), "runs");

type Provenance = { claimSupport: Array<{ quotes: Array<{ extractId: string }> }>; generatedAt: string } & Record<string, unknown>;

try {
  const tenant = await db.selectFrom("tenants").select(["id"]).where("slug", "=", tenantSlug).executeTakeFirstOrThrow();
  for (const slug of slugs) {
    const spec = CONTENT_SPECS.find((candidate) => candidate.slug === slug);
    if (!spec) throw new Error(`'${slug}' is not in content/marathon/pages.json`);
    const revision = await db
      .selectFrom("wiki_page_revisions as r")
      .innerJoin("wiki_pages as p", "p.id", "r.page_id")
      .select(["r.title", "r.summary", "r.body_markdown", "r.ai_provenance", "r.change_note", "r.created_at", "r.created_by"])
      .where("p.tenant_id", "=", tenant.id)
      .where("p.slug", "=", slug)
      .orderBy("r.revision_number", "desc")
      .executeTakeFirst();
    const suggestion = await db
      .selectFrom("wiki_suggestions")
      .select(["title", "summary", "body_markdown", "metadata", "created_at"])
      .where("tenant_id", "=", tenant.id)
      .where("target_slug", "=", slug)
      .where("status", "=", "pending")
      .orderBy("created_at", "desc")
      .executeTakeFirst();
    const suggestionIsNewer = suggestion && (!revision || suggestion.created_at > revision.created_at);
    const fromQueue = suggestionIsNewer || revision?.created_by !== "content-load-once";
    if (!fromQueue) {
      console.log(`${slug}: the newest version is still the loaded one; nothing to export.`);
      continue;
    }

    const cacheFile = path.join(runsDir, `${slug}.json`);
    const historyFile = path.join(runsDir, `${slug}.history.json`);
    const cached = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, "utf8")) : null;
    const provenance = (suggestionIsNewer ? (suggestion!.metadata as { aiProvenance: Provenance }).aiProvenance : revision!.ai_provenance) as Provenance;
    const changeNote = suggestionIsNewer ? (suggestion!.metadata as { changeNote?: string }).changeNote : revision!.change_note;
    const body = suggestionIsNewer ? suggestion! : revision!;
    // Note ids only mean something in the database they came from; commit what the notes said instead.
    const noteIds = ((provenance as { readerNoteIds?: string[] }).readerNoteIds ?? []).filter(Boolean);
    const notes = noteIds.length
      ? await db.selectFrom("wiki_community_notes").select(["note_type", "body_markdown", "target_quote", "reviewed_by"]).where("tenant_id", "=", tenant.id).where("id", "in", noteIds).execute()
      : [];
    const { readerNoteIds: _ids, ...portable } = provenance as Provenance & { readerNoteIds?: string[] };
    const current = {
      slug,
      title: body.title,
      summary: body.summary ?? "",
      category: spec.category,
      bodyMarkdown: body.body_markdown,
      aiProvenance: {
        ...portable,
        changeNote,
        ...(notes.length ? { readerNotes: notes.map((note) => ({ noteType: note.note_type, note: note.body_markdown, targetQuote: note.target_quote, approvedBy: note.reviewed_by })) } : {}),
      },
      rejected: [],
      citedExtractIds: [...new Set(provenance.claimSupport.flatMap((claim) => claim.quotes.map((quote) => quote.extractId)))],
      citedExtracts: [],
    };

    const decision = (version: { aiProvenance?: object } | null) => (version?.aiProvenance as { publishGate?: { decision?: string } } | undefined)?.publishGate?.decision ?? "publish";
    if (cached && cached.bodyMarkdown === current.bodyMarkdown && decision(cached) === decision(current)) {
      console.log(`${slug}: already exported; nothing to do.`);
      continue;
    }
    if (suggestionIsNewer) {
      if (existsSync(historyFile)) writeFileSync(historyFile, "[]\n");
    } else if (cached && decision(cached) !== "needs_review") {
      // Only published versions belong in the history; a version held for review never was one.
      const history = existsSync(historyFile) ? JSON.parse(readFileSync(historyFile, "utf8")) : [];
      writeFileSync(historyFile, `${JSON.stringify([...history, cached], null, 2)}\n`);
    }
    writeFileSync(cacheFile, JSON.stringify(current, null, 2));
    const gate = (provenance as { publishGate?: { decision: string; reasons: string[] } }).publishGate;
    console.log(`${slug}: exported ${suggestionIsNewer ? "pending suggestion (Review)" : "published revision"}; gate ${gate?.decision}${gate?.reasons?.length ? ` (${gate.reasons.join("; ")})` : ""}.`);
  }
} finally {
  await db.destroy();
}

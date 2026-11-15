/**
 * Local control for the AI editor. This is the preview "manual trigger": the scheduled cron stays
 * Production-only and off unless WIKI_AI_EDITOR_CRON=1.
 *
 *   node --import ./scripts/content/register-ts-paths.mjs scripts/content/editor.ts <command>
 *
 *   status                         queue counts and stored snapshots for the wiki
 *   ingest                         store rendered snapshots in the database and queue pages whose sources changed
 *   enqueue <slug> [--reason r] [--note "..."]
 *                                  queue one page (default reason manual_refresh); --note is an editor instruction
 *                                  the model reads as a hint, never as a source
 *   process [--limit n]            run the worker once (needs an AI Gateway credential); spend is added to
 *                                  the ledger in the content work dir
 *   note <slug> --text "..." [--quote "..."] [--source-url u]
 *                                  file an editor correction as an approved reader note and queue the page
 *                                  (the same path as approving a reader note in Review)
 *   drill [slug] [--model]         full refresh cycle on a throwaway wiki that is deleted afterwards:
 *                                  ingest, write the page, edit a snapshot, detect the change, queue, regenerate, diff.
 *                                  Uses the scripted no-spend model unless --model is given.
 *
 * Options: --tenant <slug> (default marathon), --env-file <path> (default .env.local)
 * Safety: refuses to run on Vercel, and refuses any database the db-guard cannot prove is non-production.
 * Only DATABASE_URL, DATABASE_URL_UNPOOLED, AI_GATEWAY_API_KEY and VERCEL_OIDC_TOKEN are read from the env file. No value is printed.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { createTwoFilesPatch } from "diff";

import { checkNonProductionTarget } from "../db-guard.mjs";

if (process.env.VERCEL || process.env.VERCEL_ENV) {
  console.error("editor: refusing to run on Vercel.");
  process.exit(1);
}

const root = new URL("../../", import.meta.url).pathname;
const args = process.argv.slice(2);
const flag = (name: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? (args[index + 1] ?? "") : null;
};
const has = (name: string) => args.includes(`--${name}`);
const VALUE_FLAGS = ["--tenant", "--reason", "--limit", "--env-file", "--text", "--quote", "--source-url", "--note"];
const positional = args.filter((arg, index) => !arg.startsWith("--") && !VALUE_FLAGS.includes(args[index - 1] ?? ""));
const [command, target] = positional;

const ALLOWED = ["DATABASE_URL", "DATABASE_URL_UNPOOLED", "AI_GATEWAY_API_KEY", "VERCEL_OIDC_TOKEN"];
const envFile = path.resolve(root, flag("env-file") ?? ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (match && ALLOWED.includes(match[1]) && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}
const guard = checkNonProductionTarget(process.env);
if (!guard.ok) {
  console.error(`editor: database guard refused: ${guard.reason}.`);
  process.exit(1);
}

const workDir = path.resolve(process.env.CONTENT_WORK_DIR ?? path.join(root, "../marathon-wiki-content"));
const snapshotDir = path.join(workDir, "snapshots");

const { getDb } = await import("@/src/db/client");
const { CONTENT_SOURCES, CONTENT_SPECS, upsertRenderedSnapshots, loadRenderedSnapshots } = await import("@/src/content/editor-store");
const { enqueueReaderNoteRefresh, enqueueSourceChangeRefreshes } = await import("@/src/content/editor-triggers");
const { createWikiCommunityNote, updateWikiCommunityNoteModerationStatus } = await import("@/src/db/wiki");
const { DEFAULT_RUN_CAP_USD, enqueueAiRefreshQueueItem, processDueAiRefreshQueueItems } = await import("@/src/ai/wiki-refresh-queue");
const { createGatewayCaller, hasGatewayCredential, MemoryLedger } = await import("@/src/content/model-gateway");
const { createScriptedCall } = await import("@/src/content/scripted-call");
type Snapshot = import("@/src/content/editor").Snapshot;

const db = getDb();

function readSnapshots(): Snapshot[] {
  const index = JSON.parse(readFileSync(path.join(snapshotDir, "index.json"), "utf8")) as Record<string, { ok: boolean; sha256: string | null; fetchedAt: string }>;
  return CONTENT_SOURCES.flatMap((source) => {
    const entry = index[source.sourceKey];
    const file = path.join(snapshotDir, `${source.sourceKey}.txt`);
    return entry?.ok && existsSync(file) ? [{ sourceKey: source.sourceKey, text: readFileSync(file, "utf8"), sha256: entry.sha256, fetchedAt: entry.fetchedAt }] : [];
  });
}

async function tenantBySlug(slug: string) {
  const row = await db.selectFrom("tenants").innerJoin("games", "games.id", "tenants.game_id").select(["tenants.id as id", "tenants.slug as slug", "tenants.name as name", "games.slug as gameSlug", "games.title as gameTitle"]).where("tenants.slug", "=", slug).executeTakeFirst();
  if (!row) throw new Error(`No wiki with slug '${slug}' in this database.`);
  return row;
}

function modelCaller(useModel: boolean) {
  if (!useModel) return createScriptedCall();
  if (!hasGatewayCredential()) {
    console.error("editor: no AI Gateway credential (AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN). Nothing was called or spent.");
    process.exit(2);
  }
  const ledger = new MemoryLedger();
  const call = createGatewayCaller({
    ledger,
    capUsd: Number(process.env.WIKI_AI_RUN_CAP_USD ?? DEFAULT_RUN_CAP_USD),
    minIntervalMs: 1_000,
    timeoutMs: Number(process.env.WIKI_AI_CALL_TIMEOUT_MS ?? 180_000),
    log: (message) => console.warn(`editor: ${message}`),
  });
  return Object.assign(call, { ledger });
}

/** Queue runs spend too: add them to the same ledger the generator keeps, so one file holds the total. */
function recordSpend(entries: Array<{ usd: number }>) {
  if (!entries.length) return;
  const file = path.join(workDir, "spend-ledger.json");
  const ledger = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as { totalUsd: number; calls: unknown[] }) : { totalUsd: 0, calls: [] };
  ledger.calls.push(...entries.map((entry) => ({ ...entry, via: "editor-queue" })));
  ledger.totalUsd = ledger.calls.reduce<number>((sum, entry) => sum + ((entry as { usd?: number }).usd ?? 0), 0);
  writeFileSync(file, JSON.stringify(ledger, null, 2));
}

async function status(tenantSlug: string) {
  const tenant = await tenantBySlug(tenantSlug);
  const queue = await db.selectFrom("ai_refresh_queue_items").select(["status", db.fn.countAll<number>().as("count")]).where("tenant_id", "=", tenant.id).groupBy("status").execute();
  const snapshots = await loadRenderedSnapshots(tenant.id, db);
  console.log(JSON.stringify({ tenant: tenant.slug, storedSnapshots: snapshots.length, queue }, null, 2));
}

async function ingest(tenantSlug: string) {
  const tenant = await tenantBySlug(tenantSlug);
  const changes = await upsertRenderedSnapshots({ tenantId: tenant.id, snapshots: readSnapshots() }, db);
  const queued = await enqueueSourceChangeRefreshes({ tenantId: tenant.id, changes }, db);
  const count = (kind: string) => changes.filter((change) => change.kind === kind).length;
  console.log(`editor: ingest ${tenant.slug}: ${count("new")} new, ${count("changed")} changed, ${count("unchanged")} unchanged; ${queued.length} pages queued.`);
}

async function drill(slug: string, useModel: boolean) {
  const spec = CONTENT_SPECS.find((candidate) => candidate.slug === slug);
  if (!spec) throw new Error(`'${slug}' is not in content/marathon/pages.json.`);
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const ids = { game: `drill_${stamp}_game`, tenant: `drill_${stamp}_tenant`, slug: `drill-${stamp}` };
  await db.insertInto("games").values({ id: ids.game, slug: `${ids.slug}-game`, title: "Marathon", franchise: "Marathon", developer: null, publisher: null, release_date: null, metadata: null }).execute();
  await db.insertInto("tenants").values({ id: ids.tenant, game_id: ids.game, slug: ids.slug, name: "Editor drill (temporary)", status: "active", primary_locale: "en" }).execute();
  const call = modelCaller(useModel);
  const report: Record<string, unknown> = { slug, model: useModel ? "gateway" : "scripted (no spend)", tenant: ids.slug };
  try {
    const snapshots = readSnapshots();
    await upsertRenderedSnapshots({ tenantId: ids.tenant, snapshots }, db);
    await enqueueAiRefreshQueueItem({ tenantId: ids.tenant, targetSlug: spec.slug, pageTitle: spec.title, reason: "new_page", source: "drill", scheduledFor: new Date(), dedupeKey: `${ids.tenant}:new` }, db);
    const first = await processDueAiRefreshQueueItems({ tenantId: ids.tenant, limit: 1 }, { db, call });
    if (first.failed.length || first.skipped) throw new Error(`first write failed: ${first.failed[0]?.error ?? first.skipped}`);

    // Edit one cited snapshot the way a source update would, then let change detection take over.
    const before = await db.selectFrom("wiki_pages").select(["id", "body_markdown"]).where("tenant_id", "=", ids.tenant).where("slug", "=", spec.slug).executeTakeFirstOrThrow();
    const revision1 = await db.selectFrom("wiki_page_revisions").select(["ai_provenance"]).where("page_id", "=", before.id).where("revision_number", "=", 1).executeTakeFirstOrThrow();
    const cited = ((revision1.ai_provenance as { sourceReferences?: Array<{ sourceKey: string }> })?.sourceReferences ?? [])[0]?.sourceKey;
    if (!cited) throw new Error("revision 1 cites no source");
    const original = snapshots.find((snapshot) => snapshot.sourceKey === cited)!;
    const removed = original.text.split("\n").filter((line) => line.trim()).slice(0, 4).join("\n");
    const edited: Snapshot = { ...original, text: original.text.replace(removed, ""), sha256: `${original.sha256}-drill-edit`, fetchedAt: new Date().toISOString() };
    const changes = await upsertRenderedSnapshots({ tenantId: ids.tenant, snapshots: [edited] }, db);
    const queued = await enqueueSourceChangeRefreshes({ tenantId: ids.tenant, changes, specs: [spec] }, db);
    const second = await processDueAiRefreshQueueItems({ tenantId: ids.tenant, limit: 5 }, { db, call });

    const revisions = await db.selectFrom("wiki_page_revisions").select(["revision_number", "change_note", "body_markdown", "ai_provenance"]).where("page_id", "=", before.id).orderBy("revision_number").execute();
    const claimCounts = (value: unknown) =>
      ((value as { claimSupport?: Array<{ status: string }> })?.claimSupport ?? []).reduce<Record<string, number>>((acc, claim) => ({ ...acc, [claim.status]: (acc[claim.status] ?? 0) + 1 }), {});
    const suggestions = await db.selectFrom("wiki_suggestions").select(["id", "status"]).where("tenant_id", "=", ids.tenant).execute();
    Object.assign(report, {
      editedSource: cited,
      changeKinds: changes.map((change) => change.kind),
      queued: queued.map((item) => ({ slug: item.targetSlug, reason: item.reason, dedupeKey: item.dedupeKey })),
      secondRun: { processed: second.processed.map((entry) => entry.outcome), failed: second.failed.map((entry) => entry.error), skipped: second.skipped },
      revisions: revisions.map((revision) => ({
        number: revision.revision_number,
        refreshReason: (revision.ai_provenance as { refreshReason?: string })?.refreshReason,
        modelId: (revision.ai_provenance as { modelId?: string })?.modelId,
        gate: (revision.ai_provenance as { publishGate?: { decision: string } })?.publishGate?.decision,
        claims: claimCounts(revision.ai_provenance),
        changeNote: revision.change_note,
      })),
      suggestions,
      diff: revisions.length > 1 ? createTwoFilesPatch(`rev${revisions[0].revision_number}`, `rev${revisions.at(-1)!.revision_number}`, revisions[0].body_markdown, revisions.at(-1)!.body_markdown) : null,
      spendUsd: "ledger" in call ? (call.ledger as InstanceType<typeof MemoryLedger>).totalUsd() : 0,
    });
  } finally {
    if (!has("keep")) {
      await db.deleteFrom("tenants").where("id", "=", ids.tenant).execute();
      await db.deleteFrom("games").where("id", "=", ids.game).execute();
    }
  }
  mkdirSync(path.join(workDir, "drills"), { recursive: true });
  const out = path.join(workDir, "drills", `${stamp}-${slug}.json`);
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, diff: report.diff ? `${String(report.diff).split("\n").length} lines (see ${out})` : null }, null, 2));
}

const tenantSlug = flag("tenant") || "marathon";
try {
  if (command === "status") await status(tenantSlug);
  else if (command === "ingest") await ingest(tenantSlug);
  else if (command === "enqueue") {
    const tenant = await tenantBySlug(tenantSlug);
    const spec = CONTENT_SPECS.find((candidate) => candidate.slug === target);
    const editorNote = flag("note");
    const item = await enqueueAiRefreshQueueItem(
      {
        tenantId: tenant.id,
        targetSlug: target!,
        pageTitle: spec?.title ?? target!,
        reason: flag("reason") || "manual_refresh",
        source: "manual_trigger",
        scheduledFor: new Date(),
        dedupeKey: `manual_trigger:${tenant.id}:${target}:${Date.now()}`,
        ...(editorNote ? { metadata: { editorNote } } : {}),
      },
      db,
    );
    console.log(`editor: queued ${item.targetSlug} (${item.reason}) as ${item.id}.`);
  } else if (command === "note") {
    const tenant = await tenantBySlug(tenantSlug);
    const text = flag("text");
    if (!target || !text) throw new Error('usage: note <slug> --text "..." [--quote "..."]');
    const page = await db.selectFrom("wiki_pages").select(["id", "title"]).where("tenant_id", "=", tenant.id).where("slug", "=", target).executeTakeFirstOrThrow();
    const actorId = "editor-review";
    const note = await createWikiCommunityNote(
      { tenantId: tenant.id, pageId: page.id, noteType: "correction", bodyMarkdown: text, targetQuote: flag("quote"), sourceUrl: flag("source-url"), actorId, metadata: { origin: "human", editorReview: true } },
      db,
    );
    await updateWikiCommunityNoteModerationStatus({ tenantId: tenant.id, noteId: note.id, status: "approved", actorId, reviewNote: "Editor correction from preview review." }, db);
    const item = await enqueueReaderNoteRefresh({ tenantId: tenant.id, noteId: note.id, pageId: page.id, pageSlug: target, pageTitle: page.title }, db);
    console.log(`editor: approved correction note ${note.id} on ${target}; queued ${item.reason} as ${item.id}.`);
  } else if (command === "process") {
    const tenant = await tenantBySlug(tenantSlug);
    const call = modelCaller(true) as ReturnType<typeof createGatewayCaller> & { ledger: InstanceType<typeof MemoryLedger> };
    const result = await processDueAiRefreshQueueItems({ tenantId: tenant.id, limit: Number(flag("limit") ?? 5) }, { db, call });
    recordSpend(call.ledger.entries);
    console.log(
      JSON.stringify(
        {
          processed: result.processed.map((entry) => [entry.pageSlug, entry.outcome, (entry.item.metadata as { changeNote?: string; gateReasons?: string[] } | null)?.changeNote, (entry.item.metadata as { gateReasons?: string[] } | null)?.gateReasons, (entry.item.metadata as { rejected?: unknown[] } | null)?.rejected]),
          failed: result.failed.map((entry) => [entry.item.targetSlug, entry.error]),
          skipped: result.skipped,
          spendUsd: call.ledger.totalUsd(),
        },
        null,
        2,
      ),
    );
  } else if (command === "drill") await drill(target ?? "runner-shells", has("model"));
  else {
    console.error("usage: editor.ts status | ingest | enqueue <slug> | note <slug> --text ... | process | drill [slug] [--model]");
    process.exitCode = 1;
  }
} finally {
  await db.destroy();
}

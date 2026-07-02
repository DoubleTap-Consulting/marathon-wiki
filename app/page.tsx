import { Activity, Database, Rocket } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { checkStorage } from "@/src/db/smoke";
import { getWikiHomeSnapshot, type WikiHomeSnapshot } from "@/src/db/wiki";

export const dynamic = "force-dynamic";

export default async function Home() {
  const storage = await checkStorage();
  const wiki = storage.ok
    ? await loadWikiSnapshot()
    : {
        snapshot: null,
        message: "Seeded wiki data is available after storage connects.",
      };

  return (
    <main className="min-h-screen bg-background">
      <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-6 py-12">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="space-y-6">
            <Badge variant="outline" className="w-fit gap-2">
              <Rocket className="size-3.5" aria-hidden="true" />
              Phase 2 data baseline
            </Badge>

            <div className="space-y-4">
              <h1 className="max-w-3xl text-4xl font-semibold tracking-normal text-foreground sm:text-5xl">
                Marathon Wiki
              </h1>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                A Vercel-ready Next.js foundation for an AI-powered Marathon
                wiki, with the current baseline proving the runtime, storage,
                and reusable tenant data path.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <StatusRow
                icon={<Activity className="size-4" aria-hidden="true" />}
                label="App runtime"
                value="Ready"
                state="ready"
              />
              <StatusRow
                icon={<Database className="size-4" aria-hidden="true" />}
                label="Storage smoke"
                value={
                  storage.ok
                    ? `${storage.latencyMs}ms`
                    : storage.configured
                      ? "Check failed"
                      : "Needs DATABASE_URL"
                }
                state={storage.ok ? "ready" : "pending"}
              />
            </div>
          </div>

          <div className="rounded-lg border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4 border-b pb-4">
              <div>
                <h2 className="text-sm font-medium text-card-foreground">
                  Deployment Health
                </h2>
                <p className="text-sm text-muted-foreground">
                  Backed by the same smoke path as <code>/api/health</code>.
                </p>
              </div>
              <Badge variant={storage.ok ? "success" : "warning"}>
                {storage.ok ? "Connected" : "Pending"}
              </Badge>
            </div>

            <dl className="mt-5 space-y-4 text-sm">
              <HealthDetail label="Service" value="marathon-wiki" />
              <HealthDetail
                label="Database configured"
                value={storage.configured ? "yes" : "no"}
              />
              <HealthDetail label="Checked at" value={storage.checkedAt} />
              <HealthDetail
                label="Result"
                value={storage.ok ? "storage reachable" : storage.message}
              />
            </dl>

            <div className="mt-5 border-t pt-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-medium text-card-foreground">
                    Wiki Data
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Marathon tenant, categories, and starter pages.
                  </p>
                </div>
                <Badge variant={wiki.snapshot ? "success" : "warning"}>
                  {wiki.snapshot ? "Seeded" : "Pending"}
                </Badge>
              </div>

              {wiki.snapshot ? (
                <WikiSeedSummary snapshot={wiki.snapshot} />
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                  {wiki.message}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

async function loadWikiSnapshot(): Promise<{
  snapshot: WikiHomeSnapshot | null;
  message: string;
}> {
  try {
    const snapshot = await getWikiHomeSnapshot();

    return {
      snapshot,
      message: snapshot
        ? "Marathon tenant loaded."
        : "Run the Phase 2 seed after applying migrations.",
    };
  } catch (error) {
    return {
      snapshot: null,
      message:
        error instanceof Error
          ? error.message
          : "Unable to query seeded wiki data.",
    };
  }
}

function StatusRow({
  icon,
  label,
  value,
  state,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  state: "ready" | "pending";
}) {
  return (
    <div className="flex min-h-20 items-center gap-3 rounded-lg border bg-card px-4 py-3 shadow-sm">
      <div className="flex size-9 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div
          className={
            state === "ready"
              ? "truncate font-medium text-foreground"
              : "truncate font-medium text-amber-700"
          }
        >
          {value}
        </div>
      </div>
    </div>
  );
}

function HealthDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[10rem_1fr]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words font-mono text-xs text-card-foreground">
        {value}
      </dd>
    </div>
  );
}

function WikiSeedSummary({ snapshot }: { snapshot: WikiHomeSnapshot }) {
  return (
    <div className="mt-4 space-y-4 text-sm">
      <div className="grid gap-1 sm:grid-cols-[10rem_1fr]">
        <div className="text-muted-foreground">Tenant</div>
        <div className="font-medium text-card-foreground">
          {snapshot.tenant.name}
        </div>
      </div>
      <div className="grid gap-1 sm:grid-cols-[10rem_1fr]">
        <div className="text-muted-foreground">Game</div>
        <div className="text-card-foreground">{snapshot.tenant.gameTitle}</div>
      </div>
      <div className="grid gap-1 sm:grid-cols-[10rem_1fr]">
        <div className="text-muted-foreground">Categories</div>
        <div className="text-card-foreground">
          {snapshot.categories.map((category) => category.name).join(", ")}
        </div>
      </div>
      <div className="grid gap-1 sm:grid-cols-[10rem_1fr]">
        <div className="text-muted-foreground">Starter pages</div>
        <div className="text-card-foreground">
          {snapshot.pages.map((page) => page.title).join(", ")}
        </div>
      </div>
    </div>
  );
}

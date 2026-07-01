import { Activity, Database, Rocket } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { checkStorage } from "@/src/db/smoke";

export const dynamic = "force-dynamic";

export default async function Home() {
  const storage = await checkStorage();

  return (
    <main className="min-h-screen bg-background">
      <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-6 py-12">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="space-y-6">
            <Badge variant="outline" className="w-fit gap-2">
              <Rocket className="size-3.5" aria-hidden="true" />
              Phase 1 deploy baseline
            </Badge>

            <div className="space-y-4">
              <h1 className="max-w-3xl text-4xl font-semibold tracking-normal text-foreground sm:text-5xl">
                Marathon Wiki
              </h1>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                A Vercel-ready Next.js foundation for an AI-powered Marathon
                wiki, with the first deployment focused on proving the runtime
                and storage path.
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
          </div>
        </div>
      </section>
    </main>
  );
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

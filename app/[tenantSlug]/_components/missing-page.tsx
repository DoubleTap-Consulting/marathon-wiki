import { BookOpen } from "lucide-react";

export function MissingWikiPage({
  tenantSlug,
  title,
  description,
}: {
  tenantSlug: string;
  title: string;
  description: string;
}) {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-5 py-12 sm:px-6">
        <div className="rounded-lg border bg-card p-6 text-card-foreground">
          <div className="flex size-11 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
            <BookOpen className="size-5" aria-hidden="true" />
          </div>
          <h1 className="mt-5 text-2xl font-semibold leading-9">{title}</h1>
          <p className="mt-2 text-base leading-7 text-muted-foreground">
            {description}
          </p>
          <a
            href={`/${tenantSlug}`}
            className="mt-6 inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
          >
            Go to wiki home
          </a>
        </div>
      </div>
    </main>
  );
}

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
        <div className="border bg-card p-6 text-card-foreground">
          <div className="flex size-11 items-center justify-center bg-secondary text-secondary-foreground">
            <BookOpen className="size-5" aria-hidden="true" />
          </div>
          <h1 className="mt-5 text-title font-display">{title}</h1>
          <p className="mt-2 text-ui text-muted-foreground">
            {description}
          </p>
          <a
            href={`/${tenantSlug}`}
            className="mt-6 inline-flex min-h-11 items-center border border-foreground bg-primary px-4 hover:bg-primary-hover dark:border-transparent text-ui font-medium text-primary-foreground"
          >
            Go to wiki home
          </a>
        </div>
      </div>
    </main>
  );
}

import { Skeleton } from "@/components/ui/skeleton";

export default function ArticleLoading() {
  return (
    <div className="mx-auto w-full max-w-[1240px] px-5 pt-20 md:px-8 lg:grid lg:grid-cols-[200px_minmax(0,1fr)_280px] lg:gap-12 lg:pt-24">
      <div className="hidden space-y-3 lg:block">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-36" />
      </div>
      <div className="max-w-[68ch]" aria-busy="true" aria-label="Loading article">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-3 h-9 w-2/3" />
        <div className="mt-4 flex gap-2">
          <Skeleton className="h-5 w-36 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <div className="mt-8 space-y-3">
          {[100, 96, 92, 98, 88, 70].map((width) => (
            <Skeleton key={width} className="h-4" style={{ width: `${width}%` }} />
          ))}
        </div>
      </div>
      <div className="hidden lg:block">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-3 h-24 w-full" />
      </div>
    </div>
  );
}

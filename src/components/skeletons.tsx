/** Placeholder shapes shown by loading.tsx while a page's data streams in. */
function Bar({ className }: { className: string }) {
  return <span className={`block animate-pulse rounded bg-surface-muted ${className}`} />;
}

export function RankingsSkeleton() {
  return (
    <div role="status" aria-label="Loading rankings">
      <div className="mb-5 space-y-2">
        <Bar className="h-8 w-48" />
        <Bar className="h-4 w-32" />
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-border px-3 py-2.5 last:border-0">
            <Bar className="h-4 w-6" />
            <Bar className="size-8 rounded-full" />
            <Bar className="h-4 flex-1" />
            <Bar className="h-4 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function PlayerSkeleton() {
  return (
    <div role="status" aria-label="Loading player" className="space-y-6">
      <Bar className="h-4 w-28" />
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-end">
        <Bar className="size-28 rounded-full sm:size-36" />
        <div className="space-y-2">
          <Bar className="h-4 w-10" />
          <Bar className="h-9 w-56" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Bar key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

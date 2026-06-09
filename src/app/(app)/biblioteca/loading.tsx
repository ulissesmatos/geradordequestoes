export default function LibraryLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-9 w-48 animate-pulse rounded-md bg-[var(--muted)]" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded-md bg-[var(--muted)]" />
      </div>
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-9 w-24 shrink-0 animate-pulse rounded-full bg-[var(--muted)]" />
        ))}
      </div>
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
        <div className="h-5 w-36 animate-pulse rounded-md bg-[var(--muted)]" />
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-md bg-[var(--muted)]" />
          ))}
        </div>
      </div>
    </div>
  );
}

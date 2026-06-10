export default function DashboardLoading() {
  return (
    <div className="relative left-1/2 right-1/2 -mx-[50vw] -my-8 flex h-[calc(100svh-61px)] w-screen overflow-hidden bg-[var(--background)] md:h-[calc(100vh-73px)]">
      <div className="hidden w-72 border-r border-[var(--border)] bg-[var(--surface-subtle)] p-3 md:block">
        <div className="h-9 w-full animate-pulse rounded-md bg-[var(--muted)]" />
        <div className="mt-4 space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-8 w-full animate-pulse rounded-md bg-[var(--muted)]" />
          ))}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col items-center justify-end px-4 pb-8">
        <div className="w-full max-w-3xl space-y-4">
          <div className="h-16 w-2/3 animate-pulse rounded-lg bg-[var(--muted)]" />
          <div className="ml-auto h-12 w-1/2 animate-pulse rounded-lg bg-[var(--muted)]" />
          <div className="h-24 w-full animate-pulse rounded-xl bg-[var(--muted)]" />
        </div>
      </div>
    </div>
  );
}

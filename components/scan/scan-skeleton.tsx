// Shaped like the loaded page (title, status line, photo, then region rows) so nothing jumps when data arrives.
export function ScanSkeleton() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="Loading the scan">
      <div className="flex flex-col gap-3">
        <div className="h-10 w-56 rounded-md bg-muted" />
        <div className="h-7 w-32 rounded-md bg-muted" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="aspect-[3/4] w-full rounded-md bg-muted" />
        <div className="flex flex-col gap-4">
          <div className="h-8 w-40 rounded-md bg-muted" />
          <div className="h-5 w-full rounded-md bg-muted" />
          <div className="h-5 w-4/5 rounded-md bg-muted" />
        </div>
      </div>
      <span className="sr-only">Loading the scan</span>
    </div>
  );
}

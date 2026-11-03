import type { JobStatus, ScanResult } from "@/lib/schemas";

export type StatusTone = "progress" | "verified" | "flag" | "stamp";

export type StatusView = {
  label: string;
  // One plain sentence for the person waiting. It never interprets the chart.
  detail: string;
  tone: StatusTone;
  terminal: boolean;
  // Position in the four machine stages, so a person waiting sees how far along it is in words, not only
  // a spinner. Null once the machine part is over (nothing left to count).
  step: number | null;
};

/** The machine stages a scan passes through before a person is needed: waiting, finding, reading, checking. */
export const PIPELINE_STEPS = 4;

const VIEWS: Record<JobStatus, StatusView> = {
  queued: { label: "Waiting", detail: "The photo is saved and waiting its turn.", tone: "progress", terminal: false, step: 1 },
  segmenting: { label: "Finding regions", detail: "Marking the parts of the page to read.", tone: "progress", terminal: false, step: 2 },
  reading: { label: "Reading", detail: "Copying what is written in each region.", tone: "progress", terminal: false, step: 3 },
  reconciling: { label: "Checking", detail: "Comparing the readings.", tone: "progress", terminal: false, step: 4 },
  needs_review: { label: "Needs a person", detail: "The readings are ready for someone to check.", tone: "flag", terminal: true, step: null },
  done: { label: "Done", detail: "Everything on this scan has been confirmed.", tone: "verified", terminal: true, step: null },
  failed: { label: "Failed", detail: "This scan could not be finished.", tone: "stamp", terminal: true, step: null },
  // The person's own choice, not a fault, so it is not red. Outlined like the other states with no verdict.
  cancelled: { label: "Cancelled", detail: "Reading was stopped. Nothing was saved to a record.", tone: "progress", terminal: true, step: null },
};

export function describeStatus(status: JobStatus): StatusView {
  return VIEWS[status];
}

// The page title for each state, so the h1 says where the scan is instead of one fixed "Scan results".
// Plain words only: it names the state and never says anything about the chart's content.
const HEADINGS: Record<JobStatus, string> = {
  queued: "Reading your chart",
  segmenting: "Reading your chart",
  reading: "Reading your chart",
  reconciling: "Reading your chart",
  needs_review: "Review the scan",
  done: "Record confirmed",
  failed: "Scan failed",
  cancelled: "Scan cancelled",
};

export const headingFor = (status: JobStatus): string => HEADINGS[status];

export const isTerminal = (status: JobStatus): boolean => VIEWS[status].terminal;

// How long a scan may sit unchanged before the page offers "Try reading again". Longer than the server's
// STALE_AFTER_MS (150 s, in lib/pipeline/run.ts, which this client file must not import), so by the time
// the button shows, the server agrees the run is gone and a retry is accepted.
export const STALL_AFTER_MS = 160_000;

/** Changes whenever a poll shows progress: a new status, new regions, or another reading stored. */
export function progressKey(scan: Pick<ScanResult, "status" | "regions">): string {
  const readings = scan.regions.reduce((n, region) => n + region.readings.length, 0);
  return `${scan.status}:${scan.regions.length}:${readings}`;
}

/**
 * True when a scan that is still being worked on has shown no change (status or readings) for too long.
 * A run that crashes or is killed leaves the status as it was, so without this the page spins forever.
 */
export function isStalled(status: JobStatus, lastChangeAt: number, now: number): boolean {
  if (isTerminal(status)) return false;
  return now - lastChangeAt >= STALL_AFTER_MS;
}

export const POLL_INTERVAL_MS = 2000;
const MAX_POLL_DELAY_MS = 10_000;

/** Normal cadence while healthy; doubles after each failed request, capped. */
export function nextPollDelay(consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) return POLL_INTERVAL_MS;
  return Math.min(POLL_INTERVAL_MS * 2 ** consecutiveFailures, MAX_POLL_DELAY_MS);
}

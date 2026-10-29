import type { JobStatus } from "@/lib/schemas";

export type StatusTone = "progress" | "verified" | "flag" | "stamp";

export type StatusView = {
  label: string;
  // One plain sentence for the person waiting. It never interprets the chart.
  detail: string;
  tone: StatusTone;
  terminal: boolean;
};

const VIEWS: Record<JobStatus, StatusView> = {
  queued: { label: "Waiting", detail: "The photo is saved and waiting its turn.", tone: "progress", terminal: false },
  segmenting: { label: "Finding regions", detail: "Marking the parts of the page to read.", tone: "progress", terminal: false },
  reading: { label: "Reading", detail: "Copying what is written in each region.", tone: "progress", terminal: false },
  reconciling: { label: "Checking", detail: "Comparing the readings.", tone: "progress", terminal: false },
  needs_review: { label: "Needs a person", detail: "The readings are ready for someone to check.", tone: "flag", terminal: true },
  done: { label: "Done", detail: "Everything on this scan has been confirmed.", tone: "verified", terminal: true },
  failed: { label: "Failed", detail: "This scan could not be finished.", tone: "stamp", terminal: true },
};

export function describeStatus(status: JobStatus): StatusView {
  return VIEWS[status];
}

export const isTerminal = (status: JobStatus): boolean => VIEWS[status].terminal;

export const POLL_INTERVAL_MS = 2000;
const MAX_POLL_DELAY_MS = 10_000;

/** Normal cadence while healthy; doubles after each failed request, capped. */
export function nextPollDelay(consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) return POLL_INTERVAL_MS;
  return Math.min(POLL_INTERVAL_MS * 2 ** consecutiveFailures, MAX_POLL_DELAY_MS);
}

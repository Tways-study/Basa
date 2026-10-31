import type { JobStatus } from "@/lib/schemas";
import { describeStatus, type StatusTone } from "@/lib/ui/scan-status";
import type { OutboxItem } from "./types";

export const MAX_ATTEMPTS = 8;
const BASE_DELAY_MS = 2000;
const MAX_DELAY_MS = 60_000;

/** 2 s, 4 s, 8 s ... capped at a minute, so a clinic with bad signal is not hammered and not forgotten. */
export function backoffMs(attempts: number): number {
  if (attempts <= 0) return 0;
  return Math.min(BASE_DELAY_MS * 2 ** (attempts - 1), MAX_DELAY_MS);
}

export function isDue(item: OutboxItem, now: number): boolean {
  return item.status === "saved" && item.nextAttemptAt <= now;
}

/** When the next automatic retry is due, or null when nothing is waiting. */
export function nextDueAt(items: OutboxItem[]): number | null {
  const waiting = items.filter((i) => i.status === "saved").map((i) => i.nextAttemptAt);
  return waiting.length ? Math.min(...waiting) : null;
}

export type ItemView = { label: string; detail: string; tone: StatusTone; serverStatus: JobStatus | null };

/** Plain words for the person. It never mentions queues, retries counts or ids. */
export function describeItem(item: OutboxItem): ItemView {
  switch (item.status) {
    case "saved":
      return {
        label: "Saved on device",
        detail: item.attempts > 0 ? "It could not be sent yet. It will try again by itself." : "It sends as soon as there is a connection.",
        tone: "progress",
        serverStatus: null,
      };
    case "syncing":
      return { label: "Sending", detail: "Sending the photo now.", tone: "progress", serverStatus: null };
    case "synced": {
      const status = item.serverStatus ?? "queued";
      const view = describeStatus(status);
      return { label: view.label, detail: view.detail, tone: view.tone, serverStatus: status };
    }
    case "failed":
      return {
        label: "Not sent",
        detail: item.lastError ?? "This photo could not be sent. Take it again.",
        tone: "stamp",
        serverStatus: null,
      };
  }
}

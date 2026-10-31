import { MAX_ATTEMPTS, backoffMs, isDue } from "./policy";
import type { OutboxItem, OutboxStore, SendResult } from "./types";

type Send = (scanId: string, blob: Blob) => Promise<SendResult>;

export type RunOptions = {
  /** Send every waiting item now, ignoring its backoff. Used for "Sync now", coming online and app start. */
  force?: boolean;
  now?: () => number;
};

/**
 * Sends what is waiting, one photo at a time, and saves each outcome before moving on, so closing the
 * tab mid-run loses nothing. Returns each item's result by scan id.
 *
 * A caller must not run two of these at once on the same store (see client.ts). If a second tab does,
 * the server still sees one scan: a repeat of a known id is a no-op.
 */
export async function runOutbox(store: OutboxStore, send: Send, options: RunOptions = {}): Promise<Map<string, SendResult>> {
  const now = options.now ?? Date.now;
  const results = new Map<string, SendResult>();

  let items = await store.list();
  // Nothing is in flight at the start of a run, so a "syncing" item is left over from a tab that closed mid-send.
  for (const stale of items.filter((i) => i.status === "syncing")) {
    await store.put({ ...stale, status: "saved", nextAttemptAt: 0 });
  }
  items = await store.list();

  const waiting = items
    .filter((i) => (options.force ? i.status === "saved" : isDue(i, now())))
    .sort((a, b) => a.createdAt - b.createdAt);

  for (const item of waiting) {
    if (!item.blob) {
      await store.put({ ...item, status: "failed", lastError: "The saved photo is missing. Take it again." });
      continue;
    }
    await store.put({ ...item, status: "syncing" });
    const result = await send(item.scanId, item.blob);
    results.set(item.scanId, result);
    await store.put(settle(item, result, now()));
  }
  return results;
}

function settle(item: OutboxItem, result: SendResult, at: number): OutboxItem {
  switch (result.kind) {
    case "accepted":
      // The server has the photo; free the space on the device.
      return { ...item, blob: null, status: "synced", serverStatus: result.status, lastError: null };
    case "rejected":
      return { ...item, status: "failed", lastError: result.message };
    case "retry": {
      const attempts = item.attempts + 1;
      if (attempts >= MAX_ATTEMPTS) {
        return { ...item, attempts, status: "failed", lastError: "Still could not send it. Check the connection and try again." };
      }
      return { ...item, attempts, status: "saved", lastError: result.message, nextAttemptAt: at + backoffMs(attempts) };
    }
  }
}

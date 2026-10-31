import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { JobStatus } from "@/lib/schemas";
import { runOutbox } from "./runner";
import { sendScan } from "./send";
import type { OutboxItem, OutboxStore, SendResult } from "./types";

// Browser only: IndexedDB and window events. The logic worth testing lives in runner.ts, policy.ts and send.ts.

interface OutboxDB extends DBSchema {
  items: { key: string; value: OutboxItem };
}

export const OUTBOX_CHANGED = "outbox:changed";
const notify = () => window.dispatchEvent(new Event(OUTBOX_CHANGED));

let dbPromise: Promise<IDBPDatabase<OutboxDB>> | null = null;
function db() {
  // A failed open is not cached, so a later call can try again.
  dbPromise ??= openDB<OutboxDB>("basa-outbox", 1, {
    upgrade(d) {
      d.createObjectStore("items", { keyPath: "scanId" });
    },
  }).catch((err) => {
    dbPromise = null;
    throw err;
  });
  return dbPromise;
}

const store: OutboxStore = {
  async list() {
    return (await db()).getAll("items");
  },
  async put(item) {
    await (await db()).put("items", item);
    notify();
  },
  async remove(scanId) {
    await (await db()).delete("items", scanId);
    notify();
  },
};

/** Capture always saves here first. Throws if this browser cannot store it, so the caller can say so. */
export async function addToOutbox(scanId: string, blob: Blob): Promise<void> {
  await store.put({
    scanId,
    blob,
    status: "saved",
    attempts: 0,
    nextAttemptAt: 0,
    lastError: null,
    createdAt: Date.now(),
    serverStatus: null,
  });
}

export const listOutbox = () => store.list();
export const removeFromOutbox = (scanId: string) => store.remove(scanId);

// One run at a time in this tab. A second request while one is running joins it instead of sending twice.
let running: Promise<Map<string, SendResult>> | null = null;

export function syncOutbox(force = false): Promise<Map<string, SendResult>> {
  running ??= runOutbox(store, (id, blob) => sendScan(id, blob), { force }).finally(() => {
    running = null;
  });
  return running;
}

/** A failed photo gets a fresh set of attempts when the person asks for one. */
export async function retryItem(scanId: string): Promise<void> {
  const item = (await store.list()).find((i) => i.scanId === scanId);
  if (!item) return;
  await store.put({ ...item, status: "saved", attempts: 0, nextAttemptAt: 0, lastError: null });
  await syncOutbox(true);
}

export async function setServerStatus(scanId: string, serverStatus: JobStatus): Promise<void> {
  const item = (await store.list()).find((i) => i.scanId === scanId);
  if (item && item.status === "synced" && item.serverStatus !== serverStatus) await store.put({ ...item, serverStatus });
}

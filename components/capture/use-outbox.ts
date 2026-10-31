"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { z } from "zod";
import { JobStatusSchema } from "@/lib/schemas";
import {
  OUTBOX_CHANGED,
  listOutbox,
  removeFromOutbox,
  retryItem,
  setServerStatus,
  syncOutbox,
} from "@/lib/outbox/client";
import { nextDueAt } from "@/lib/outbox/policy";
import type { OutboxItem } from "@/lib/outbox/types";
import { isTerminal, nextPollDelay } from "@/lib/ui/scan-status";

const StatusOnlySchema = z.object({ status: JobStatusSchema });

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** The outbox for the screen: the items, whether the device is online, and the actions. */
export function useOutbox() {
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [unavailable, setUnavailable] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const all = await listOutbox();
      setItems(all.sort((a, b) => b.createdAt - a.createdAt));
    } catch (err) {
      console.error("outbox read failed:", err instanceof Error ? err.name : "unknown error");
      setUnavailable(true);
    }
  }, []);

  // App start: show what is waiting, and send it. Also whenever the connection comes back, and whenever any tab changes the outbox.
  useEffect(() => {
    // The list is read when the run ends, so it shows the outcome and also covers the first load.
    const sync = () =>
      void syncOutbox(true)
        .catch((err) => console.error("sync failed:", err instanceof Error ? err.name : "unknown error"))
        .finally(refresh);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener(OUTBOX_CHANGED, refresh);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener(OUTBOX_CHANGED, refresh);
    };
  }, [refresh]);

  // A photo that failed to send is retried on its backoff schedule without anyone pressing anything.
  useEffect(() => {
    const due = nextDueAt(items);
    if (due === null || !online) return;
    const timer = setTimeout(() => void syncOutbox(false), Math.max(0, due - Date.now()));
    return () => clearTimeout(timer);
  }, [items, online]);

  // Once the server has a photo, follow it until it needs a person, so the row says what is happening to it.
  const followed = items.filter((i) => i.status === "synced" && i.serverStatus && !isTerminal(i.serverStatus)).map((i) => i.scanId).join(",");
  useEffect(() => {
    if (!followed || !online) return;
    const controller = new AbortController();
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      let failed = false;
      // Each scan on its own, so one bad scan cannot stall the rest.
      for (const id of followed.split(",")) {
        try {
          const res = await fetch(`/api/scans/${id}`, { signal: controller.signal, cache: "no-store" });
          if (res.status === 404) {
            // The server does not know this scan (removed, or never stored). Say so instead of waiting forever.
            await setServerStatus(id, "failed");
            continue;
          }
          if (!res.ok) throw new Error(`The server answered ${res.status}`);
          const parsed = StatusOnlySchema.safeParse(await res.json());
          if (parsed.success) await setServerStatus(id, parsed.data.status);
        } catch (err) {
          if (controller.signal.aborted) return;
          console.error("status poll failed:", err instanceof Error ? err.message : "unknown error");
          failed = true;
        }
      }
      failures = failed ? failures + 1 : 0;
      timer = setTimeout(poll, nextPollDelay(failures));
    }
    timer = setTimeout(poll, nextPollDelay(0));
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [followed, online]);

  return {
    items,
    online,
    unavailable,
    syncNow: () => syncOutbox(true),
    retry: retryItem,
    remove: removeFromOutbox,
  };
}

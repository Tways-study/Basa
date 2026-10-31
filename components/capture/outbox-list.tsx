"use client";

import Link from "next/link";
import { Check, CircleX, Clock, HardDrive, Loader2, RefreshCw, TriangleAlert, WifiOff } from "lucide-react";
import { useState } from "react";
import { useOutbox } from "@/components/capture/use-outbox";
import { StatusBadge } from "@/components/scan/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { describeItem } from "@/lib/outbox/policy";
import type { OutboxItem } from "@/lib/outbox/types";

// Icon and word as well as colour, so a state never rests on colour alone.
function ItemBadge({ item }: { item: OutboxItem }) {
  const view = describeItem(item);
  if (view.serverStatus) return <StatusBadge status={view.serverStatus} />;
  const icon =
    item.status === "saved" ? (
      <HardDrive aria-hidden="true" />
    ) : item.status === "syncing" ? (
      <Loader2 aria-hidden="true" className="motion-safe:animate-spin" />
    ) : (
      <CircleX aria-hidden="true" />
    );
  return (
    <Badge variant={view.tone}>
      {icon}
      {view.label}
    </Badge>
  );
}

const timeOf = (at: number) => new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export function OutboxList() {
  const { items, online, unavailable, syncNow, retry, remove } = useOutbox();
  const [problem, setProblem] = useState<string | null>(null);

  // Every action's failure is shown, not swallowed.
  async function act(run: () => Promise<unknown>) {
    setProblem(null);
    try {
      await run();
    } catch (err) {
      console.error("outbox action failed:", err instanceof Error ? err.name : "unknown error");
      setProblem("That did not work. Try again in a moment.");
    }
  }

  const waiting = items.some((i) => i.status === "saved");

  if (items.length === 0 && online && !unavailable) return null;

  return (
    <section aria-labelledby="outbox-heading" className="flex flex-col gap-3">
      <h2 id="outbox-heading" className="text-2xl font-semibold">
        On this device
      </h2>

      {!online ? (
        <p role="status" className="flex items-start gap-2 rounded-md border border-flag p-3">
          <WifiOff aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <span>You are offline. New photos are saved here and send by themselves when you are back online.</span>
        </p>
      ) : null}

      {unavailable ? (
        <p role="alert" className="flex items-start gap-2 rounded-md border border-flag p-3">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <span>This browser cannot keep photos on the device. Photos send straight away, so stay connected.</span>
        </p>
      ) : null}

      {items.length > 0 ? (
        <ul className="flex flex-col border-t border-ink">
          {items.map((item) => {
            const view = describeItem(item);
            return (
              <li key={item.scanId} className="flex flex-col gap-2 border-b py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <ItemBadge item={item} />
                  <span className="text-sm text-muted-foreground">Photo taken {timeOf(item.createdAt)}</span>
                </div>
                <p>{view.detail}</p>
                <div className="flex flex-wrap gap-2">
                  {item.status === "synced" ? (
                    <>
                      <Button asChild variant="outline">
                        <Link href={`/scans/${item.scanId}`}>
                          <Check aria-hidden="true" />
                          Open scan
                        </Link>
                      </Button>
                      <Button variant="ghost" onClick={() => act(() => remove(item.scanId))}>
                        Clear from this list
                      </Button>
                    </>
                  ) : null}
                  {item.status === "failed" ? (
                    <>
                      <Button variant="outline" onClick={() => act(() => retry(item.scanId))} disabled={!online}>
                        <RefreshCw aria-hidden="true" />
                        Try again
                      </Button>
                      <Button variant="ghost" onClick={() => act(() => remove(item.scanId))}>
                        Discard this photo
                      </Button>
                    </>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {waiting ? (
        <div className="flex flex-col items-start gap-1">
          <Button variant="outline" onClick={() => act(syncNow)} disabled={!online}>
            <Clock aria-hidden="true" />
            Sync now
          </Button>
          {!online ? <p className="text-sm text-muted-foreground">Available when you are back online.</p> : null}
        </div>
      ) : null}

      {problem ? (
        <p role="alert" className="flex items-start gap-2 rounded-md border border-stamp p-3">
          <CircleX aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-stamp" />
          <span>{problem}</span>
        </p>
      ) : null}
    </section>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CircleX, WifiOff } from "lucide-react";
import { RegionBlock } from "@/components/scan/region-block";
import { ScanSkeleton } from "@/components/scan/scan-skeleton";
import { StatusBadge } from "@/components/scan/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { type ScanResult, ScanResultSchema } from "@/lib/schemas";
import { describeStatus, isTerminal, nextPollDelay } from "@/lib/ui/scan-status";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; scan: ScanResult }
  | { kind: "problem"; title: string; detail: string };

export function ScanResults({ scanId }: { scanId: string }) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [offline, setOffline] = useState(false);
  // The API signs a new image URL on every poll. Keep the first one so the photo does not reload
  // every two seconds; swap it only if the image stops loading (the URL lasts an hour).
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;

    async function poll() {
      try {
        const res = await fetch(`/api/scans/${scanId}`, { signal: controller.signal, cache: "no-store" });
        if (res.status === 404) {
          setState({
            kind: "problem",
            title: "We can't find that scan",
            detail: "The link may be wrong, or the scan was removed. Take the photo again to start a new one.",
          });
          return;
        }
        if (!res.ok) throw new Error(`The server answered ${res.status}`);

        const parsed = ScanResultSchema.safeParse(await res.json());
        if (!parsed.success) {
          setState({
            kind: "problem",
            title: "The server sent something unexpected",
            detail: "This page could not understand the reply. Try again in a moment.",
          });
          return;
        }

        failures = 0;
        setOffline(false);
        setState({ kind: "ready", scan: parsed.data });
        setPhotoUrl((current) => current ?? parsed.data.imageUrl);
        if (isTerminal(parsed.data.status)) return;
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("scan poll failed:", err instanceof Error ? err.message : "unknown error");
        failures += 1;
        setOffline(true);
      }
      timer = setTimeout(poll, nextPollDelay(failures));
    }

    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [scanId, attempt]);

  function retry() {
    setState({ kind: "loading" });
    setOffline(false);
    setAttempt((n) => n + 1);
  }

  if (state.kind === "loading") {
    return (
      <>
        <ScanSkeleton />
        {offline ? <ConnectionNote /> : null}
      </>
    );
  }

  if (state.kind === "problem") {
    return (
      <div className="flex max-w-xl flex-col items-start gap-4">
        <h1 className="text-3xl font-semibold">{state.title}</h1>
        <p role="alert" className="flex items-start gap-2">
          <CircleX aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-stamp" />
          <span>{state.detail}</span>
        </p>
        <div className="flex flex-wrap gap-3">
          <Button onClick={retry}>Try again</Button>
          <Button asChild variant="outline">
            <Link href="/">Photograph a chart</Link>
          </Button>
        </div>
      </div>
    );
  }

  const { scan } = state;
  const view = describeStatus(scan.status);
  // Reading order: top of the page first.
  const regions = [...scan.regions].sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <h1 className="text-4xl font-semibold tracking-tight">Scan results</h1>
        <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <StatusBadge status={scan.status} />
          <p>{view.detail}</p>
        </div>
        {scan.status === "failed" ? (
          <p role="alert" className="flex max-w-xl items-start gap-2 rounded-md border border-stamp p-3">
            <CircleX aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-stamp" />
            <span>{scan.error ?? "No reason was recorded. Take the photo again."}</span>
          </p>
        ) : null}
        {offline ? <ConnectionNote /> : null}
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {photoUrl ? (
          <Dialog>
            <DialogTrigger asChild>
              <button
                type="button"
                aria-label="Enlarge the chart photo"
                className="block w-full rounded-md border bg-card p-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background lg:sticky lg:top-4"
              >
                {/* A signed storage URL that changes per request, so next/image cannot optimise it. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoUrl}
                  alt="The chart photo you sent"
                  className="max-h-[70dvh] w-full object-contain"
                  onError={() => setPhotoUrl(scan.imageUrl)}
                />
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Chart photo</DialogTitle>
                <DialogDescription>Press Escape or the close button to go back.</DialogDescription>
              </DialogHeader>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl} alt="The chart photo you sent, enlarged" className="max-h-[75dvh] w-full object-contain" />
            </DialogContent>
          </Dialog>
        ) : (
          <p className="rounded-md border bg-muted p-3 text-muted-foreground">The photo could not be loaded.</p>
        )}

        <div className="flex flex-col gap-6">
          {regions.length > 0 ? (
            regions.map((region) => <RegionBlock key={region.id} region={region} />)
          ) : (
            <p className="border-t pt-4 text-muted-foreground">
              {isTerminal(scan.status) ? "No regions were found on this page." : "Regions appear here as they are read."}
            </p>
          )}
        </div>
      </div>

      {scan.status !== "done" ? (
        <p className="max-w-[60ch] border-t pt-4 text-sm text-muted-foreground">
          These readings are unverified. Nothing is confirmed until a person reviews it.
        </p>
      ) : null}
    </div>
  );
}

function ConnectionNote() {
  return (
    <p role="status" className="flex items-center gap-2 text-sm">
      <WifiOff aria-hidden="true" className="size-4 shrink-0" />
      Connection problem. Still trying.
    </p>
  );
}

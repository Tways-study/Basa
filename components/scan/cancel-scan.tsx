"use client";

import { useState } from "react";
import { Ban, CircleX, Loader2 } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const ErrorBodySchema = z.object({ error: z.string() });

type State = { kind: "idle" } | { kind: "stopping" } | { kind: "error"; message: string };

/**
 * "Cancel scanning" for a scan that is still being read. Stopping is hard to undo (the photo has to be
 * taken again to read it), so it asks first; "Keep reading" is the safe, default choice. The server stops
 * the run and the page goes back to polling, which then shows the scan as cancelled.
 */
export function CancelScan({ scanId, onCancelled }: { scanId: string; onCancelled: () => void }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>({ kind: "idle" });
  const stopping = state.kind === "stopping";

  async function stop() {
    setState({ kind: "stopping" });
    try {
      const res = await fetch(`/api/scans/${scanId}/cancel`, { method: "POST", signal: AbortSignal.timeout(20_000) });
      if (!res.ok) {
        const parsed = ErrorBodySchema.safeParse(await res.json().catch(() => null));
        setState({ kind: "error", message: parsed.success ? parsed.data.error : "The server could not stop this scan. Try again." });
        return;
      }
      setState({ kind: "idle" });
      setOpen(false);
      onCancelled();
    } catch (err) {
      console.error("cancel failed:", err instanceof Error ? err.name : "unknown error");
      setState({ kind: "error", message: "Could not reach the server. Try again when you are online." });
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Ban aria-hidden="true" />
        Cancel scanning
      </Button>
      {/* Not closable while the request runs, so the person is never left guessing whether it went through. */}
      <Dialog open={open} onOpenChange={(next) => (stopping ? undefined : setOpen(next))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Stop reading this chart?</DialogTitle>
            <DialogDescription>
              Nothing has been saved to a record. To read this chart, photograph it again.
            </DialogDescription>
          </DialogHeader>
          {state.kind === "error" ? (
            <p role="alert" className="flex items-start gap-2 text-sm">
              <CircleX aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-stamp" />
              <span>{state.message}</span>
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="outline" className="border-stamp" onClick={stop} disabled={stopping}>
              {stopping ? <Loader2 aria-hidden="true" className="motion-safe:animate-spin" /> : <Ban aria-hidden="true" />}
              {stopping ? "Stopping" : "Stop reading"}
            </Button>
            <Button autoFocus onClick={() => setOpen(false)} disabled={stopping}>
              Keep reading
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

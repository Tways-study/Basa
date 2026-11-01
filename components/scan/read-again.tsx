"use client";

import { useState } from "react";
import { CircleX, Loader2, RotateCw } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";

const ErrorBodySchema = z.object({ error: z.string() });

/**
 * Asks the server to redo only the readings that failed. The server answers at once and works in the
 * background, so on success the page goes back to polling and shows "reading" until it finishes.
 */
export function ReadAgain({ scanId, label = "Read again", onStarted }: { scanId: string; label?: string; onStarted: () => void }) {
  const [state, setState] = useState<{ kind: "idle" } | { kind: "starting" } | { kind: "error"; message: string }>({ kind: "idle" });

  async function start() {
    setState({ kind: "starting" });
    try {
      const res = await fetch(`/api/scans/${scanId}/resume`, { method: "POST", signal: AbortSignal.timeout(20_000) });
      if (!res.ok) {
        const parsed = ErrorBodySchema.safeParse(await res.json().catch(() => null));
        setState({ kind: "error", message: parsed.success ? parsed.data.error : "The server could not start reading again." });
        return;
      }
      setState({ kind: "idle" });
      onStarted();
    } catch (err) {
      console.error("read again failed:", err instanceof Error ? err.name : "unknown error");
      setState({ kind: "error", message: "Could not reach the server. Try again when you are online." });
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button variant="outline" onClick={start} disabled={state.kind === "starting"}>
        {state.kind === "starting" ? <Loader2 aria-hidden="true" className="motion-safe:animate-spin" /> : <RotateCw aria-hidden="true" />}
        {state.kind === "starting" ? "Starting" : label}
      </Button>
      {state.kind === "error" ? (
        <p role="alert" className="flex items-start gap-2 text-sm">
          <CircleX aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-stamp" />
          <span>{state.message}</span>
        </p>
      ) : null}
    </div>
  );
}

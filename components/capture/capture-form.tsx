"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, CircleX, Loader2, RotateCcw, Send } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { prepareUpload } from "@/lib/client/downscale";
import { SyncAcceptedSchema } from "@/lib/schemas";

type Photo = { file: File; previewUrl: string; scanId: string };
type Phase = "idle" | "preparing" | "sending";

const ErrorBodySchema = z.object({ error: z.string() });

// The server's messages are written for people, so show them. Fall back by status when the body is not ours.
async function readFailure(res: Response): Promise<string> {
  const parsed = ErrorBodySchema.safeParse(await res.json().catch(() => null));
  if (parsed.success) return parsed.data.error;
  if (res.status === 413) return "That photo is too large to send. Take it again from a little further away.";
  if (res.status === 415) return "That file is not a photo we can read. Take a new photo.";
  return "The server could not accept the photo. Try again in a moment.";
}

export function CaptureForm() {
  const router = useRouter();
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const prepared = useRef<{ scanId: string; blob: Blob } | null>(null);

  const [photo, setPhoto] = useState<Photo | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  // Free the preview's memory when the photo changes or the page closes.
  useEffect(() => {
    if (!photo) return;
    return () => URL.revokeObjectURL(photo.previewUrl);
  }, [photo]);

  function choose(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("That file is not a photo. Choose an image.");
      return;
    }
    setError(null);
    prepared.current = null;
    // The id is made once per photo, so sending the same photo twice is the same scan on the server.
    setPhoto({ file, previewUrl: URL.createObjectURL(file), scanId: crypto.randomUUID() });
  }

  function retake() {
    setPhoto(null);
    setError(null);
    prepared.current = null;
  }

  async function send() {
    if (!photo) return;
    setError(null);
    let navigating = false;
    try {
      setPhase("preparing");
      // Shrinking is slow on a phone, so keep the result if the send has to be retried.
      let blob = prepared.current?.scanId === photo.scanId ? prepared.current.blob : null;
      if (!blob) {
        blob = await prepareUpload(photo.file);
        prepared.current = { scanId: photo.scanId, blob };
      }

      setPhase("sending");
      const body = new FormData();
      body.set("scanId", photo.scanId);
      body.set("image", blob, "chart.jpg");

      const res = await fetch("/api/sync", { method: "POST", body, signal: AbortSignal.timeout(30_000) });
      if (!res.ok) {
        setError(await readFailure(res));
        return;
      }
      const accepted = SyncAcceptedSchema.safeParse(await res.json());
      if (!accepted.success) {
        setError("The server sent a reply we did not expect. Try again.");
        return;
      }
      // Stay disabled while the next page loads, so a second tap cannot start a second send.
      navigating = true;
      router.push(`/scans/${accepted.data.scanId}`);
    } catch (err) {
      console.error("send failed:", err instanceof Error ? err.name : "unknown error");
      setError(
        err instanceof Error && err.name === "TypeError"
          ? "Could not reach the server. Check your connection and try again."
          : err instanceof Error
            ? err.message
            : "Something went wrong sending the photo.",
      );
    } finally {
      if (!navigating) setPhase("idle");
    }
  }

  const busy = phase !== "idle";

  return (
    <div className="flex flex-col gap-4">
      {/* Hidden: the buttons below are the labelled, keyboard-reachable controls. */}
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          choose(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          choose(e.target.files);
          e.target.value = "";
        }}
      />

      {photo ? (
        <>
          <div className="rounded-md border bg-card p-2">
            {/* A blob URL for a photo the person just took, so next/image has nothing to optimise. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.previewUrl}
              alt="The chart photo you chose, shown before sending"
              className="max-h-[60dvh] w-full object-contain"
              onError={() => setError("This browser cannot show that photo. Take a new photo, or choose a JPEG or PNG.")}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" size="lg" onClick={retake} disabled={busy}>
              <RotateCcw aria-hidden="true" />
              Retake
            </Button>
            <Button size="lg" onClick={send} disabled={busy}>
              {busy ? <Loader2 aria-hidden="true" className="motion-safe:animate-spin" /> : <Send aria-hidden="true" />}
              {phase === "preparing" ? "Preparing" : phase === "sending" ? "Sending" : "Send"}
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-start gap-1">
          <Button size="lg" className="w-full sm:w-auto sm:min-w-64" onClick={() => cameraInput.current?.click()}>
            <Camera aria-hidden="true" />
            Take photo
          </Button>
          {/* -ml-4 cancels the button's own padding so the underlined text lines up with the edge above. */}
          <Button variant="link" className="-ml-4" onClick={() => fileInput.current?.click()}>
            Choose a photo from this device
          </Button>
        </div>
      )}

      {error ? (
        <p role="alert" className="flex items-start gap-2 rounded-md border border-stamp p-3">
          <CircleX aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-stamp" />
          <span>{error}</span>
        </p>
      ) : null}

      <p className="sr-only" aria-live="polite">
        {phase === "preparing" ? "Preparing the photo." : phase === "sending" ? "Sending the photo." : ""}
      </p>
    </div>
  );
}

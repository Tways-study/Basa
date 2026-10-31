"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, CircleX, HardDrive, Loader2, RotateCcw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { prepareUpload } from "@/lib/client/downscale";
import { addToOutbox, syncOutbox } from "@/lib/outbox/client";
import { sendScan } from "@/lib/outbox/send";

type Photo = { file: File; previewUrl: string; scanId: string };
type Phase = "idle" | "preparing" | "sending";

export function CaptureForm() {
  const router = useRouter();
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const prepared = useRef<{ scanId: string; blob: Blob } | null>(null);

  const [photo, setPhoto] = useState<Photo | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

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
    setSavedNote(null);
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
      // Saved on the device first, so the photo is not lost if the send fails or the tab closes.
      let savedOnDevice = true;
      try {
        await addToOutbox(photo.scanId, blob);
      } catch (err) {
        savedOnDevice = false;
        console.error("outbox save failed:", err instanceof Error ? err.name : "unknown error");
      }

      // No device storage (some private windows): send straight away with the same sender, and say so if it fails.
      if (!savedOnDevice) {
        const direct = await sendScan(photo.scanId, blob);
        if (direct.kind === "accepted") {
          navigating = true;
          router.push(`/scans/${photo.scanId}`);
        } else {
          setError(`${direct.message} This browser cannot keep the photo, so take it again when you are connected.`);
        }
        return;
      }

      const outcome = (await syncOutbox(true)).get(photo.scanId);
      if (outcome?.kind === "accepted") {
        // Stay disabled while the next page loads, so a second tap cannot start a second send.
        navigating = true;
        router.push(`/scans/${photo.scanId}`);
        return;
      }

      // Not accepted yet. The photo is safe on the device and the list below shows what happens next.
      setPhoto(null);
      prepared.current = null;
      setSavedNote(
        outcome?.kind === "rejected"
          ? "The photo was saved, but the server could not accept it. See the list below."
          : "Saved on this device. It sends by itself when there is a connection.",
      );
    } catch (err) {
      console.error("send failed:", err instanceof Error ? err.name : "unknown error");
      setError(err instanceof Error ? err.message : "Something went wrong saving the photo.");
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

      {savedNote ? (
        <p role="status" className="flex items-start gap-2 rounded-md border p-3">
          <HardDrive aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <span>{savedNote}</span>
        </p>
      ) : null}

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

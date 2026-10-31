import { z } from "zod";
import { SyncAcceptedSchema } from "@/lib/schemas";
import type { SendResult } from "./types";

const ErrorBodySchema = z.object({ error: z.string() });

// The server's messages are written for people, so show them. Fall back by status when the body is not ours.
async function readFailure(res: Response): Promise<string> {
  const parsed = ErrorBodySchema.safeParse(await res.json().catch(() => null));
  if (parsed.success) return parsed.data.error;
  if (res.status === 413) return "That photo is too large to send. Take it again from a little further away.";
  if (res.status === 415) return "That file is not a photo we can read. Take a new photo.";
  return "The server could not accept the photo.";
}

// A request that may succeed later: the server is busy or we were told to slow down.
const isTransient = (status: number) => status >= 500 || status === 408 || status === 429;

/**
 * The one sender, used by both the capture screen and the outbox. Never throws: every outcome is a
 * SendResult, so no failure is swallowed and none leaves an item in limbo.
 */
export async function sendScan(scanId: string, blob: Blob, doFetch: typeof fetch = fetch): Promise<SendResult> {
  const body = new FormData();
  body.set("scanId", scanId);
  body.set("image", blob, "chart.jpg");

  let res: Response;
  try {
    res = await doFetch("/api/sync", { method: "POST", body, signal: AbortSignal.timeout(30_000) });
  } catch (err) {
    console.error("send failed:", err instanceof Error ? err.name : "unknown error");
    return { kind: "retry", message: "Could not reach the server." };
  }

  if (!res.ok) {
    const message = await readFailure(res);
    return isTransient(res.status) ? { kind: "retry", message } : { kind: "rejected", message };
  }

  const accepted = SyncAcceptedSchema.safeParse(await res.json().catch(() => null));
  if (!accepted.success) return { kind: "retry", message: "The server sent a reply we did not expect." };
  return { kind: "accepted", status: accepted.data.status };
}

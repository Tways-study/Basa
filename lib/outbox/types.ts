import type { JobStatus } from "@/lib/schemas";

// saved: on this device, not yet accepted by the server (also the state of a send that will be retried)
// syncing: a send is in flight
// synced: the server accepted it; serverStatus follows the scan from there
// failed: the server refused it, or it ran out of retries, so a person has to act
export type OutboxStatus = "saved" | "syncing" | "synced" | "failed";

export type OutboxItem = {
  /** Made once at capture. The server treats a repeat of a known id as a no-op, so a double send cannot create a second scan. */
  scanId: string;
  /** The downscaled photo. Dropped once the server has it, to free space on the device. */
  blob: Blob | null;
  status: OutboxStatus;
  attempts: number;
  nextAttemptAt: number;
  lastError: string | null;
  createdAt: number;
  serverStatus: JobStatus | null;
};

export interface OutboxStore {
  list(): Promise<OutboxItem[]>;
  put(item: OutboxItem): Promise<void>;
  remove(scanId: string): Promise<void>;
}

export type SendResult =
  | { kind: "accepted"; status: JobStatus }
  // Worth trying again: no network, a timeout, or a server hiccup.
  | { kind: "retry"; message: string }
  // The server looked at it and said no. Sending the same bytes again will not help.
  | { kind: "rejected"; message: string };

import type { OutboxItem } from "./types";

// What is written to IndexedDB. The photo is kept as raw bytes plus its type, not as a Blob: WebKit
// (Safari and every iPhone browser) refuses to store a Blob in a private tab, which made "saved on this
// device" fail on a phone while it worked on a laptop. Bytes store everywhere, and the Blob is rebuilt on read.
export type StoredItem = Omit<OutboxItem, "blob"> & {
  data: ArrayBuffer | null;
  type: string;
  /** Rows written before this change held the Blob itself. Still read, never written. */
  blob?: Blob | null;
};

export async function toStored(item: OutboxItem): Promise<StoredItem> {
  const { blob, ...rest } = item;
  return blob ? { ...rest, data: await blob.arrayBuffer(), type: blob.type } : { ...rest, data: null, type: "" };
}

export function fromStored(row: StoredItem): OutboxItem {
  const { data, type, blob: legacy, ...rest } = row;
  if (data) return { ...rest, blob: new Blob([data], { type }) };
  return { ...rest, blob: legacy ?? null };
}

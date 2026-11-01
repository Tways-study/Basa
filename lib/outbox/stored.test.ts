import { describe, expect, it } from "vitest";
import { fromStored, toStored } from "./stored";
import type { OutboxItem } from "./types";

const base: Omit<OutboxItem, "blob"> = {
  scanId: "11111111-1111-4111-8111-111111111111",
  status: "saved",
  attempts: 0,
  nextAttemptAt: 0,
  lastError: null,
  createdAt: 1,
  serverStatus: null,
};

describe("stored outbox items", () => {
  it("keeps the photo as bytes with its type, and gives the same photo back", async () => {
    const photo = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/jpeg" });
    const stored = await toStored({ ...base, blob: photo });
    expect(stored.data).toBeInstanceOf(ArrayBuffer);
    expect(stored.type).toBe("image/jpeg");
    expect("blob" in stored).toBe(false);

    const back = fromStored(stored);
    expect(back.blob?.type).toBe("image/jpeg");
    expect(new Uint8Array(await back.blob!.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(back.scanId).toBe(base.scanId);
  });

  it("stores no bytes once the photo has been dropped", async () => {
    const stored = await toStored({ ...base, blob: null, status: "synced" });
    expect(stored.data).toBeNull();
    expect(fromStored(stored).blob).toBeNull();
  });

  it("still reads a row an earlier version wrote with the Blob itself", () => {
    const photo = new Blob(["x"], { type: "image/jpeg" });
    const row = { ...base, data: null, type: "", blob: photo };
    expect(fromStored(row).blob).toBe(photo);
  });
});

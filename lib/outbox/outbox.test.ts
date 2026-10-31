import { describe, expect, it, vi } from "vitest";
import { MAX_ATTEMPTS, backoffMs, describeItem, isDue, nextDueAt } from "./policy";
import { runOutbox } from "./runner";
import { sendScan } from "./send";
import type { OutboxItem, OutboxStore, SendResult } from "./types";

const ID = "11111111-1111-4111-8111-111111111111";

function item(over: Partial<OutboxItem> = {}): OutboxItem {
  return {
    scanId: ID,
    blob: new Blob(["x"]),
    status: "saved",
    attempts: 0,
    nextAttemptAt: 0,
    lastError: null,
    createdAt: 1,
    serverStatus: null,
    ...over,
  };
}

function memoryStore(initial: OutboxItem[] = []) {
  const map = new Map(initial.map((i) => [i.scanId, i]));
  const store: OutboxStore = {
    async list() {
      return [...map.values()];
    },
    async put(i) {
      map.set(i.scanId, i);
    },
    async remove(id) {
      map.delete(id);
    },
  };
  return { map, store };
}

describe("policy", () => {
  it("backs off 2 s, 4 s, 8 s and caps at a minute", () => {
    expect([1, 2, 3].map(backoffMs)).toEqual([2000, 4000, 8000]);
    expect(backoffMs(20)).toBe(60_000);
    expect(backoffMs(0)).toBe(0);
  });

  it("only saved items whose time has come are due", () => {
    expect(isDue(item({ nextAttemptAt: 100 }), 99)).toBe(false);
    expect(isDue(item({ nextAttemptAt: 100 }), 100)).toBe(true);
    expect(isDue(item({ status: "synced" }), 1e12)).toBe(false);
  });

  it("finds the soonest retry", () => {
    expect(nextDueAt([item({ nextAttemptAt: 50 }), item({ scanId: "b", nextAttemptAt: 20 })])).toBe(20);
    expect(nextDueAt([item({ status: "synced" })])).toBeNull();
  });

  it("says Saved on device for an unsent photo and follows the server once synced", () => {
    expect(describeItem(item()).label).toBe("Saved on device");
    expect(describeItem(item({ status: "synced", serverStatus: "reading" })).label).toBe("Reading");
    expect(describeItem(item({ status: "failed", lastError: "Too big" })).detail).toBe("Too big");
  });
});

describe("sendScan", () => {
  const ok = (status = "queued") => new Response(JSON.stringify({ scanId: ID, status }), { status: 200 });

  it("accepts a valid reply", async () => {
    const r = await sendScan(ID, new Blob(["x"]), (async () => ok()) as typeof fetch);
    expect(r).toEqual({ kind: "accepted", status: "queued" });
  });

  it("treats no network as retryable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await sendScan(ID, new Blob(["x"]), (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch);
    expect(r.kind).toBe("retry");
  });

  it("retries a server error but not a refusal", async () => {
    const reply = (status: number, error: string) => (async () => new Response(JSON.stringify({ error }), { status })) as typeof fetch;
    expect((await sendScan(ID, new Blob(["x"]), reply(503, "busy"))).kind).toBe("retry");
    expect((await sendScan(ID, new Blob(["x"]), reply(429, "slow down"))).kind).toBe("retry");
    expect(await sendScan(ID, new Blob(["x"]), reply(415, "not an image"))).toEqual({ kind: "rejected", message: "not an image" });
  });

  it("does not trust a reply of the wrong shape", async () => {
    const r = await sendScan(ID, new Blob(["x"]), (async () => new Response("{}", { status: 200 })) as typeof fetch);
    expect(r.kind).toBe("retry");
  });
});

describe("runOutbox", () => {
  const accepted: SendResult = { kind: "accepted", status: "queued" };

  it("sends a waiting photo, marks it synced and frees the blob", async () => {
    const { map, store } = memoryStore([item()]);
    await runOutbox(store, async () => accepted, { force: true });
    expect(map.get(ID)).toMatchObject({ status: "synced", blob: null, serverStatus: "queued" });
  });

  it("keeps a photo on the device and backs off when there is no connection", async () => {
    const { map, store } = memoryStore([item()]);
    await runOutbox(store, async () => ({ kind: "retry", message: "offline" }), { force: true, now: () => 1000 });
    expect(map.get(ID)).toMatchObject({ status: "saved", attempts: 1, nextAttemptAt: 3000, lastError: "offline" });
    expect(map.get(ID)?.blob).not.toBeNull();
  });

  it("does not send before the retry time unless forced", async () => {
    const send = vi.fn(async () => accepted);
    const { store } = memoryStore([item({ attempts: 1, nextAttemptAt: 5000 })]);
    await runOutbox(store, send, { now: () => 1000 });
    expect(send).not.toHaveBeenCalled();
    await runOutbox(store, send, { force: true, now: () => 1000 });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("gives up after the last attempt so a person can act", async () => {
    const { map, store } = memoryStore([item({ attempts: MAX_ATTEMPTS - 1 })]);
    await runOutbox(store, async () => ({ kind: "retry", message: "offline" }), { force: true });
    expect(map.get(ID)?.status).toBe("failed");
  });

  it("marks a refused photo failed with the server's reason", async () => {
    const { map, store } = memoryStore([item()]);
    await runOutbox(store, async () => ({ kind: "rejected", message: "Not an image" }), { force: true });
    expect(map.get(ID)).toMatchObject({ status: "failed", lastError: "Not an image" });
  });

  it("syncing the same item twice sends it once", async () => {
    const send = vi.fn(async () => accepted);
    const { store } = memoryStore([item()]);
    await runOutbox(store, send, { force: true });
    await runOutbox(store, send, { force: true });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("recovers an item left in syncing by a closed tab", async () => {
    const send = vi.fn(async () => accepted);
    const { map, store } = memoryStore([item({ status: "syncing" })]);
    await runOutbox(store, send, { force: true });
    expect(send).toHaveBeenCalledTimes(1);
    expect(map.get(ID)?.status).toBe("synced");
  });

  it("sends oldest first", async () => {
    const order: string[] = [];
    const { store } = memoryStore([item({ scanId: "b", createdAt: 2 }), item({ scanId: "a", createdAt: 1 })]);
    await runOutbox(store, async (id) => (order.push(id), accepted), { force: true });
    expect(order).toEqual(["a", "b"]);
  });
});

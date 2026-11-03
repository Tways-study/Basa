import { describe, expect, it, vi } from "vitest";
import { getModelAdapters } from "@/lib/models";
import { DeadlineError } from "@/lib/models/chat";
import type { ModelAdapters } from "@/lib/models/types";
import type { JobStatus, Reading, Region } from "@/lib/schemas";
import type { ScanRecord, ScanStore } from "@/lib/server/store";
import { buildScanResult } from "@/lib/server/store";
import { STALE_AFTER_MS, decideRetry, decideStart, runPipeline, type PipelineDeps } from "./run";

function fakeStore(scan: Partial<ScanRecord> = {}) {
  const state = {
    scan: { id: "s1", status: "queued" as JobStatus, imagePath: "s1.jpg", error: null as string | null, createdAt: new Date(0), updatedAt: new Date(), ...scan },
    regions: [] as Region[],
    readings: new Map<string, Reading>(),
    statuses: [] as JobStatus[],
  };
  const store: ScanStore = {
    async getScan() { return { ...state.scan }; },
    async createScan() {},
    async setStatus(_id, status, error = null) { state.scan.status = status; state.scan.error = error; state.statuses.push(status); },
    async getRegions() { return [...state.regions]; },
    async insertRegions(scanId, regions) {
      const rows = regions.map((r, i) => ({ id: `r${state.regions.length + i + 1}`, scanId, ...r }));
      state.regions.push(...rows);
      return rows;
    },
    async getReadings() { return [...state.readings.values()]; },
    async upsertReading(r) { state.readings.set(`${r.regionId}:${r.model}`, r); },
  };
  return { state, store };
}

function deps(store: ScanStore, overrides: Partial<PipelineDeps> = {}): PipelineDeps {
  return {
    store,
    createAdapters: () => getModelAdapters(), // MOCK_MODELS=true in these tests
    loadImage: async () => new Uint8Array([1]),
    crop: async (image) => image,
    maxCalls: 30,
    ...overrides,
  };
}

describe("runPipeline (mock models)", () => {
  it("segments, reads each region with both readers, reconciles and ends in needs_review", async () => {
    vi.stubEnv("MOCK_MODELS", "true");
    const { state, store } = fakeStore();
    await runPipeline("s1", deps(store));
    expect(state.scan.status).toBe("needs_review");
    expect(state.regions).toHaveLength(4);
    expect(state.readings.size).toBe(8); // 4 regions x 2 readers
    expect(state.statuses).toEqual(["segmenting", "reading", "reconciling", "needs_review"]);
  });

  it("running it again, or after a crash, creates no duplicates", async () => {
    vi.stubEnv("MOCK_MODELS", "true");
    const { state, store } = fakeStore();
    await runPipeline("s1", deps(store));
    state.scan.status = "reading"; // pretend the first run died before finishing
    state.readings.delete("r2:muse_spark"); // ...with one reading missing
    await runPipeline("s1", deps(store));
    expect(state.regions).toHaveLength(4);
    expect(state.readings.size).toBe(8);
    expect(state.scan.status).toBe("needs_review");
  });

  it("a killed scan resumes and re-reads only the missing reading", async () => {
    vi.stubEnv("MOCK_MODELS", "true");
    const { state, store } = fakeStore();
    await runPipeline("s1", deps(store));
    state.scan.status = "reading";
    state.readings.delete("r3:muse_spark_open");
    const calls: string[] = [];
    const base = getModelAdapters();
    const watch = (r: ModelAdapters["readers"][number]) => ({
      id: r.id,
      readRegion: (i: Parameters<typeof r.readRegion>[0]) => { calls.push(`${i.regionId}:${r.id}`); return r.readRegion(i); },
    });
    const spied: ModelAdapters = { ...base, readers: [watch(base.readers[0]), watch(base.readers[1])] };
    await runPipeline("s1", deps(store, { createAdapters: () => spied }));
    expect(calls).toEqual(["r3:muse_spark_open"]);
    expect(state.readings.size).toBe(8);
  });

  it("does not re-read regions that already have a good reading", async () => {
    vi.stubEnv("MOCK_MODELS", "true");
    const { store } = fakeStore();
    await runPipeline("s1", deps(store));
    const readRegion = vi.fn();
    const adapters = getModelAdapters();
    const spied: ModelAdapters = { ...adapters, readers: [{ id: "muse_spark", readRegion }] };
    await runPipeline("s1", deps(store, { createAdapters: () => spied }));
    expect(readRegion).not.toHaveBeenCalled();
  });

  it("a region that fails to read keeps its error and the scan still reaches review", async () => {
    vi.stubEnv("MOCK_MODELS", "true");
    const { state, store } = fakeStore();
    const base = getModelAdapters();
    const flaky: ModelAdapters = {
      ...base,
      readers: [
        {
          id: "muse_spark",
          readRegion: async (input) => {
            if (input.kind === "table") throw new Error("boom");
            return base.readers[0].readRegion(input);
          },
        },
      ],
    };
    await runPipeline("s1", deps(store, { createAdapters: () => flaky }));
    expect(state.scan.status).toBe("needs_review");
    expect([...state.readings.values()].filter((r) => r.error)).toHaveLength(1);
  });

  it("fails the scan with a message when no region can be read", async () => {
    vi.stubEnv("MOCK_MODELS", "true");
    const { state, store } = fakeStore();
    const base = getModelAdapters();
    const broken: ModelAdapters = { ...base, readers: [{ id: "muse_spark", readRegion: async () => { throw new Error("down"); } }] };
    await runPipeline("s1", deps(store, { createAdapters: () => broken }));
    expect(state.scan.status).toBe("failed");
    expect(state.scan.error).toMatch(/No region could be read/);
  });

  it("stops and records a clear failure when the call cap is hit", async () => {
    vi.stubEnv("MOCK_MODELS", "true");
    const { state, store } = fakeStore();
    const capped = (onRequest: () => void): ModelAdapters => {
      const base = getModelAdapters();
      return {
        segmenter: { segment: async (img) => { onRequest(); return base.segmenter.segment(img); } },
        readers: [{ id: "muse_spark", readRegion: async (i) => { onRequest(); return base.readers[0].readRegion(i); } }],
      };
    };
    await runPipeline("s1", deps(store, { createAdapters: capped, maxCalls: 2 }));
    expect(state.scan.status).toBe("failed");
    expect(state.scan.error).toMatch(/limit of 2 model calls/);
  });

  it("fails the scan if the scan has no stored image", async () => {
    const { state, store } = fakeStore({ imagePath: null });
    await runPipeline("s1", deps(store));
    expect(state.scan.status).toBe("failed");
  });
});

describe("decideStart", () => {
  const scan = (status: JobStatus, ageMs = 0): ScanRecord => ({
    id: "s1", status, imagePath: "s1.jpg", error: null, createdAt: new Date(0), updatedAt: new Date(1_000_000 - ageMs),
  });
  const now = 1_000_000;

  it("starts a new scan", () => expect(decideStart(null, now)).toBe("start"));
  it("leaves a finished scan alone", () => {
    expect(decideStart(scan("needs_review"), now)).toBe("noop");
    expect(decideStart(scan("done"), now)).toBe("noop");
  });
  it("leaves a scan that is actively running alone", () => expect(decideStart(scan("reading", 5_000), now)).toBe("noop"));
  it("resumes a scan that went quiet", () => expect(decideStart(scan("reading", STALE_AFTER_MS + 1), now)).toBe("resume"));
  it("resumes a failed scan", () => expect(decideStart(scan("failed"), now)).toBe("resume"));
});

describe("buildScanResult", () => {
  it("attaches each region's readings and drops the region id from them", () => {
    const scan: ScanRecord = { id: "s1", status: "needs_review", imagePath: "s1.jpg", error: null, createdAt: new Date(0), updatedAt: new Date() };
    const regions: Region[] = [{ id: "r1", scanId: "s1", kind: "stamp", bbox: { x: 0, y: 0, w: 1, h: 1 }, maskPath: null }];
    const readings: Reading[] = [{ regionId: "r1", model: "muse_spark", fields: { "stamp.present": true }, latencyMs: 5, error: null }];
    const result = buildScanResult(scan, regions, readings, "https://signed.example/x");
    expect(result.regions[0].readings).toEqual([{ model: "muse_spark", fields: { "stamp.present": true }, latencyMs: 5, error: null }]);
    expect(result.imageUrl).toBe("https://signed.example/x");
  });
});

describe("read crop", () => {
  it("cuts a crop wider than the stored box, once per region, and leaves the stored box alone", async () => {
    vi.stubEnv("MOCK_MODELS", "true");
    const { state, store } = fakeStore();
    const boxes: Region["bbox"][] = [];
    const crop = vi.fn(async (image: Uint8Array, box: Region["bbox"]) => { boxes.push(box); return image; });
    await runPipeline("s1", deps(store, { crop }));

    expect(crop).toHaveBeenCalledTimes(4); // 4 regions, two readers each, one crop per region
    for (const region of state.regions) {
      const cut = boxes.find((b) => b.x <= region.bbox.x && b.y <= region.bbox.y && b.x + b.w >= region.bbox.x + region.bbox.w && b.y + b.h >= region.bbox.y + region.bbox.h && b.w * b.h > region.bbox.w * region.bbox.h);
      expect(cut, `${region.kind} crop contains and exceeds its box`).toBeDefined();
    }
    expect(state.regions.find((r) => r.kind === "stamp")!.bbox).toEqual({ x: 0.68, y: 0.7, w: 0.27, h: 0.18 });
  });
});

describe("two readers", () => {
  it("runs at most four model calls at once", async () => {
    vi.stubEnv("MOCK_MODELS", "true");
    const { store } = fakeStore();
    const base = getModelAdapters();
    let inFlight = 0;
    let peak = 0;
    const slow = (r: ModelAdapters["readers"][number]) => ({
      id: r.id,
      readRegion: async (i: Parameters<typeof r.readRegion>[0]) => {
        peak = Math.max(peak, ++inFlight);
        await new Promise((res) => setTimeout(res, 5));
        inFlight--;
        return r.readRegion(i);
      },
    });
    await runPipeline("s1", deps(store, { createAdapters: () => ({ ...base, readers: [slow(base.readers[0]), slow(base.readers[1])] }) }));
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(4);
  });

  it("when one reader is down the scan still reaches review, with every field flagged", async () => {
    vi.stubEnv("MOCK_MODELS", "true");
    const { state, store } = fakeStore();
    const base = getModelAdapters();
    const openDown = { id: "muse_spark_open" as const, readRegion: async () => { throw new Error("Muse Spark Open returned HTTP 503"); } };
    await runPipeline("s1", deps(store, { createAdapters: () => ({ ...base, readers: [base.readers[0], openDown] }) }));
    expect(state.scan.status).toBe("needs_review");
    const result = buildScanResult(
      { ...state.scan }, state.regions, [...state.readings.values()], null,
    );
    expect(result.regions.flatMap((r) => r.readings).filter((r) => r.error)).toHaveLength(4);
    const fields = result.regions.flatMap((r) => r.fields);
    expect(fields.length).toBeGreaterThan(0);
    // Nothing is auto-agreed when only one reader answered, so a person must still decide.
    expect(fields.every((f) => f.status === "flagged" && f.reason === "one_reader_only")).toBe(true);
  });

  it("flags the places where the two mock readers differ and agrees where they match", async () => {
    vi.stubEnv("MOCK_MODELS", "true");
    const { state, store } = fakeStore();
    await runPipeline("s1", deps(store));
    const result = buildScanResult({ ...state.scan }, state.regions, [...state.readings.values()], null);
    const byKey = new Map(result.regions.flatMap((r) => r.fields).map((f) => [f.key, f]));
    expect(byKey.get("row2.value")).toMatchObject({ status: "flagged", reason: "mismatch" }); // 7.2 vs 1.2
    expect(byKey.get("row4.value")).toMatchObject({ status: "flagged", reason: "one_unreadable" });
    expect(byKey.get("row3.unit")?.status).toBe("agreed"); // µmol/L and umol/L
    expect(byKey.get("row1.value")?.status).toBe("agreed");
  });

  it("the call cap counts both readers", async () => {
    vi.stubEnv("MOCK_MODELS", "true");
    const { state, store } = fakeStore();
    const counted = (onRequest: () => void): ModelAdapters => {
      const base = getModelAdapters();
      const wrap = (r: ModelAdapters["readers"][number]) => ({ id: r.id, readRegion: async (i: Parameters<typeof r.readRegion>[0]) => { onRequest(); return r.readRegion(i); } });
      return { segmenter: { segment: async (img) => { onRequest(); return base.segmenter.segment(img); } }, readers: [wrap(base.readers[0]), wrap(base.readers[1])] };
    };
    // 1 segment call + 8 reads = 9 calls; a cap of 9 passes, a cap of 8 stops the scan.
    await runPipeline("s1", deps(store, { createAdapters: counted, maxCalls: 9 }));
    expect(state.scan.status).toBe("needs_review");
    const second = fakeStore();
    await runPipeline("s1", deps(second.store, { createAdapters: counted, maxCalls: 8 }));
    expect(second.state.scan.status).toBe("failed");
    expect(second.state.scan.error).toMatch(/limit of 8 model calls/);
  });
});

describe("decideRetry", () => {
  const now = 1_000_000;
  const scan = (status: JobStatus, ageMs = 0): ScanRecord => ({
    id: "s1", status, imagePath: "s1.jpg", error: null, createdAt: new Date(0), updatedAt: new Date(now - ageMs),
  });
  const good = [{ error: null }];
  const bad = [{ error: null }, { error: "Baseten timed out" }];

  it("retries a review that has a failed reading", () => expect(decideRetry(scan("needs_review"), bad, now)).toBe("retry"));
  it("leaves a review with nothing failed alone", () => expect(decideRetry(scan("needs_review"), good, now)).toBe("noop"));
  it("never reopens a finished review", () => expect(decideRetry(scan("done"), bad, now)).toBe("noop"));
  it("retries a failed scan", () => expect(decideRetry(scan("failed"), [], now)).toBe("retry"));
  it("ignores a second tap while the scan is running", () => expect(decideRetry(scan("reading", 5_000), bad, now)).toBe("noop"));
  it("retries a scan that went quiet", () => expect(decideRetry(scan("reading", STALE_AFTER_MS + 1), bad, now)).toBe("retry"));
  it("does nothing for an unknown scan", () => expect(decideRetry(null, [], now)).toBe("noop"));
});

describe("read again", () => {
  it("re-reads only the failed reading and ends in needs_review with no failures left", async () => {
    vi.stubEnv("MOCK_MODELS", "true");
    const { state, store } = fakeStore();
    const base = getModelAdapters();
    let down = true;
    const flaky: ModelAdapters = {
      ...base,
      readers: [
        base.readers[0],
        { id: "muse_spark_open", readRegion: async (i) => { if (down && i.kind === "table") throw new Error("Baseten timed out"); return base.readers[1].readRegion(i); } },
      ],
    };
    await runPipeline("s1", deps(store, { createAdapters: () => flaky }));
    expect([...state.readings.values()].filter((r) => r.error)).toHaveLength(1);

    // What the resume route does: back to "reading", then the same pipeline.
    down = false;
    state.scan.status = "reading";
    const calls: string[] = [];
    const watched: ModelAdapters = {
      ...base,
      readers: [
        { id: "muse_spark", readRegion: (i) => { calls.push(`${i.kind}:muse_spark`); return base.readers[0].readRegion(i); } },
        { id: "muse_spark_open", readRegion: (i) => { calls.push(`${i.kind}:muse_spark_open`); return base.readers[1].readRegion(i); } },
      ],
    };
    await runPipeline("s1", deps(store, { createAdapters: () => watched }));
    expect(calls).toEqual(["table:muse_spark_open"]);
    expect(state.scan.status).toBe("needs_review");
    expect([...state.readings.values()].filter((r) => r.error)).toHaveLength(0);
  });

  it("a retry that fails again keeps the scan in review instead of failing it", async () => {
    vi.stubEnv("MOCK_MODELS", "true");
    const { state, store } = fakeStore();
    const base = getModelAdapters();
    const stillDown: ModelAdapters = {
      ...base,
      readers: [base.readers[0], { id: "muse_spark_open", readRegion: async (i) => { if (i.kind === "table") throw new Error("down"); return base.readers[1].readRegion(i); } }],
    };
    await runPipeline("s1", deps(store, { createAdapters: () => stillDown }));
    state.scan.status = "reading";
    await runPipeline("s1", deps(store, { createAdapters: () => stillDown }));
    expect(state.scan.status).toBe("needs_review");
    expect([...state.readings.values()].filter((r) => r.error)).toHaveLength(1);
  });
});

describe("run deadline", () => {
  // A reader that, like the real adapters, gives up when the run's deadline fires.
  const hangsUntilDeadline = (id: ModelAdapters["readers"][number]["id"], signal: AbortSignal) => ({
    id,
    readRegion: () =>
      new Promise<never>((_, reject) => {
        if (signal.aborted) return reject(new DeadlineError());
        signal.addEventListener("abort", () => reject(new DeadlineError()), { once: true });
      }),
  });

  it("a reader that hangs cannot stop the other reader, and the scan still reaches review", async () => {
    vi.stubEnv("MOCK_MODELS", "true");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { state, store } = fakeStore();
    const base = getModelAdapters();
    await runPipeline(
      "s1",
      deps(store, {
        budgetMs: 40,
        createAdapters: (_onRequest, signal) => ({ ...base, readers: [hangsUntilDeadline("muse_spark", signal), base.readers[1]] }),
      }),
    );
    // The 2026-11-03 production failure: Muse Spark hung, and Muse Spark Open never got to read the later regions.
    expect(state.scan.status).toBe("needs_review");
    const all = [...state.readings.values()];
    const open = all.filter((r) => r.model === "muse_spark_open");
    expect(open).toHaveLength(4); // every region, including the last ones
    expect(open.every((r) => !r.error)).toBe(true);
    const spark = all.filter((r) => r.model === "muse_spark");
    expect(spark).toHaveLength(4); // none left missing: each is stored as a failed reading
    expect(spark.every((r) => /ran out of time/i.test(r.error ?? ""))).toBe(true);
    // The runtime log says which reader stalled, without any key or URL.
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^reading failed: \w+ by muse_spark: Ran out of time/));
    warn.mockRestore();
  });

  it("work that has not started when the deadline passes is stored as failed, not left missing", async () => {
    vi.stubEnv("MOCK_MODELS", "true");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { state, store } = fakeStore();
    const base = getModelAdapters();
    const slowSegmenter = {
      segment: async (image: Uint8Array) => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        return base.segmenter.segment(image);
      },
    };
    await runPipeline("s1", deps(store, { budgetMs: 1, createAdapters: () => ({ ...base, segmenter: slowSegmenter }) }));
    expect(state.readings.size).toBe(8); // 4 regions x 2 readers, all recorded
    expect([...state.readings.values()].every((r) => /ran out of time/i.test(r.error ?? ""))).toBe(true);
    // Nothing could be read, so the scan fails with a clear message instead of staying on "reading".
    expect(state.scan.status).toBe("failed");
    expect(state.scan.error).toMatch(/No region could be read/);
    warn.mockRestore();
  });

  it("reading again after a deadline redoes only the readings that ran out of time", async () => {
    vi.stubEnv("MOCK_MODELS", "true");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { state, store } = fakeStore();
    const base = getModelAdapters();
    await runPipeline(
      "s1",
      deps(store, {
        budgetMs: 40,
        createAdapters: (_onRequest, signal) => ({ ...base, readers: [hangsUntilDeadline("muse_spark", signal), base.readers[1]] }),
      }),
    );
    const openBefore = [...state.readings.values()].filter((r) => r.model === "muse_spark_open");
    state.scan.status = "reading"; // what the resume route does before it runs the pipeline again
    await runPipeline("s1", deps(store)); // a fresh run has a fresh deadline and healthy models
    expect(state.scan.status).toBe("needs_review");
    expect([...state.readings.values()].filter((r) => r.error)).toHaveLength(0);
    expect(state.readings.size).toBe(8);
    // The good Muse Spark Open readings were kept as they were.
    for (const before of openBefore) expect(state.readings.get(`${before.regionId}:muse_spark_open`)).toBe(before);
    warn.mockRestore();
  });
});

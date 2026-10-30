import { describe, expect, it, vi } from "vitest";
import { getModelAdapters } from "@/lib/models";
import type { ModelAdapters } from "@/lib/models/types";
import type { JobStatus, Reading, Region } from "@/lib/schemas";
import type { ScanRecord, ScanStore } from "@/lib/server/store";
import { buildScanResult } from "@/lib/server/store";
import { STALE_AFTER_MS, decideStart, runPipeline, type PipelineDeps } from "./run";

function fakeStore(scan: Partial<ScanRecord> = {}) {
  const state = {
    scan: { id: "s1", status: "queued" as JobStatus, imagePath: "s1.jpg", error: null as string | null, updatedAt: new Date(), ...scan },
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
    id: "s1", status, imagePath: "s1.jpg", error: null, updatedAt: new Date(1_000_000 - ageMs),
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
    const scan: ScanRecord = { id: "s1", status: "needs_review", imagePath: "s1.jpg", error: null, updatedAt: new Date() };
    const regions: Region[] = [{ id: "r1", scanId: "s1", kind: "stamp", bbox: { x: 0, y: 0, w: 1, h: 1 }, maskPath: null }];
    const readings: Reading[] = [{ regionId: "r1", model: "muse_spark", fields: { "stamp.present": true }, latencyMs: 5, error: null }];
    const result = buildScanResult(scan, regions, readings, "https://signed.example/x");
    expect(result.regions[0].readings).toEqual([{ model: "muse_spark", fields: { "stamp.present": true }, latencyMs: 5, error: null }]);
    expect(result.imageUrl).toBe("https://signed.example/x");
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

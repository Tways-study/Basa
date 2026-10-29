import type { ModelAdapters } from "@/lib/models/types";
import type { Reading, Region } from "@/lib/schemas";
import type { ScanRecord, ScanStore } from "@/lib/server/store";
import { BudgetExceededError, CallBudget } from "./budget";

const CONCURRENCY = 4;
// A run that has not touched its scan for this long is treated as crashed and may be resumed.
// maxDuration on the sync route is 60 s, so 90 s means the original function is gone.
export const STALE_AFTER_MS = 90_000;

export interface PipelineDeps {
  store: ScanStore;
  /** Built per run so the adapters can report each HTTP attempt to this run's call budget. */
  createAdapters: (onRequest: () => void) => ModelAdapters;
  loadImage: (path: string) => Promise<Uint8Array>;
  crop: (image: Uint8Array, box: Region["bbox"]) => Promise<Uint8Array>;
  maxCalls: number;
}

export type StartDecision = "start" | "resume" | "noop";

/**
 * What a POST /api/sync for an existing id should do. A scan still being worked on is left alone;
 * one that has gone quiet is resumed, so a crashed function never strands a scan.
 */
export function decideStart(scan: ScanRecord | null, now = Date.now()): StartDecision {
  if (!scan) return "start";
  if (scan.status === "needs_review" || scan.status === "done") return "noop";
  if (scan.status === "failed") return "resume";
  return now - scan.updatedAt.getTime() > STALE_AFTER_MS ? "resume" : "noop";
}

/** Run `items` through `worker`, at most `limit` at a time. Never rejects: workers return their own results. */
async function pool<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function lane() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return results;
}

/**
 * Every stage checks what is already stored before it works, so running this twice, or after a crash,
 * never duplicates regions or readings. It records its own failures on the scan; it does not throw.
 */
export async function runPipeline(scanId: string, deps: PipelineDeps): Promise<void> {
  const { store } = deps;
  try {
    const scan = await store.getScan(scanId);
    if (!scan) throw new Error("Scan not found");
    if (!scan.imagePath) throw new Error("Scan has no stored image");
    if (scan.status === "needs_review" || scan.status === "done") return;

    const budget = new CallBudget(deps.maxCalls);
    const adapters = deps.createAdapters(() => budget.take());
    const image = await deps.loadImage(scan.imagePath);

    let regions = await store.getRegions(scanId);
    if (regions.length === 0) {
      await store.setStatus(scanId, "segmenting");
      const proposed = await adapters.segmenter.segment(image);
      if (proposed.length === 0) throw new Error("No regions were found on this chart");
      regions = await store.insertRegions(scanId, proposed);
    }

    await store.setStatus(scanId, "reading");
    const done = new Set(
      (await store.getReadings(scanId)).filter((r) => !r.error).map((r) => `${r.regionId}:${r.model}`),
    );
    const [reader] = adapters.readers; // Phase 3: one reader. Phase 4 runs all of them.
    const todo = regions.filter((r) => !done.has(`${r.id}:${reader.id}`));

    let stopped: BudgetExceededError | null = null;
    const outcomes = await pool(todo, CONCURRENCY, async (region): Promise<Reading | null> => {
      if (stopped) return null;
      try {
        const crop = await deps.crop(image, region.bbox);
        const reading = await reader.readRegion({ regionId: region.id, kind: region.kind, image: crop });
        await store.upsertReading(reading);
        return reading;
      } catch (err) {
        if (err instanceof BudgetExceededError) {
          stopped = err;
          return null;
        }
        // One bad region must not sink the scan: keep the failure as that region's reading.
        const failed: Reading = {
          regionId: region.id,
          model: reader.id,
          fields: {},
          latencyMs: 0,
          error: err instanceof Error ? err.message : "Reading failed",
        };
        await store.upsertReading(failed);
        return failed;
      }
    });

    if (stopped) throw stopped;
    if (todo.length > 0 && outcomes.every((o) => o?.error)) {
      throw new Error("No region could be read. Try again, or retake the photo.");
    }
    // Reconcile needs two readers (Phase 4); with one, the scan is ready for a person to look at.
    await store.setStatus(scanId, "needs_review");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Processing failed";
    await store.setStatus(scanId, "failed", message);
  }
}

import { DeadlineError } from "@/lib/models/chat";
import type { ModelAdapters } from "@/lib/models/types";
import { ReconciledFieldSchema, type Reading, type Region } from "@/lib/schemas";
import type { ScanRecord, ScanStore } from "@/lib/server/store";
import { BudgetExceededError, CallBudget } from "./budget";
import { READ_MARGIN, growBBox } from "./bbox";
import { reconcileReadings } from "./reconcile";

const CONCURRENCY = 4;
// The routes that start a run have `export const maxDuration = 120` (a literal, because Next reads it
// statically; run.test.ts checks the three numbers here and there stay in order).
// The run gives up on its own at RUN_BUDGET_MS, 20 s before the platform would kill the function, so it can
// store a failed reading and move the scan on. Without that, one slow model left the scan stuck on "reading".
export const RUN_BUDGET_MS = 100_000;
// A run that has not touched its scan for this long is treated as crashed and may be resumed. It must be
// longer than maxDuration, so a run that is still alive is never resumed on top of itself.
export const STALE_AFTER_MS = 150_000;

export interface PipelineDeps {
  store: ScanStore;
  /** Built per run so the adapters can report each HTTP attempt to this run's call budget and deadline. */
  createAdapters: (onRequest: () => void, signal: AbortSignal) => ModelAdapters;
  loadImage: (path: string) => Promise<Uint8Array>;
  crop: (image: Uint8Array, box: Region["bbox"]) => Promise<Uint8Array>;
  maxCalls: number;
  /** Overrides RUN_BUDGET_MS. Only tests set it. */
  budgetMs?: number;
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

export type RetryDecision = "retry" | "noop";

/**
 * What a person's "Read again" should do. It re-reads only what failed, so it is only worth doing when a
 * reading has an error or the scan itself failed (or went quiet). A finished review, a scan with nothing
 * failed, and one that is running right now are left alone, which also makes a double tap harmless.
 */
export function decideRetry(scan: ScanRecord | null, readings: Pick<Reading, "error">[], now = Date.now()): RetryDecision {
  if (!scan) return "noop";
  if (scan.status === "failed") return "retry";
  if (scan.status === "done") return "noop";
  if (scan.status === "needs_review") return readings.some((r) => r.error) ? "retry" : "noop";
  return now - scan.updatedAt.getTime() > STALE_AFTER_MS ? "retry" : "noop";
}

type ReadTask = { region: Region; reader: ModelAdapters["readers"][number] };

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
    // One deadline for the whole run: every model call stops when it fires.
    const deadline = AbortSignal.timeout(deps.budgetMs ?? RUN_BUDGET_MS);
    const adapters = deps.createAdapters(() => budget.take(), deadline);
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
    // One task per (region, reader) that has no good reading yet, so a resume only redoes what is missing.
    const todo = regions.flatMap((region) =>
      adapters.readers.filter((reader) => !done.has(`${region.id}:${reader.id}`)).map((reader) => ({ region, reader })),
    );
    // Both readers need the same crop; cut it once per region.
    const crops = new Map<string, Promise<Uint8Array>>();
    const cropOf = (region: Region) => {
      let crop = crops.get(region.id);
      if (!crop) crops.set(region.id, (crop = deps.crop(image, growBBox(region.bbox, READ_MARGIN, READ_MARGIN))));
      return crop;
    };

    let stopped: BudgetExceededError | null = null;
    const readOne = async ({ region, reader }: ReadTask): Promise<Reading | null> => {
      if (stopped) return null;
      try {
        // Past the deadline nothing new starts. The gap is stored as a failed reading, so it shows on the
        // review screen and a "read again" redoes it, instead of the platform killing the run mid-way.
        if (deadline.aborted) throw new DeadlineError();
        const reading = await reader.readRegion({ regionId: region.id, kind: region.kind, image: await cropOf(region) });
        await store.upsertReading(reading);
        return reading;
      } catch (err) {
        if (err instanceof BudgetExceededError) {
          stopped = err;
          return null;
        }
        // One bad region or reader must not sink the scan: keep the failure as that reading.
        const message = err instanceof Error ? err.message : "Reading failed";
        // Our own message only (it never holds a key, URL or header), so the runtime log says who stalled.
        console.warn(`reading failed: ${region.kind} by ${reader.id}: ${message}`);
        const failed: Reading = { regionId: region.id, model: reader.id, fields: {}, latencyMs: 0, error: message };
        await store.upsertReading(failed);
        return failed;
      }
    };
    // One pool per reader. In a single shared pool a slow reader filled every lane and the other reader's
    // tasks waited behind it, so a hung Muse Spark also stopped Muse Spark Open from reading anything.
    // Lanes are split evenly, so at most CONCURRENCY model calls are still in flight at once.
    const lanes = Math.max(1, Math.floor(CONCURRENCY / adapters.readers.length));
    await Promise.all(adapters.readers.map((reader) => pool(todo.filter((task) => task.reader === reader), lanes, readOne)));
    if (deadline.aborted) console.warn("run deadline reached: unfinished readings were stored as failed");

    if (stopped) throw stopped;
    // Judge by every stored reading, not only this run's: a retry that re-fails its few readings must not
    // turn a scan that still has good readings into a failed one.
    if (todo.length > 0 && (await store.getReadings(scanId)).every((r) => r.error)) {
      throw new Error("No region could be read. Try again, or retake the photo.");
    }

    // The reconciled fields are derived from the stored readings whenever they are asked for
    // (see buildScanResult). Running it here makes a reconcile bug fail the scan, not the review screen.
    await store.setStatus(scanId, "reconciling");
    const readings = await store.getReadings(scanId);
    for (const region of regions) {
      ReconciledFieldSchema.array().parse(reconcileReadings(readings.filter((r) => r.regionId === region.id)));
    }
    await store.setStatus(scanId, "needs_review");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Processing failed";
    await store.setStatus(scanId, "failed", message);
  }
}

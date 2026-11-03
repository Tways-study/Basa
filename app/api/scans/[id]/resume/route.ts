import { after } from "next/server";
import { getModelAdapters } from "@/lib/models";
import { getPipelineEnv } from "@/lib/env";
import { cropRegion } from "@/lib/pipeline/crop";
import { decideRetry, runPipeline } from "@/lib/pipeline/run";
import { ScanIdSchema, type SyncAccepted } from "@/lib/schemas";
import { createSupabaseStore } from "@/lib/server/store";
import { downloadScanImage } from "@/lib/server/storage";

// Same limit as the sync route: the run goes on after the response and each stage is saved.
// A literal on purpose (Next reads it statically); keep it above RUN_BUDGET_MS and below STALE_AFTER_MS.
export const maxDuration = 120;

const json = (body: unknown, status: number) => Response.json(body, { status });

/**
 * "Read again": redo only the readings that failed, for a scan that already reached review or that failed.
 * The browser sends no image: the stored one is used. Safe to call twice, a second call while it runs does nothing.
 */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = ScanIdSchema.safeParse((await ctx.params).id);
  if (!id.success) return json({ error: "Scan id must be a UUID." }, 400);

  try {
    const store = createSupabaseStore();
    const scan = await store.getScan(id.data);
    if (!scan) return json({ error: "Scan not found." }, 404);

    if (decideRetry(scan, await store.getReadings(id.data)) === "noop") {
      const body: SyncAccepted = { scanId: id.data, status: scan.status };
      return json(body, 200);
    }

    // Put the scan back in "reading" before answering, so a second tap sees it running and does nothing.
    await store.setStatus(id.data, "reading");
    const { MAX_MODEL_CALLS_PER_SCAN } = getPipelineEnv();
    after(() =>
      runPipeline(id.data, {
        store,
        createAdapters: (onRequest, signal) => getModelAdapters({ onRequest, signal }),
        loadImage: downloadScanImage,
        crop: cropRegion,
        maxCalls: MAX_MODEL_CALLS_PER_SCAN,
      }),
    );

    const body: SyncAccepted = { scanId: id.data, status: "reading" };
    return json(body, 202);
  } catch (err) {
    console.error("resume failed:", err instanceof Error ? err.message : "unknown error");
    return json({ error: "Could not start reading again. Try again." }, 500);
  }
}

import { after } from "next/server";
import { getModelAdapters } from "@/lib/models";
import { getPipelineEnv } from "@/lib/env";
import { cropRegion, normalizeImage } from "@/lib/pipeline/crop";
import { decideAdmission } from "@/lib/pipeline/admission";
import { decideStart, runPipeline } from "@/lib/pipeline/run";
import { MAX_UPLOAD_BYTES, ScanIdSchema, type SyncAccepted } from "@/lib/schemas";
import { countScansSince, createSupabaseStore } from "@/lib/server/store";
import { downloadScanImage, imagePathFor, uploadScanImage } from "@/lib/server/storage";

// Hobby allows up to 300 s. A healthy scan takes about 10-25 s, but on 2026-11-03 model calls hung (segmenting took
// over 30 s, later a reading waited out a whole request timeout) and 60 s killed runs mid-read, leaving scans stuck on "reading".
// The run gives up on its own at RUN_BUDGET_MS (100 s) and stores what is missing as failed readings.
// A literal on purpose (Next reads it statically); keep it above RUN_BUDGET_MS and below STALE_AFTER_MS.
export const maxDuration = 120;

const json = (body: unknown, status: number) => Response.json(body, { status });

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Send multipart form data with scanId and image." }, 400);
  }

  const scanId = ScanIdSchema.safeParse(form.get("scanId"));
  if (!scanId.success) return json({ error: "scanId must be a UUID." }, 400);

  const file = form.get("image");
  if (!(file instanceof File)) return json({ error: "image is required." }, 400);
  if (file.size > MAX_UPLOAD_BYTES) {
    return json({ error: `Image is over ${MAX_UPLOAD_BYTES / 1024 / 1024} MB. Compress it and try again.` }, 413);
  }

  try {
    const store = createSupabaseStore();
    const existing = await store.getScan(scanId.data);
    const decision = decideStart(existing);
    if (decision === "noop") {
      const body: SyncAccepted = { scanId: scanId.data, status: existing?.status ?? "queued" };
      return json(body, 200);
    }

    // Only a new scan costs model calls, so only a new scan is counted. A known id returned above.
    const { MAX_SCANS_PER_HOUR, MAX_SCANS_PER_DAY } = getPipelineEnv();
    const now = Date.now();
    const [lastHour, lastDay] = await Promise.all([
      countScansSince(new Date(now - 3_600_000)),
      countScansSince(new Date(now - 86_400_000)),
    ]);
    const admission = decideAdmission({ lastHour, lastDay }, { perHour: MAX_SCANS_PER_HOUR, perDay: MAX_SCANS_PER_DAY });
    if (!admission.ok) {
      return Response.json(
        { error: "Basa is busy right now. Your photo is saved on this device; try again in a few minutes." },
        { status: 429, headers: { "Retry-After": String(admission.retryAfterSeconds) } },
      );
    }

    let image: Uint8Array;
    try {
      image = await normalizeImage(new Uint8Array(await file.arrayBuffer()));
    } catch {
      return json({ error: "That file is not a readable image." }, 415);
    }

    const path = imagePathFor(scanId.data);
    await uploadScanImage(path, image);
    await store.createScan(scanId.data, path);
    await store.setStatus(scanId.data, "queued");

    const { MAX_MODEL_CALLS_PER_SCAN } = getPipelineEnv();
    // Respond now; the stages run after the response and each one is saved, so a retry resumes.
    after(() =>
      runPipeline(scanId.data, {
        store,
        createAdapters: (onRequest, signal) => getModelAdapters({ onRequest, signal }),
        loadImage: downloadScanImage,
        crop: cropRegion,
        maxCalls: MAX_MODEL_CALLS_PER_SCAN,
      }),
    );

    const body: SyncAccepted = { scanId: scanId.data, status: "queued" };
    return json(body, 202);
  } catch (err) {
    console.error("sync failed:", err instanceof Error ? err.message : "unknown error");
    return json({ error: "Could not accept the scan. Try again." }, 500);
  }
}

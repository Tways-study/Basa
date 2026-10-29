import { after } from "next/server";
import { getModelAdapters } from "@/lib/models";
import { getPipelineEnv } from "@/lib/env";
import { cropRegion, normalizeImage } from "@/lib/pipeline/crop";
import { decideStart, runPipeline } from "@/lib/pipeline/run";
import { MAX_UPLOAD_BYTES, ScanIdSchema, type SyncAccepted } from "@/lib/schemas";
import { createSupabaseStore } from "@/lib/server/store";
import { downloadScanImage, imagePathFor, uploadScanImage } from "@/lib/server/storage";

// Hobby allows up to 300 s. A scan takes about 10-15 s; 60 s leaves room without letting a stuck call run for minutes.
export const maxDuration = 60;

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
        createAdapters: (onRequest) => getModelAdapters({ onRequest }),
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

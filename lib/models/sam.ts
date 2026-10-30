import sharp from "sharp";
import { z } from "zod";
import { getSamEnv } from "@/lib/env";
import { iou, padBBox } from "@/lib/pipeline/bbox";
import { BudgetExceededError } from "@/lib/pipeline/budget";
import { BBoxSchema, type BBox } from "@/lib/schemas";
import { REQUEST_TIMEOUT_MS, RetryableError, withRetries, type ChatOptions } from "./chat";
import type { SegmentedRegion } from "./types";

// SAM 3.1 through the Meta API Responses endpoint. Request and output grammar: docs/models-notes.md
// ("SAM 3.1 (Meta API)"), checked against a live box-prompt call on 2026-10-30.
//
// What this does: Muse Spark proposes loose boxes; one SAM request with those boxes as prompts returns
// tight boxes. Masks are parsed but NOT decoded: the base85 alphabet and raster layout are not written in
// any doc we may use, and the vendor parser library is off limits (CLAUDE.md rule 1). See models-notes.md.

export type SamOptions = ChatOptions;

const LABEL = "SAM 3.1";
const MIN_OVERLAP = 0.3; // a refined box that barely touches the proposal snapped to something else
const REFINED_PAD = 0.01; // SAM boxes are tight; a sliver of margin keeps tilted text from being clipped

const Int = z.number().int().nonnegative();

export const SamRecordSchema = z.object({
  id: z.number().int().positive(),
  box: z.object({ x1: Int, y1: Int, x2: Int, y2: Int, w: Int.positive(), h: Int.positive() }),
  // Raw, undecoded. `encoding` is the marker the server sent (observed `~` for box prompts).
  mask: z.object({ height: Int, width: Int, encoding: z.enum(["~", "!"]), payload: z.string() }),
});
export type SamRecord = z.infer<typeof SamRecordSchema>;

// One record: id, box, mask. The payload is base85 and may itself contain "," and "|", so the record is
// closed by "|>" only when the next record (or the end of the line) follows. The real line ends with a
// newline (observed), which cost the last record until the end check allowed trailing whitespace.
const RECORD =
  /(\d+)<\|box;x1=(\d+);y1=(\d+);x2=(\d+);y2=(\d+);w=(\d+);h=(\d+)(?:;c=[\d.]+)?\|><\|mask;x=0;y=0(?:;c=[\d.]+)?;data=(\d+),(\d+),([~!])([\s\S]*?)\|>(?=,\d+<\|box;|\s*$)/g;

/** One output line (one frame) into validated records. A line with no records is zero matches. */
export function parseSamLine(line: string): SamRecord[] {
  const records: SamRecord[] = [];
  for (const m of line.matchAll(RECORD)) {
    records.push(
      SamRecordSchema.parse({
        id: Number(m[1]),
        box: { x1: Number(m[2]), y1: Number(m[3]), x2: Number(m[4]), y2: Number(m[5]), w: Number(m[6]), h: Number(m[7]) },
        mask: { height: Number(m[8]), width: Number(m[9]), encoding: m[10], payload: m[11] },
      }),
    );
  }
  return records;
}

/**
 * The stream repeats the same payload in the delta, `done` and `completed` events (observed), so only
 * `response.output_text.delta` is read. No `response.completed` means the stream was cut off.
 */
export function readSamStream(sse: string): string[] {
  const lines: string[] = [];
  let completed = false;
  for (const block of sse.split(/\r?\n\r?\n/)) {
    const event = /^event: (.+)$/m.exec(block)?.[1];
    if (event === "response.completed") completed = true;
    if (event !== "response.output_text.delta") continue;
    const data = /^data: (.+)$/m.exec(block)?.[1];
    if (!data) continue;
    const delta = z.object({ delta: z.string() }).parse(JSON.parse(data)).delta;
    lines.push(delta);
  }
  if (!completed) throw new Error(`${LABEL} stream ended before it completed`);
  return lines;
}

/** Box prompt text for an image: one object per region, ids from 1 (id 0 was rejected, observed). */
export function buildBoxPrompt(boxes: BBox[], width: number, height: number): string {
  const tokens = boxes.map((b, i) => {
    const x1 = Math.min(width - 2, Math.floor(b.x * width));
    const y1 = Math.min(height - 2, Math.floor(b.y * height));
    // x2 and y2 are inclusive (documented), so the last pixel is size - 1.
    const x2 = Math.max(x1 + 1, Math.min(width - 1, Math.ceil((b.x + b.w) * width) - 1));
    const y2 = Math.max(y1 + 1, Math.min(height - 1, Math.ceil((b.y + b.h) * height) - 1));
    return `${i + 1}<|box;x1=${x1};y1=${y1};x2=${x2};y2=${y2};w=${width};h=${height}|>`;
  });
  return `<0f>${tokens.join(",")}`;
}

/** SAM's pixel box (corners inclusive) into the fractional box we store. */
export function toFractionBox(box: SamRecord["box"]): BBox {
  const x = box.x1 / box.w;
  const y = box.y1 / box.h;
  return BBoxSchema.parse({
    x,
    y,
    w: Math.min((box.x2 - box.x1 + 1) / box.w, 1 - x),
    h: Math.min((box.y2 - box.y1 + 1) / box.h, 1 - y),
  });
}

/** Replace each proposed box with SAM's tight box for the same id, unless SAM missed it or went elsewhere. */
export function applyRefinement(regions: SegmentedRegion[], records: SamRecord[]): SegmentedRegion[] {
  const byId = new Map(records.map((r) => [r.id, r]));
  return regions.map((region, i) => {
    const record = byId.get(i + 1);
    if (!record) return region;
    const refined = toFractionBox(record.box);
    if (iou(refined, region.bbox) < MIN_OVERLAP) return region;
    return { ...region, bbox: padBBox(refined, REFINED_PAD) };
  });
}

async function postBoxes(prompt: string, image: Uint8Array, opts: SamOptions): Promise<string> {
  const env = getSamEnv();
  const doFetch = opts.fetchImpl ?? fetch;
  const body = JSON.stringify({
    model: env.META_SAM_MODEL,
    stream: true,
    input: [
      {
        type: "message",
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: `data:image/jpeg;base64,${Buffer.from(image).toString("base64")}` },
        ],
      },
    ],
  });

  return withRetries(LABEL, opts, async () => {
    let res: Response;
    try {
      res = await doFetch(`${env.META_API_BASE_URL}/responses`, {
        method: "POST",
        headers: { Authorization: `Bearer ${env.META_API_KEY}`, "Content-Type": "application/json", Accept: "text/event-stream" },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new RetryableError(`${LABEL} request timed out or the network failed`);
    }
    if (!res.ok) {
      const parsed = z.object({ error: z.object({ message: z.string().nullish() }) }).safeParse(await res.json().catch(() => null));
      const detail = parsed.success && parsed.data.error.message ? `: ${parsed.data.error.message.slice(0, 200)}` : "";
      const message = `${LABEL} returned HTTP ${res.status}${detail}`;
      if (res.status === 429 || res.status >= 500) throw new RetryableError(message);
      throw new Error(message);
    }
    return res.text();
  });
}

export interface RegionRefiner {
  refine(image: Uint8Array, regions: SegmentedRegion[]): Promise<SegmentedRegion[]>;
}

/**
 * One SAM request for all regions. If SAM fails for any reason except the call cap, the proposed boxes
 * are kept (the documented fallback): reading still works, only the boxes are looser.
 */
export function createSamRefiner(opts: SamOptions = {}): RegionRefiner {
  return {
    async refine(image, regions) {
      if (regions.length === 0) return regions;
      try {
        const { width, height } = await sharp(image).metadata();
        if (!width || !height) throw new Error("Could not read image dimensions");
        const prompt = buildBoxPrompt(regions.map((r) => r.bbox), width, height);
        const lines = readSamStream(await postBoxes(prompt, image, opts));
        const records = lines.flatMap(parseSamLine);
        return applyRefinement(regions, records);
      } catch (err) {
        if (err instanceof BudgetExceededError) throw err;
        console.warn(`SAM refinement skipped, keeping proposed boxes: ${err instanceof Error ? err.message : "unknown error"}`);
        return regions;
      }
    },
  };
}

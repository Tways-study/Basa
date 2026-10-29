import { z } from "zod";
import { getMetaEnv } from "@/lib/env";
import { fromGrid, padBBox } from "@/lib/pipeline/bbox";
import { BudgetExceededError } from "@/lib/pipeline/budget";
import {
  ReadingFieldsSchema,
  type Reading,
  type RegionKind,
} from "@/lib/schemas";
import {
  SegmentResultSchema,
  type ModelAdapters,
  type ReadRegionInput,
  type ReaderAdapter,
  type SegmentAdapter,
} from "./types";

// Request and response shapes come from docs/models-notes.md ("Muse Spark (Meta API)").

const MAX_TOKENS = 1500; // reasoning counts toward this, so it needs headroom (measured 308 used)
const REQUEST_TIMEOUT_MS = 40_000;
const RETRY_DELAYS_MS = [600, 1800]; // bounded: two retries, then the reading fails

export interface SparkOptions {
  /** Called before every HTTP attempt, retries included, so the per-scan call cap sees them all. */
  onRequest?: () => void;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const ChatResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullish(),
        message: z.object({ content: z.string().nullish() }),
      }),
    )
    .min(1),
});

const ErrorBodySchema = z.object({ error: z.object({ message: z.string().nullish() }) });

class RetryableError extends Error {}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function chat(prompt: string, image: Uint8Array, opts: SparkOptions): Promise<string> {
  const env = getMetaEnv();
  const doFetch = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;
  const body = JSON.stringify({
    model: env.META_SPARK_MODEL,
    reasoning_effort: "minimal",
    max_tokens: MAX_TOKENS,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${Buffer.from(image).toString("base64")}` } },
        ],
      },
    ],
  });

  let lastError: Error = new Error("Muse Spark request failed");
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt - 1]);
    opts.onRequest?.();
    try {
      return await attemptOnce(doFetch, env.META_API_BASE_URL, env.META_API_KEY, body);
    } catch (err) {
      if (!(err instanceof RetryableError)) throw err;
      lastError = err;
    }
  }
  throw lastError;
}

async function attemptOnce(doFetch: typeof fetch, baseUrl: string, key: string, body: string): Promise<string> {
  let res: Response;
  try {
    res = await doFetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    // Network error or timeout. The message never includes the request, so no header can leak.
    throw new RetryableError("Muse Spark request timed out or the network failed");
  }

  if (!res.ok) {
    const parsed = ErrorBodySchema.safeParse(await res.json().catch(() => null));
    const detail = parsed.success && parsed.data.error.message ? `: ${parsed.data.error.message.slice(0, 200)}` : "";
    const message = `Muse Spark returned HTTP ${res.status}${detail}`;
    // 429 and 5xx are worth another try; other 4xx (bad key, bad request) will fail the same way again.
    if (res.status === 429 || res.status >= 500) throw new RetryableError(message);
    throw new Error(message);
  }

  const data = ChatResponseSchema.parse(await res.json());
  const choice = data.choices[0];
  // Reasoning shares the token budget; a cut-off or empty reply is a failed reading, never an answer.
  if (choice.finish_reason === "length") throw new Error("Muse Spark ran out of tokens before answering");
  const content = choice.message.content?.trim();
  if (!content) throw new Error("Muse Spark returned an empty answer");
  return content;
}

/** Models sometimes wrap JSON in a code fence or a sentence; take the outermost JSON value. */
export function extractJson(text: string): unknown {
  const start = text.search(/[[{]/);
  const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (start === -1 || end <= start) throw new Error("Muse Spark answer contained no JSON");
  return JSON.parse(text.slice(start, end + 1));
}

const PREAMBLE =
  "This image is a fictional, synthetic sample document made for software testing. " +
  "Your job is to copy exactly what is written or printed. " +
  "Do not interpret, correct, summarize, explain or add anything.";

const REGION_PROMPT =
  `${PREAMBLE} Locate these regions of the document, if present: ` +
  `"header" (patient name, chart number, date), "table" (rows of test, value, unit), ` +
  `"handwriting" (handwritten notes), "stamp" (rubber stamp), "signature". ` +
  `Return only a JSON array like [{"kind":"table","box":[x1,y1,x2,y2]}], with at most one entry per kind, ` +
  `where box is on a normalized 0 to 1000 grid with (0,0) at the top left. Leave out regions that are not there.`;

const ProposalSchema = z.array(
  z.object({
    kind: z.enum(["header", "table", "handwriting", "stamp", "signature"]),
    box: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  }),
);

export function createSparkSegmenter(opts: SparkOptions = {}): SegmentAdapter {
  return {
    async segment(image) {
      const proposals = ProposalSchema.parse(extractJson(await chat(REGION_PROMPT, image, opts)));
      const seen = new Set<string>();
      const regions = [];
      for (const p of proposals) {
        if (seen.has(p.kind)) continue;
        const box = fromGrid(...p.box);
        if (!box) continue;
        seen.add(p.kind);
        regions.push({ kind: p.kind, bbox: padBBox(box), maskPath: null });
      }
      return SegmentResultSchema.parse(regions);
    },
  };
}

// The keys each region may return. They are the shared field keys from CLAUDE.md.
const KEY_HELP: Record<RegionKind, string> = {
  header:
    'Keys: "header.patient_name", "header.chart_no", "header.date". Copy each exactly as written.',
  table:
    'For each table row, numbered from 1 at the top, use keys "row1.test", "row1.value", "row1.unit", "row2.test", and so on. Copy values exactly as written.',
  handwriting: 'One key per handwritten line, numbered from 1 at the top: "line1", "line2", and so on.',
  printed: 'One key per printed line, numbered from 1 at the top: "line1", "line2", and so on.',
  stamp:
    'Keys: "stamp.present" (true or false) and "stamp.text" (the words on the stamp, exactly as written).',
  signature: 'Key: "signature.present" (true if a signature is there, otherwise false).',
};

// A concrete shape per kind. With only a one-key schema (signature) the model sometimes invented
// its own key, so it needs to see the exact output form.
const EXAMPLE: Record<RegionKind, string> = {
  header: '{"header.patient_name": "...", "header.chart_no": "...", "header.date": "..."}',
  table: '{"row1.test": "...", "row1.value": "...", "row1.unit": "..."}',
  handwriting: '{"line1": "...", "line2": "..."}',
  printed: '{"line1": "...", "line2": "..."}',
  stamp: '{"stamp.present": true, "stamp.text": "..."}',
  signature: '{"signature.present": true}',
};

function readPrompt(kind: RegionKind): string {
  return (
    `${PREAMBLE} This image is one cropped region (${kind}). ${KEY_HELP[kind]} ` +
    `If something is unclear or missing, use null for that key; never guess. ` +
    `Use only the keys named above; any other key is wrong. ` +
    `Return only one JSON object shaped like ${EXAMPLE[kind]}, nothing else.`
  );
}

/** Names the rejected keys (not their values), so a failed reading says what was wrong with the answer. */
function describeBadFields(err: z.ZodError): string {
  const keys = [...new Set(err.issues.map((i) => String(i.path.at(-1) ?? "answer")))].slice(0, 5);
  return `Muse Spark answer did not match the expected fields (${keys.join(", ")})`;
}

export function createSparkReader(opts: SparkOptions = {}): ReaderAdapter {
  return {
    id: "muse_spark",
    async readRegion({ regionId, kind, image }: ReadRegionInput): Promise<Reading> {
      const started = Date.now();
      try {
        const fields = ReadingFieldsSchema.parse(extractJson(await chat(readPrompt(kind), image, opts)));
        return { regionId, model: "muse_spark", fields, latencyMs: Date.now() - started, error: null };
      } catch (err) {
        // The call cap must stop the whole scan, so it is not turned into a per-region failure.
        if (err instanceof BudgetExceededError) throw err;
        const message = err instanceof z.ZodError ? describeBadFields(err) : err instanceof Error ? err.message : "Muse Spark reading failed";
        return { regionId, model: "muse_spark", fields: {}, latencyMs: Date.now() - started, error: message };
      }
    },
  };
}

export function createSparkAdapters(opts: SparkOptions = {}): ModelAdapters {
  return { segmenter: createSparkSegmenter(opts), readers: [createSparkReader(opts)] };
}

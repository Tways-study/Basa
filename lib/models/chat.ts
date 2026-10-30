import { z } from "zod";

// One OpenAI-style chat-completions call with an image, shared by both readers. Shapes come from
// docs/models-notes.md ("Muse Spark (Meta API)" and "Muse Spark Open (Baseten)").

const MAX_TOKENS = 1500; // reasoning counts toward this, so it needs headroom (measured 308 to 434 used)
const REQUEST_TIMEOUT_MS = 40_000;
const RETRY_DELAYS_MS = [600, 1800]; // bounded: two retries, then the reading fails

export interface ChatOptions {
  /** Called before every HTTP attempt, retries included, so the per-scan call cap sees them all. */
  onRequest?: () => void;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export interface ChatTarget {
  /** Shown in error messages, e.g. "Muse Spark". Never a key or URL. */
  label: string;
  /** The full chat-completions URL. */
  endpoint: string;
  key: string;
  model: string;
  reasoningEffort: "minimal" | "low";
}

// Only `content` is read. Baseten also returns `reasoning_content`; it is never parsed, stored or shown.
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

// Meta sends {"error":{"message":"..."}}; Baseten sends {"error":"..."} (observed).
const ErrorBodySchema = z.object({
  error: z.union([z.string(), z.object({ message: z.string().nullish() })]),
});

class RetryableError extends Error {}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function chatCompletion(
  target: ChatTarget,
  prompt: string,
  image: Uint8Array,
  opts: ChatOptions,
): Promise<string> {
  const doFetch = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;
  const body = JSON.stringify({
    model: target.model,
    reasoning_effort: target.reasoningEffort,
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

  let lastError: Error = new Error(`${target.label} request failed`);
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt - 1]);
    opts.onRequest?.();
    try {
      return await attemptOnce(doFetch, target, body);
    } catch (err) {
      if (!(err instanceof RetryableError)) throw err;
      lastError = err;
    }
  }
  throw lastError;
}

async function attemptOnce(doFetch: typeof fetch, target: ChatTarget, body: string): Promise<string> {
  let res: Response;
  try {
    res = await doFetch(target.endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${target.key}`, "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    // Network error or timeout. The message never includes the request, so no header can leak.
    throw new RetryableError(`${target.label} request timed out or the network failed`);
  }

  if (!res.ok) {
    const parsed = ErrorBodySchema.safeParse(await res.json().catch(() => null));
    const text = parsed.success ? (typeof parsed.data.error === "string" ? parsed.data.error : parsed.data.error.message) : null;
    const detail = text ? `: ${text.slice(0, 200)}` : "";
    const message = `${target.label} returned HTTP ${res.status}${detail}`;
    // 429 and 5xx are worth another try; other 4xx (bad key, bad request) will fail the same way again.
    if (res.status === 429 || res.status >= 500) throw new RetryableError(message);
    throw new Error(message);
  }

  const data = ChatResponseSchema.parse(await res.json());
  const choice = data.choices[0];
  // Reasoning shares the token budget; a cut-off or empty reply is a failed reading, never an answer.
  if (choice.finish_reason === "length") throw new Error(`${target.label} ran out of tokens before answering`);
  const content = choice.message.content?.trim();
  if (!content) throw new Error(`${target.label} returned an empty answer`);
  return content;
}

import { getBasetenEnv } from "@/lib/env";
import { chatCompletion, type ChatOptions } from "./chat";
import { createChatReader } from "./reader";
import type { ReaderAdapter } from "./types";

// Muse Spark Open through Baseten's Model API. Request and response shapes: docs/models-notes.md
// ("Muse Spark Open (Baseten)"). It always reasons, so `reasoning_effort: low` and only `content` is read.
// It cannot propose regions (observed), so there is no segmenter here.

const LABEL = "Muse Spark Open";

export function createBasetenReader(opts: ChatOptions = {}): ReaderAdapter {
  return createChatReader("muse_spark_open", LABEL, (prompt, image) => {
    // Read inside the call so missing variables fail this reading, not the whole scan.
    const env = getBasetenEnv();
    return chatCompletion(
      {
        label: LABEL,
        endpoint: env.BASETEN_MODEL_URL, // the full chat-completions endpoint, not just the base
        key: env.BASETEN_API_KEY,
        model: env.BASETEN_MODEL,
        reasoningEffort: "low",
      },
      prompt,
      image,
      opts,
    );
  });
}

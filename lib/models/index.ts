import { createMockAdapters } from "./mock";
import { createBasetenReader } from "./baseten";
import { createSparkReader, createSparkSegmenter } from "./spark";
import type { ModelAdapters } from "./types";

export * from "./types";

export interface AdapterOptions {
  /** Called before every real HTTP attempt; the pipeline uses it to enforce MAX_MODEL_CALLS_PER_SCAN. */
  onRequest?: () => void;
}

/**
 * Muse Spark proposes the regions and reads them; Muse Spark Open (Baseten) reads them a second time.
 * SAM masks are not wired yet: they wait for the region strategy to be tested on a real phone photo.
 */
export function getModelAdapters(opts: AdapterOptions = {}): ModelAdapters {
  if (process.env.MOCK_MODELS === "true") return createMockAdapters();
  return {
    segmenter: createSparkSegmenter({ onRequest: opts.onRequest }),
    readers: [createSparkReader({ onRequest: opts.onRequest }), createBasetenReader({ onRequest: opts.onRequest })],
  };
}

import { createMockAdapters } from "./mock";
import { createBasetenReader } from "./baseten";
import { createSamRefiner } from "./sam";
import { createSparkReader, createSparkSegmenter } from "./spark";
import type { ModelAdapters } from "./types";

export * from "./types";

export interface AdapterOptions {
  /** Called before every real HTTP attempt; the pipeline uses it to enforce MAX_MODEL_CALLS_PER_SCAN. */
  onRequest?: () => void;
}

/**
 * Muse Spark proposes the regions and reads them; Muse Spark Open (Baseten) reads them a second time.
 * One SAM request then tightens the boxes Muse Spark proposed (SAM masks are not decoded yet; see sam.ts).
 */
export function getModelAdapters(opts: AdapterOptions = {}): ModelAdapters {
  if (process.env.MOCK_MODELS === "true") return createMockAdapters();
  const proposer = createSparkSegmenter({ onRequest: opts.onRequest });
  const sam = createSamRefiner({ onRequest: opts.onRequest });
  return {
    segmenter: { segment: async (image) => sam.refine(image, await proposer.segment(image)) },
    readers: [createSparkReader({ onRequest: opts.onRequest }), createBasetenReader({ onRequest: opts.onRequest })],
  };
}

import { createMockAdapters } from "./mock";
import { createBasetenReader } from "./baseten";
import { createSamRefiner } from "./sam";
import { createSparkReader, createSparkSegmenter } from "./spark";
import type { ModelAdapters } from "./types";

export * from "./types";

export interface AdapterOptions {
  /** Called before every real HTTP attempt; the pipeline uses it to enforce MAX_MODEL_CALLS_PER_SCAN. */
  onRequest?: () => void;
  /** The run's deadline; every model call stops when it fires (see ChatOptions.signal). */
  signal?: AbortSignal;
}

/**
 * Muse Spark proposes the regions and reads them; Muse Spark Open (Baseten) reads them a second time.
 * One SAM request then tightens the boxes Muse Spark proposed (SAM masks are not decoded yet; see sam.ts).
 */
export function getModelAdapters(opts: AdapterOptions = {}): ModelAdapters {
  if (process.env.MOCK_MODELS === "true") return createMockAdapters();
  const chat = { onRequest: opts.onRequest, signal: opts.signal };
  const proposer = createSparkSegmenter(chat);
  const sam = createSamRefiner(chat);
  return {
    segmenter: { segment: async (image) => sam.refine(image, await proposer.segment(image)) },
    readers: [createSparkReader(chat), createBasetenReader(chat)],
  };
}

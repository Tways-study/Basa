import { createMockAdapters } from "./mock";
import { createSparkAdapters } from "./spark";
import type { ModelAdapters } from "./types";

export * from "./types";

export interface AdapterOptions {
  /** Called before every real HTTP attempt; the pipeline uses it to enforce MAX_MODEL_CALLS_PER_SCAN. */
  onRequest?: () => void;
}

/**
 * Phase 3 has one real reader (Muse Spark). SAM and the Baseten reader arrive in Phase 4, so
 * the second reader and mask segmentation are not wired here yet.
 */
export function getModelAdapters(opts: AdapterOptions = {}): ModelAdapters {
  if (process.env.MOCK_MODELS === "true") return createMockAdapters();
  return createSparkAdapters({ onRequest: opts.onRequest });
}

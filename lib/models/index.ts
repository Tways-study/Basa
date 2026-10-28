import { createMockAdapters } from "./mock";
import type { ModelAdapters } from "./types";

export * from "./types";

/**
 * Mock mode needs no credentials. The real adapters are not written yet on purpose:
 * their request and response shapes must come from docs/models-notes.md (Phase 1 smoke test), not guesses.
 */
export function getModelAdapters(): ModelAdapters {
  if (process.env.MOCK_MODELS === "true") return createMockAdapters();
  throw new Error(
    "Real model adapters are not implemented yet. Set MOCK_MODELS=true, or finish the smoke test and docs/models-notes.md first.",
  );
}

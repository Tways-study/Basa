import { z } from "zod";
import { getMetaEnv } from "@/lib/env";
import { fromGrid, padBBox } from "@/lib/pipeline/bbox";
import {
  SegmentResultSchema,
  type ReaderAdapter,
  type SegmentAdapter,
} from "./types";
import { chatCompletion, type ChatOptions } from "./chat";
import { PREAMBLE, createChatReader, extractJson } from "./reader";

// Request and response shapes come from docs/models-notes.md ("Muse Spark (Meta API)").

export { extractJson };
export type SparkOptions = ChatOptions;

const LABEL = "Muse Spark";

function chat(prompt: string, image: Uint8Array, opts: SparkOptions): Promise<string> {
  // Read inside the call so missing variables fail this call, not module load.
  const env = getMetaEnv();
  return chatCompletion(
    {
      label: LABEL,
      endpoint: `${env.META_API_BASE_URL}/chat/completions`,
      key: env.META_API_KEY,
      model: env.META_SPARK_MODEL,
      reasoningEffort: "minimal",
    },
    prompt,
    image,
    opts,
  );
}

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

export function createSparkReader(opts: SparkOptions = {}): ReaderAdapter {
  return createChatReader("muse_spark", LABEL, (prompt, image) => chat(prompt, image, opts));
}

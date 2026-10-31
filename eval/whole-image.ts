import { getMetaEnv } from "@/lib/env";
import { chatCompletion, type ChatOptions } from "@/lib/models/chat";
import { PREAMBLE, extractJson } from "@/lib/models/reader";
import { ReadingFieldsSchema, type ReadingFields } from "@/lib/schemas";

// Condition A: one Muse Spark read of the whole chart, with no segmentation. It uses the same chat
// call, model and reasoning setting as the real reader, so the only difference from B is the missing regions.

export const WHOLE_IMAGE_PROMPT =
  `${PREAMBLE} This image is one whole clinic chart. ` +
  `Return one JSON object using only these keys, as written: ` +
  `"header.patient_name", "header.chart_no", "header.date"; ` +
  `for each result row of the table, numbered from 1 at the top and skipping the row that names the columns, ` +
  `"row1.test", "row1.value", "row1.unit", "row2.test", and so on; ` +
  `for each handwritten line, numbered from 1 at the top, "line1", "line2", and so on; ` +
  `"stamp.present" (true or false) and "stamp.text"; "signature.present" (true or false). ` +
  `If something is unclear or missing, use null for that key; never guess. ` +
  `Any other key is wrong. Return only the JSON object, nothing else.`;

export interface WholeImageResult {
  fields: ReadingFields;
  latencyMs: number;
  error: string | null;
}

export async function readWholeImage(image: Uint8Array, opts: ChatOptions = {}): Promise<WholeImageResult> {
  const started = Date.now();
  try {
    const env = getMetaEnv();
    const text = await chatCompletion(
      {
        label: "Muse Spark",
        endpoint: `${env.META_API_BASE_URL}/chat/completions`,
        key: env.META_API_KEY,
        model: env.META_SPARK_MODEL,
        reasoningEffort: "minimal",
      },
      WHOLE_IMAGE_PROMPT,
      image,
      opts,
    );
    const fields = ReadingFieldsSchema.parse(extractJson(text));
    return { fields, latencyMs: Date.now() - started, error: null };
  } catch (err) {
    // The call cap must stop the chart, so it is the one failure not turned into a reading.
    if (err instanceof Error && err.name === "BudgetExceededError") throw err;
    return { fields: {}, latencyMs: Date.now() - started, error: err instanceof Error ? err.message : "Whole-image read failed" };
  }
}

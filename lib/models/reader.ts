import { z } from "zod";
import { BudgetExceededError } from "@/lib/pipeline/budget";
import {
  ReadingFieldsSchema,
  type Reading,
  type ReaderId,
  type RegionKind,
} from "@/lib/schemas";
import type { ReadRegionInput, ReaderAdapter } from "./types";

// Both readers get the same prompt, so a difference between them is the models', not the wording's.

/** The model answered in words, not JSON. Seen on a whole table read about one run in three. */
export class NoJsonError extends Error {
  constructor() {
    super("The model's answer contained no JSON");
    this.name = "NoJsonError";
  }
}

/** Models sometimes wrap JSON in a code fence or a sentence; take the outermost JSON value. */
export function extractJson(text: string): unknown {
  const start = text.search(/[[{]/);
  const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (start === -1 || end <= start) throw new NoJsonError();
  return JSON.parse(text.slice(start, end + 1));
}

export const PREAMBLE =
  "This image is a fictional, synthetic sample document made for software testing. " +
  "Your job is to copy exactly what is written or printed. " +
  "Do not interpret, correct, summarize, explain or add anything.";

// The keys each region may return. They are the shared field keys from CLAUDE.md.
const KEY_HELP: Record<RegionKind, string> = {
  header:
    'Keys: "header.patient_name", "header.chart_no", "header.date". Copy each exactly as written.',
  // The chart prints its own column titles (TEST, VALUE, UNIT). Without this line they came back as row1.
  table:
    "Skip the header row, the one that names the columns; start at the first row of results. " +
    'For each result row, numbered from 1 at the top, use keys "row1.test", "row1.value", "row1.unit", "row2.test", and so on. Copy values exactly as written.',
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

export function readPrompt(kind: RegionKind): string {
  return (
    `${PREAMBLE} This image is one cropped region (${kind}). ${KEY_HELP[kind]} ` +
    `If something is unclear or missing, use null for that key; never guess. ` +
    `Use only the keys named above; any other key is wrong. ` +
    `Return only one JSON object shaped like ${EXAMPLE[kind]}, nothing else.`
  );
}

/** Names the rejected keys (not their values), so a failed reading says what was wrong with the answer. */
function describeBadFields(label: string, err: z.ZodError): string {
  const keys = [...new Set(err.issues.map((i) => String(i.path.at(-1) ?? "answer")))].slice(0, 5);
  return `${label} answer did not match the expected fields (${keys.join(", ")})`;
}

/**
 * Wraps a model call into a reader. A failed call becomes a reading with an `error`, shown to the
 * person; only the call cap is allowed to escape, because it must stop the whole scan.
 */
export function createChatReader(
  id: ReaderId,
  label: string,
  send: (prompt: string, image: Uint8Array) => Promise<string>,
): ReaderAdapter {
  return {
    id,
    async readRegion({ regionId, kind, image }: ReadRegionInput): Promise<Reading> {
      const started = Date.now();
      try {
        const prompt = readPrompt(kind);
        let answer: unknown;
        try {
          answer = extractJson(await send(prompt, image));
        } catch (err) {
          // One more try when the answer had no JSON in it. The retry is a real model call, so it counts
          // against the per-scan call cap like any other. Any other failure is not retried here.
          if (!(err instanceof NoJsonError)) throw err;
          answer = extractJson(await send(prompt, image));
        }
        const fields = ReadingFieldsSchema.parse(answer);
        return { regionId, model: id, fields, latencyMs: Date.now() - started, error: null };
      } catch (err) {
        if (err instanceof BudgetExceededError) throw err;
        const message =
          err instanceof z.ZodError ? describeBadFields(label, err) : err instanceof Error ? err.message : `${label} reading failed`;
        return { regionId, model: id, fields: {}, latencyMs: Date.now() - started, error: message };
      }
    },
  };
}

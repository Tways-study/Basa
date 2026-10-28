import { z } from "zod";

// Field keys are the contract in CLAUDE.md ("Shared field keys"). Changing them needs all three of us.
export const FIELD_KEY_PATTERN =
  /^(row[1-9]\d*\.(test|value|unit)|line[1-9]\d*|stamp\.(present|text)|signature\.present|header\.(patient_name|chart_no|date))$/;

export const FieldKeySchema = z.string().regex(FIELD_KEY_PATTERN, "not a shared field key");
export type FieldKey = z.infer<typeof FieldKeySchema>;

// Models may return numbers or booleans; reconcile turns everything into one comparable form.
// null means the reader could not read it. It is never a guess.
export const RawValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export type RawValue = z.infer<typeof RawValueSchema>;

export const ReadingFieldsSchema = z.record(FieldKeySchema, RawValueSchema);
export type ReadingFields = z.infer<typeof ReadingFieldsSchema>;

// Internal labels for the two readers. Real model IDs and URLs come from env, never from here.
export const ReaderIdSchema = z.enum(["muse_spark", "muse_spark_open"]);
export type ReaderId = z.infer<typeof ReaderIdSchema>;

export const ReadingSchema = z.object({
  regionId: z.string().min(1),
  model: ReaderIdSchema,
  fields: ReadingFieldsSchema,
  latencyMs: z.number().int().nonnegative(),
  // Set when the call failed; fields is then empty and reconcile flags everything.
  error: z.string().nullable(),
});
export type Reading = z.infer<typeof ReadingSchema>;

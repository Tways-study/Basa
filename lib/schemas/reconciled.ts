import { z } from "zod";
import { FieldKeySchema } from "./reading";

export const FlagReasonSchema = z.enum([
  "mismatch", // both read it, values differ
  "one_unreadable", // one reader returned null
  "both_unreadable", // neither could read it; a person must still fill it in
  "one_reader_only", // only one reader reported this field or row
]);
export type FlagReason = z.infer<typeof FlagReasonSchema>;

// A discriminated union on purpose: a flagged field has no `value`, so no code path
// can quietly preselect one model's answer.
export const ReconciledFieldSchema = z.discriminatedUnion("status", [
  z.object({
    key: FieldKeySchema,
    status: z.literal("agreed"),
    value: z.string(),
    readings: z.object({ muse_spark: z.string(), muse_spark_open: z.string() }),
  }),
  z.object({
    key: FieldKeySchema,
    status: z.literal("flagged"),
    reason: FlagReasonSchema,
    readings: z.object({
      muse_spark: z.string().nullable(),
      muse_spark_open: z.string().nullable(),
    }),
  }),
]);
export type ReconciledField = z.infer<typeof ReconciledFieldSchema>;

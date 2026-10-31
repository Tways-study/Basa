import { z } from "zod";
import { FieldKeySchema } from "./reading";
import { ScanIdSchema } from "./sync";

// Where a confirmed value came from. `agreed` is only valid for a field the readers matched; the
// server checks that, so a client cannot claim agreement that did not happen.
export const DecisionSourceSchema = z.enum(["agreed", "muse_spark", "muse_spark_open", "edited", "unreadable"]);
export type DecisionSource = z.infer<typeof DecisionSourceSchema>;

// `value` is null only for "unreadable": the person looked at the photo and it cannot be read.
// That is a decision too, and it is stored as null rather than a guess.
export const DecisionSchema = z
  .object({
    key: FieldKeySchema,
    source: DecisionSourceSchema,
    value: z.string().trim().max(500).nullable(),
  })
  .refine((d) => (d.source === "unreadable" ? d.value === null : d.value !== null && d.value !== ""), {
    message: "A value is required unless the field is marked unreadable.",
  });
export type Decision = z.infer<typeof DecisionSchema>;

export const ReviewSubmissionSchema = z.object({
  regionId: z.string().min(1),
  fields: z.array(DecisionSchema).min(1).max(200),
});
export type ReviewSubmission = z.infer<typeof ReviewSubmissionSchema>;

// What GET /api/scans/[id]/review returns. Kept apart from ScanResult, whose shape is frozen.
export const SavedReviewSchema = z.object({
  regionId: z.string().min(1),
  fields: z.array(DecisionSchema),
  reviewedAt: z.string(),
});
export type SavedReview = z.infer<typeof SavedReviewSchema>;

export const ReviewsResponseSchema = z.object({
  scanId: ScanIdSchema,
  reviews: z.array(SavedReviewSchema),
});
export type ReviewsResponse = z.infer<typeof ReviewsResponseSchema>;

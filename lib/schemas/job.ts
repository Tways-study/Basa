import { z } from "zod";

// queued -> segmenting -> reading -> reconciling -> needs_review -> done; failed is reachable from any state.
export const JobStatusSchema = z.enum([
  "queued",
  "segmenting",
  "reading",
  "reconciling",
  "needs_review",
  "done",
  "failed",
]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const JobStatusResponseSchema = z.object({
  scanId: z.string().min(1),
  status: JobStatusSchema,
  error: z.string().nullable(),
});
export type JobStatusResponse = z.infer<typeof JobStatusResponseSchema>;

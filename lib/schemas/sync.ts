import { z } from "zod";
import { JobStatusSchema } from "./job";
import { ReadingSchema } from "./reading";
import { ReconciledFieldSchema } from "./reconciled";
import { RegionSchema } from "./region";

// Vercel rejects request bodies over 4.5 MB, so stay under it. The capture screen must
// downscale and compress the photo before upload; the server answers 413 past this.
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

// The client makes the id, so a repeated upload of the same scan can never create a second one.
export const ScanIdSchema = z.uuid();

export const SyncAcceptedSchema = z.object({
  scanId: ScanIdSchema,
  status: JobStatusSchema,
});
export type SyncAccepted = z.infer<typeof SyncAcceptedSchema>;

// The contract the results page codes against (GET /api/scans/[id]).
export const ScanResultSchema = z.object({
  scanId: ScanIdSchema,
  status: JobStatusSchema,
  error: z.string().nullable(),
  // Short-lived signed URL; the bucket is private.
  imageUrl: z.string().nullable(),
  regions: z.array(
    RegionSchema.extend({
      readings: z.array(ReadingSchema.omit({ regionId: true })),
      // Derived from the readings on every request (reconcile is pure), so it can never go stale.
      fields: z.array(ReconciledFieldSchema),
    }),
  ),
});
export type ScanResult = z.infer<typeof ScanResultSchema>;

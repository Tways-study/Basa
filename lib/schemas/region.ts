import { z } from "zod";

export const RegionKindSchema = z.enum(["table", "handwriting", "stamp", "printed"]);
export type RegionKind = z.infer<typeof RegionKindSchema>;

// Fractions of the image (0 to 1), so the overlay scales with any screen size.
const Fraction = z.number().min(0).max(1);

export const BBoxSchema = z
  .object({ x: Fraction, y: Fraction, w: Fraction, h: Fraction })
  .refine((b) => b.x + b.w <= 1 && b.y + b.h <= 1, "box extends past the image");
export type BBox = z.infer<typeof BBoxSchema>;

export const RegionSchema = z.object({
  id: z.string().min(1),
  scanId: z.string().min(1),
  kind: RegionKindSchema,
  bbox: BBoxSchema,
  maskPath: z.string().nullable(),
});
export type Region = z.infer<typeof RegionSchema>;

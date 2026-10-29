import { z } from "zod";
import { BBoxSchema, RegionKindSchema, type Reading, type ReaderId, type RegionKind } from "@/lib/schemas";

// What segmentation hands back for one region, before it is stored with an id.
export const SegmentedRegionSchema = z.object({
  kind: RegionKindSchema,
  bbox: BBoxSchema,
  maskPath: z.string().nullable(),
});
export type SegmentedRegion = z.infer<typeof SegmentedRegionSchema>;

export const SegmentResultSchema = z.array(SegmentedRegionSchema);

export interface SegmentAdapter {
  segment(image: Uint8Array): Promise<SegmentedRegion[]>;
}

export interface ReadRegionInput {
  regionId: string;
  kind: RegionKind;
  image: Uint8Array;
}

export interface ReaderAdapter {
  readonly id: ReaderId;
  readRegion(input: ReadRegionInput): Promise<Reading>;
}

export interface ModelAdapters {
  segmenter: SegmentAdapter;
  // One reader until Phase 4 adds Muse Spark Open; mock mode already returns two.
  readers: [ReaderAdapter, ...ReaderAdapter[]];
}

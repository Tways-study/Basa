import {
  ReadingSchema,
  type Reading,
  type ReadingFields,
  type ReaderId,
  type RegionKind,
} from "@/lib/schemas";
import {
  SegmentResultSchema,
  type ModelAdapters,
  type ReadRegionInput,
  type ReaderAdapter,
  type SegmentAdapter,
} from "./types";

// Every name, ID and value below is fictional. No network call is made in mock mode.

const MOCK_REGIONS = [
  { kind: "printed", bbox: { x: 0.05, y: 0.03, w: 0.9, h: 0.12 }, maskPath: null },
  { kind: "table", bbox: { x: 0.05, y: 0.2, w: 0.9, h: 0.4 }, maskPath: null },
  { kind: "handwriting", bbox: { x: 0.05, y: 0.64, w: 0.6, h: 0.18 }, maskPath: null },
  { kind: "stamp", bbox: { x: 0.68, y: 0.7, w: 0.27, h: 0.18 }, maskPath: null },
] as const;

// Reader A reads everything cleanly. Reader B differs in three places on purpose,
// so the review screen and reconcile always have flagged fields to show in mock mode.
const FIXTURES: Record<RegionKind, Record<ReaderId, ReadingFields>> = {
  printed: {
    muse_spark: { "header.patient_name": "Juan Sample", "header.chart_no": "SYN-0001", "header.date": "2026-10-20" },
    muse_spark_open: { "header.patient_name": "Juan Sample", "header.chart_no": "SYN-0001", "header.date": "2026-10-20" },
  },
  table: {
    muse_spark: {
      "row1.test": "Hemoglobin", "row1.value": "13.5", "row1.unit": "g/dL",
      "row2.test": "Glucose", "row2.value": "7.2", "row2.unit": "mmol/L",
      "row3.test": "Creatinine", "row3.value": "80", "row3.unit": "µmol/L",
      "row4.test": "Sodium", "row4.value": "140", "row4.unit": "mmol/L",
    },
    muse_spark_open: {
      "row1.test": "Hemoglobin", "row1.value": "13.5", "row1.unit": "g/dL",
      "row2.test": "Glucose", "row2.value": "1.2", "row2.unit": "mmol/L", // 7.2 misread as 1.2
      "row3.test": "Creatinine", "row3.value": "80", "row3.unit": "umol/L", // same unit, other spelling
      "row4.test": "Sodium", "row4.value": null, "row4.unit": "mmol/L", // unreadable
    },
  },
  handwriting: {
    muse_spark: { line1: "Chart updated at front desk", line2: "Seen by assistant" },
    muse_spark_open: { line1: "Chart updated at front desk", line2: "Seen by assistent" },
  },
  stamp: {
    muse_spark: { "stamp.present": true, "stamp.text": "RECEIVED" },
    muse_spark_open: { "stamp.present": true, "stamp.text": "RECEIVED" },
  },
};

const mockSegmenter: SegmentAdapter = {
  async segment() {
    return SegmentResultSchema.parse(MOCK_REGIONS.map((r) => ({ ...r })));
  },
};

function mockReader(id: ReaderId): ReaderAdapter {
  return {
    id,
    async readRegion({ regionId, kind }: ReadRegionInput): Promise<Reading> {
      // Parse like a real adapter would, so a bad fixture fails loudly here and not in the UI.
      return ReadingSchema.parse({
        regionId,
        model: id,
        fields: FIXTURES[kind][id],
        latencyMs: 0,
        error: null,
      });
    },
  };
}

export function createMockAdapters(): ModelAdapters {
  return { segmenter: mockSegmenter, readers: [mockReader("muse_spark"), mockReader("muse_spark_open")] };
}

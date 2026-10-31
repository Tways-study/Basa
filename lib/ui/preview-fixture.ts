import { reconcileReadings } from "@/lib/pipeline/reconcile";
import type { Reading, ReadingFields, ReaderId, RegionKind, ScanResult } from "@/lib/schemas";

// Design preview only. Fictional values, boxes taken from the synthetic chart in eval/fixtures
// (smoke-chart-02.jpg, 1100 x 1400 px), so the crops line up with the photo.
const W = 1100;
const H = 1400;
const box = (x1: number, y1: number, x2: number, y2: number) => ({ x: x1 / W, y: y1 / H, w: (x2 - x1) / W, h: (y2 - y1) / H });

type Spec = {
  id: string;
  kind: RegionKind;
  bbox: ReturnType<typeof box>;
  spark: ReadingFields;
  open: ReadingFields;
  openError?: string;
};

const SPECS: Spec[] = [
  {
    id: "r1",
    kind: "header",
    bbox: box(169, 129, 930, 330),
    spark: { "header.patient_name": "Maria L. Dela Vega", "header.chart_no": "CH-004217", "header.date": "2026-03-14" },
    open: { "header.patient_name": "Maria L. Dela Vega", "header.chart_no": "CH-004211", "header.date": "2026-03-14" },
  },
  {
    id: "r2",
    kind: "table",
    bbox: box(173, 333, 952, 601),
    spark: {
      "row1.test": "Hemoglobin", "row1.value": "13.2", "row1.unit": "g/dL",
      "row2.test": "White blood cells", "row2.value": "6.8", "row2.unit": "x10^9/L",
      "row3.test": "Glucose, fasting", "row3.value": "5.4", "row3.unit": "mmol/L",
      "row4.test": "Creatinine", "row4.value": null, "row4.unit": "umol/L",
    },
    open: {
      "row1.test": "Hemoglobin", "row1.value": "13.2", "row1.unit": "g/dL",
      "row2.test": "White blood cells", "row2.value": "6.3", "row2.unit": "x10^9/L",
      "row3.test": "Glucose, fasting", "row3.value": "5.4", "row3.unit": "mmol/L",
      "row4.test": "Creatinine", "row4.value": "78", "row4.unit": "µmol/L",
    },
  },
  {
    id: "r3",
    kind: "handwriting",
    bbox: box(178, 644, 530, 752),
    spark: { line1: "Sample taken 08:15, fasting.", line2: "Repeat count sent to lab B." },
    open: {},
    openError: "Baseten request timed out after 20 s",
  },
  {
    id: "r4",
    kind: "stamp",
    bbox: box(750, 813, 974, 930),
    spark: { "stamp.present": true, "stamp.text": "RECEIVED LAB DEPT 14 MAR" },
    open: { "stamp.present": true, "stamp.text": "RECEIVED LAB DEPT 14 MAY" },
  },
  {
    id: "r5",
    kind: "signature",
    bbox: box(220, 1130, 402, 1207),
    spark: { "signature.present": true },
    open: { "signature.present": true },
  },
];

const SCAN_ID = "00000000-0000-4000-8000-000000000001";

export const PREVIEW_IMAGE_URL = "/preview-chart.jpg";

export function previewScan(): ScanResult {
  return {
    scanId: SCAN_ID,
    status: "needs_review",
    error: null,
    imageUrl: PREVIEW_IMAGE_URL,
    regions: SPECS.map((s) => {
      const readings: Omit<Reading, "regionId">[] = [
        { model: "muse_spark" as ReaderId, fields: s.spark, latencyMs: 2100, error: null },
        { model: "muse_spark_open" as ReaderId, fields: s.open, latencyMs: 3400, error: s.openError ?? null },
      ];
      return {
        id: s.id,
        scanId: SCAN_ID,
        kind: s.kind,
        bbox: s.bbox,
        maskPath: null,
        readings,
        // The real reconcile, so the preview shows exactly what the API would send.
        fields: reconcileReadings(readings),
      };
    }),
  };
}

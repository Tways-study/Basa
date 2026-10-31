import { describe, expect, it } from "vitest";
import { reconcile } from "@/lib/pipeline/reconcile";
import type { ReadingFields } from "@/lib/schemas";
import {
  addCounts,
  emptyReadCounts,
  emptyReviewCounts,
  rate,
  readRates,
  reviewRates,
  sameValue,
  scoreReading,
  scoreReview,
  truthFrom,
} from "./score";

const truth = truthFrom({
  _note: "ignored",
  "header.chart_no": "CH-004217",
  "row1.test": "Hemoglobin",
  "row1.value": "13.2",
  "row1.unit": "g/dL",
  "row2.test": "Creatinine",
  "row2.value": "78",
  "row2.unit": "umol/L",
  line1: "Seen by assistant",
  "stamp.present": true,
});

describe("truthFrom", () => {
  it("drops note keys and rejects keys outside the shared field keys", () => {
    expect(Object.keys(truth)).not.toContain("_note");
    expect(() => truthFrom({ patient: "x" })).toThrow();
    expect(() => truthFrom({ "row1.value": { a: 1 } })).toThrow();
  });
});

describe("sameValue", () => {
  it("ignores case, spacing, number format and unit spelling", () => {
    expect(sameValue("line1", "lab B", "Lab B")).toBe(true);
    expect(sameValue("row1.value", "7.20", "7.2")).toBe(true);
    expect(sameValue("row2.unit", "µmol/L", "umol/L")).toBe(true);
    expect(sameValue("stamp.present", "yes", true)).toBe(true);
  });
  it("treats a missing answer as nothing read", () => {
    expect(sameValue("line1", undefined, null)).toBe(true);
    expect(sameValue("line1", undefined, "x")).toBe(false);
  });
  it("tells different numbers apart", () => {
    expect(sameValue("row1.value", "7.2", "1.2")).toBe(false);
  });
});

describe("scoreReading", () => {
  const perfect: ReadingFields = {
    "header.chart_no": "CH-004217",
    "row1.test": "hemoglobin",
    "row1.value": "13.2",
    "row1.unit": "g/dL",
    "row2.test": "Creatinine",
    "row2.value": "78",
    "row2.unit": "µmol/L",
    line1: "Seen by assistant",
    "stamp.present": true,
  };

  it("counts a clean reading as fully correct", () => {
    const { counts } = scoreReading(truth, perfect);
    expect(counts).toEqual({ fields: 9, correct: 9, rows: 2, rowsRecalled: 2, hallucinatedRows: 0 });
  });

  it("counts a wrong value, a missing field and a row it got wrong", () => {
    const { counts } = scoreReading(truth, { ...perfect, "row2.value": "18", line1: undefined as never });
    expect(counts.correct).toBe(7);
    expect(counts.rowsRecalled).toBe(1);
  });

  it("counts rows the chart does not have, only when they hold something", () => {
    const extra = { ...perfect, "row3.test": "Sodium", "row3.value": "140", "row4.test": null };
    expect(scoreReading(truth, extra).counts.hallucinatedRows).toBe(1);
  });
});

describe("scoreReview (condition C)", () => {
  // Muse Spark is right everywhere except row2.value (18, truth 78). Muse Spark Open disagrees there: flagged.
  // line1: both readers wrong in the same way, so reconcile agrees and nothing is flagged.
  const spark: ReadingFields = {
    "header.chart_no": "CH-004217",
    "row1.test": "Hemoglobin",
    "row1.value": "13.2",
    "row1.unit": "g/dL",
    "row2.test": "Creatinine",
    "row2.value": "18",
    "row2.unit": "umol/L",
    line1: "Seen by assistent",
    "stamp.present": true,
  };
  const open: ReadingFields = {
    ...spark,
    "row2.value": "78",
    // A reader that differs where Muse Spark was right: a false flag.
    "header.chart_no": "CH-004211",
  };
  const reconciled = reconcile(spark, open);

  it("finds the caught error, the false flag and the agreed-but-wrong field", () => {
    const { counts } = scoreReview(truth, spark, open, reconciled);
    expect(counts.fields).toBe(9);
    expect(counts.sparkWrong).toBe(2); // row2.value and line1
    expect(counts.caught).toBe(1); // row2.value flagged
    expect(counts.sparkCorrect).toBe(7);
    expect(counts.falseFlags).toBe(1); // header.chart_no flagged although Muse Spark was right
    expect(counts.agreedButWrong).toBe(1); // line1
    expect(counts.flagged).toBe(2);
    expect(counts.missedByBoth).toBe(0);
  });

  it("derives the headline rates", () => {
    const { counts } = scoreReview(truth, spark, open, reconciled);
    const r = reviewRates(counts);
    expect(r.errorCatchRate).toBeCloseTo(0.5);
    expect(r.reviewBurden).toBeCloseTo(1 / 7);
    expect(r.residualError).toBeCloseTo(1 / 9);
  });

  it("calls a row safe when each field is agreed and correct, or flagged", () => {
    const { counts } = scoreReview(truth, spark, open, reconciled);
    expect(counts.rows).toBe(2);
    expect(counts.rowsRecalled).toBe(2); // row2.value is wrong but flagged, so a person settles it
  });

  it("counts a key neither reader returned as missed, not flagged", () => {
    const { counts } = scoreReview(truth, { ...spark, "row2.unit": undefined as never }, { ...open, "row2.unit": undefined as never }, reconcile(
      Object.fromEntries(Object.entries(spark).filter(([k]) => k !== "row2.unit")),
      Object.fromEntries(Object.entries(open).filter(([k]) => k !== "row2.unit")),
    ));
    expect(counts.missedByBoth).toBe(1);
    expect(counts.rowsRecalled).toBe(1); // row 2 has a field nobody returned
  });

  it("counts a row both readers made up as a hallucinated row", () => {
    const fake = { "row3.test": "Sodium", "row3.value": "140" };
    const { counts } = scoreReview(truth, { ...spark, ...fake }, { ...open, ...fake }, reconcile({ ...spark, ...fake }, { ...open, ...fake }));
    expect(counts.hallucinatedRows).toBe(1);
  });

  it("does not count a made-up row only one reader found, because it is flagged", () => {
    const fake = { "row3.test": "Sodium" };
    const { counts } = scoreReview(truth, { ...spark, ...fake }, open, reconcile({ ...spark, ...fake }, open));
    expect(counts.hallucinatedRows).toBe(0);
  });
});

describe("totals", () => {
  it("adds counts and returns n/a for an empty denominator", () => {
    const a = { ...emptyReadCounts(), fields: 4, correct: 3 };
    const b = { ...emptyReadCounts(), fields: 6, correct: 6 };
    expect(readRates(addCounts(a, b)).accuracy).toBeCloseTo(0.9);
    expect(rate(1, 0)).toBeNull();
    expect(reviewRates(emptyReviewCounts()).errorCatchRate).toBeNull();
  });
});

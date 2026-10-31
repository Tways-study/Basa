import { describe, expect, it } from "vitest";
import type { Decision, ReconciledField } from "@/lib/schemas";
import { resolveReview } from "./review";

const agreed: ReconciledField = {
  key: "row1.test",
  status: "agreed",
  value: "Hemoglobin",
  readings: { muse_spark: "Hemoglobin", muse_spark_open: "hemoglobin" },
};
const flagged: ReconciledField = {
  key: "row1.value",
  status: "flagged",
  reason: "mismatch",
  readings: { muse_spark: "7.2", muse_spark_open: "1.2" },
};
const oneFailed: ReconciledField = {
  key: "row1.unit",
  status: "flagged",
  reason: "one_unreadable",
  readings: { muse_spark: "g/dL", muse_spark_open: null },
};
const fields = [agreed, flagged, oneFailed];

const good: Decision[] = [
  { key: "row1.test", source: "agreed", value: "Hemoglobin" },
  { key: "row1.value", source: "muse_spark_open", value: "1.2" },
  { key: "row1.unit", source: "edited", value: "g/dL" },
];

describe("resolveReview", () => {
  it("stores each decision and marks edits", () => {
    const r = resolveReview(fields, good);
    expect(r).toEqual({
      ok: true,
      finalJson: { "row1.test": "Hemoglobin", "row1.value": "1.2", "row1.unit": "g/dL" },
      fieldStatus: { "row1.test": "agreed", "row1.value": "muse_spark_open", "row1.unit": "edited" },
      edited: true,
    });
  });

  it("is not edited when only reader values and agreements were used", () => {
    const r = resolveReview(fields, [good[0], good[1], { key: "row1.unit", source: "muse_spark", value: "g/dL" }]);
    expect(r.ok && r.edited).toBe(false);
  });

  it("stores unreadable as null, not a guess", () => {
    const r = resolveReview(fields, [good[0], { key: "row1.value", source: "unreadable", value: null }, good[2]]);
    expect(r.ok && r.finalJson["row1.value"]).toBeNull();
  });

  it("refuses a field nobody answered, even an agreed one", () => {
    expect(resolveReview(fields, good.slice(1)).ok).toBe(false);
  });

  it("refuses agreed on a flagged field", () => {
    const r = resolveReview(fields, [good[0], { key: "row1.value", source: "agreed", value: "7.2" }, good[2]]);
    expect(r.ok).toBe(false);
  });

  it("refuses a reader's value the reader did not return", () => {
    const r = resolveReview(fields, [good[0], { key: "row1.value", source: "muse_spark", value: "1.2" }, good[2]]);
    expect(r.ok).toBe(false);
  });

  it("refuses choosing a reader that found nothing", () => {
    const r = resolveReview(fields, [good[0], good[1], { key: "row1.unit", source: "muse_spark_open", value: "g/dL" }]);
    expect(r.ok).toBe(false);
  });

  it("refuses unknown and duplicate keys", () => {
    expect(resolveReview(fields, [...good, { key: "line1", source: "edited", value: "x" }]).ok).toBe(false);
    expect(resolveReview(fields, [...good, good[0]]).ok).toBe(false);
  });
});

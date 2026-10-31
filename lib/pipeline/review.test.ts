import { describe, expect, it } from "vitest";
import type { Decision, ReconciledField } from "@/lib/schemas";
import { isScanComplete, resolveReview } from "./review";

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

describe("resolveReview with padded reader text", () => {
  it("accepts a reader's value that has stray spaces, which the schema trims", () => {
    const padded: ReconciledField = {
      key: "row1.value",
      status: "flagged",
      reason: "mismatch",
      readings: { muse_spark: " 7.2 ", muse_spark_open: "1.2" },
    };
    const r = resolveReview([padded], [{ key: "row1.value", source: "muse_spark", value: "7.2" }]);
    expect(r.ok).toBe(true);
  });
});

describe("isScanComplete", () => {
  const reading = (regionId: string, model: "muse_spark" | "muse_spark_open", fields: Record<string, string | null>, error: string | null = null) => ({
    regionId,
    model,
    fields,
    error,
  });
  const both = (id: string, fields: Record<string, string | null>) => [
    reading(id, "muse_spark", fields),
    reading(id, "muse_spark_open", fields),
  ];

  it("needs a stored review for every region that has fields", () => {
    const readings = [...both("a", { line1: "x" }), ...both("b", { line1: "y" })];
    expect(isScanComplete(["a", "b"], readings, new Set(["a"]))).toBe(false);
    expect(isScanComplete(["a", "b"], readings, new Set(["a", "b"]))).toBe(true);
  });

  it("lets a region both readers answered with nothing count as seen", () => {
    expect(isScanComplete(["a"], both("a", {}), new Set())).toBe(true);
  });

  it("does not complete a region with no fields because a reader failed or is missing", () => {
    const failed = [reading("a", "muse_spark", {}, "timed out"), reading("a", "muse_spark_open", {})];
    expect(isScanComplete(["a"], failed, new Set())).toBe(false);
    expect(isScanComplete(["a"], [reading("a", "muse_spark", {})], new Set())).toBe(false);
    expect(isScanComplete(["a"], [], new Set())).toBe(false);
  });
});

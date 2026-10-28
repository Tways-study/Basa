import { describe, expect, it } from "vitest";
import { ReconciledFieldSchema } from "@/lib/schemas";
import { canonicalNumber, normalize, reconcile } from "./reconcile";

const one = (spark: Record<string, string | number | boolean | null>, open: typeof spark) =>
  reconcile(spark, open)[0];

describe("reconcile", () => {
  it("agrees when both readers match", () => {
    const f = one({ "row1.value": "7.2" }, { "row1.value": "7.2" });
    expect(f).toMatchObject({ status: "agreed", value: "7.2" });
  });

  it("flags 7.2 vs 1.2 as a mismatch and carries no value", () => {
    const f = one({ "row1.value": "7.2" }, { "row1.value": "1.2" });
    expect(f).toMatchObject({ status: "flagged", reason: "mismatch" });
    expect(f).not.toHaveProperty("value");
  });

  it("agrees across unit spelling, case and spacing", () => {
    expect(one({ "row1.unit": "mg/dL" }, { "row1.unit": " MG / dl " }).status).toBe("agreed");
    expect(one({ "row1.unit": "µmol/L" }, { "row1.unit": "umol/l" }).status).toBe("agreed");
  });

  it("agrees across numeric formatting", () => {
    expect(one({ "row1.value": "7.20" }, { "row1.value": 7.2 }).status).toBe("agreed");
    expect(one({ "row1.value": "7,2" }, { "row1.value": "7.2" }).status).toBe("agreed");
    expect(one({ "row1.value": "1,200" }, { "row1.value": "1200" }).status).toBe("agreed");
  });

  it("flags 1,200 vs 1.200 rather than guessing the separator", () => {
    expect(one({ "row1.value": "1,200" }, { "row1.value": "1.200" }).status).toBe("flagged");
  });

  it("flags when one reader returns null", () => {
    const f = one({ "row1.value": "7.2" }, { "row1.value": null });
    expect(f).toMatchObject({ status: "flagged", reason: "one_unreadable" });
    expect(f).toMatchObject({ readings: { muse_spark: "7.2", muse_spark_open: null } });
  });

  it("flags when neither reader can read it", () => {
    expect(one({ "line1": null }, { "line1": "  " })).toMatchObject({
      status: "flagged",
      reason: "both_unreadable",
    });
  });

  it("flags every key of a row only one reader found", () => {
    const out = reconcile(
      { "row1.test": "Hb", "row1.value": "13", "row2.test": "WBC", "row2.value": "6" },
      { "row1.test": "hb", "row1.value": "13" },
    );
    expect(out.map((f) => [f.key, f.status])).toEqual([
      ["row1.test", "agreed"],
      ["row1.value", "agreed"],
      ["row2.test", "flagged"],
      ["row2.value", "flagged"],
    ]);
    expect(out[2]).toMatchObject({ reason: "one_reader_only" });
  });

  it("compares stamp.present as a boolean however it is spelled", () => {
    expect(one({ "stamp.present": true }, { "stamp.present": "Yes" }).status).toBe("agreed");
    expect(one({ "stamp.present": true }, { "stamp.present": "no" }).status).toBe("flagged");
  });

  it("compares names and dates as text, ignoring case and spacing only", () => {
    expect(one({ "header.date": "03/04/2026" }, { "header.date": "3/4/2026" }).status).toBe("flagged");
    expect(
      one({ "header.patient_name": "Juan  Dela Cruz" }, { "header.patient_name": "juan dela cruz" }).status,
    ).toBe("agreed");
  });

  it("orders rows numerically, top to bottom", () => {
    const keys = reconcile(
      { "row10.test": "a", "row2.test": "a" },
      { "row10.test": "a", "row2.test": "a" },
    ).map((f) => f.key);
    expect(keys).toEqual(["row2.test", "row10.test"]);
  });

  it("flags everything when one reader failed outright", () => {
    const out = reconcile({}, { "row1.value": "7.2", "header.date": "2026-10-28" });
    expect(out.every((f) => f.status === "flagged")).toBe(true);
  });

  it("returns objects that pass the schema", () => {
    const out = reconcile({ "row1.value": "7.2", "line1": null }, { "row1.value": "1.2", "line1": "ok" });
    for (const f of out) expect(() => ReconciledFieldSchema.parse(f)).not.toThrow();
  });
});

describe("normalize helpers", () => {
  it("canonicalNumber strips noise but not meaning", () => {
    expect(canonicalNumber("007.500")).toBe("7.5");
    expect(canonicalNumber("-0.0")).toBe("0");
    expect(canonicalNumber("<5")).toBeNull();
    expect(canonicalNumber("7.2 H")).toBeNull();
  });

  it("keeps non-numeric values as lowercase text", () => {
    expect(normalize("row1.value", "<5")).toBe("<5");
    expect(normalize("row1.value", null)).toBeNull();
  });
});

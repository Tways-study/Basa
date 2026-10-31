import { describe, expect, it } from "vitest";
import type { Decision, ReconciledField } from "@/lib/schemas";
import { NOT_CONFIRMED, NOT_LEGIBLE, buildPrintable, printableValue } from "./print-record";

const f = (key: string): ReconciledField => ({ key, status: "agreed", value: "x", readings: { muse_spark: "x", muse_spark_open: "x" } });
const d = (key: string, source: Decision["source"], value: string | null): Decision => ({ key, source, value }) as Decision;

describe("printableValue", () => {
  it("prints the confirmed value", () => {
    expect(printableValue(d("a", "edited", " 7.2 "))).toBe("7.2");
  });
  it("prints unreadable as words, never blank", () => {
    expect(printableValue(d("a", "unreadable", null))).toBe(NOT_LEGIBLE);
  });
  it("prints an undecided field as not confirmed", () => {
    expect(printableValue(undefined)).toBe(NOT_CONFIRMED);
  });
});

describe("buildPrintable", () => {
  const table = { id: "t", kind: "table" as const, fields: ["row2.test", "row1.test", "row1.value", "row1.unit", "row2.value", "row2.unit"].map(f) };
  const header = { id: "h", kind: "header" as const, fields: [f("header.chart_no")] };
  const empty = { id: "e", kind: "stamp" as const, fields: [] };

  it("groups table keys into rows in order and keeps the reading-order region number", () => {
    const choices = {
      t: {
        "row1.test": d("row1.test", "agreed", "Hemoglobin"),
        "row1.value": d("row1.value", "muse_spark", "13.2"),
        "row1.unit": d("row1.unit", "agreed", "g/dL"),
        "row2.test": d("row2.test", "agreed", "Creatinine"),
        "row2.value": d("row2.value", "unreadable", null),
        "row2.unit": d("row2.unit", "agreed", "umol/L"),
      },
    };
    const [s] = buildPrintable([{ region: table, n: 3 }], choices);
    expect(s.n).toBe(3);
    expect(s.rows.map((r) => r.n)).toEqual([1, 2]);
    expect(s.rows[0]).toEqual({ n: 1, test: "Hemoglobin", value: "13.2", unit: "g/dL" });
    expect(s.rows[1].value).toBe(NOT_LEGIBLE);
  });

  it("skips regions with no fields and labels single fields", () => {
    const out = buildPrintable([{ region: empty, n: 1 }, { region: header, n: 2 }], { h: { "header.chart_no": d("header.chart_no", "agreed", "CH-1") } });
    expect(out).toHaveLength(1);
    expect(out[0].items).toEqual([{ label: "Header, chart no", text: "CH-1" }]);
  });

  it("prints present fields as yes or no", () => {
    const stamp = { id: "s", kind: "stamp" as const, fields: [f("stamp.present")] };
    const [s] = buildPrintable([{ region: stamp, n: 1 }], { s: { "stamp.present": d("stamp.present", "agreed", "true") } });
    expect(s.items[0].text).toBe("yes");
  });
});

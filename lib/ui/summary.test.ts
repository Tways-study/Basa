import { describe, expect, it } from "vitest";
import type { Decision, ReconciledField } from "@/lib/schemas";
import { NOT_LEGIBLE } from "./print-record";
import { buildSummary } from "./summary";

const f = (key: string): ReconciledField => ({ key, status: "agreed", value: "x", readings: { muse_spark: "x", muse_spark_open: "x" } });
const d = (key: string, source: Decision["source"], value: string | null): Decision => ({ key, source, value }) as Decision;

const table = { id: "t", kind: "table" as const, fields: ["row2.test", "row1.test", "row1.value", "row1.unit", "row2.value", "row2.unit"].map(f) };
const header = { id: "h", kind: "header" as const, fields: [f("header.chart_no")] };
const stamp = { id: "s", kind: "stamp" as const, fields: [f("stamp.present")] };
const empty = { id: "e", kind: "printed" as const, fields: [] };

describe("buildSummary", () => {
  const choices = {
    t: {
      "row1.test": d("row1.test", "agreed", "Hemoglobin"),
      "row1.value": d("row1.value", "muse_spark", "13.2"),
      "row1.unit": d("row1.unit", "agreed", "g/dL"),
      "row2.test": d("row2.test", "agreed", "Creatinine"),
      "row2.value": d("row2.value", "unreadable", null),
      "row2.unit": d("row2.unit", "agreed", "umol/L"),
    },
    h: { "header.chart_no": d("header.chart_no", "agreed", "CH-1") },
    s: { "stamp.present": d("stamp.present", "agreed", "true") },
  };

  it("restates each row on one line and cites its region number and kind", () => {
    const lines = buildSummary([{ region: table, n: 3 }], choices);
    expect(lines.map((l) => l.text)).toEqual(["Row 1: Hemoglobin 13.2 g/dL", `Row 2: Creatinine ${NOT_LEGIBLE} umol/L`]);
    expect(lines.every((l) => l.n === 3 && l.cite === "Region 3, Table" && l.regionId === "t")).toBe(true);
  });

  it("labels single fields, reads present as yes or no, and skips regions with no fields", () => {
    const lines = buildSummary([{ region: empty, n: 1 }, { region: header, n: 2 }, { region: stamp, n: 3 }], choices);
    expect(lines.map((l) => l.text)).toEqual(["Header, chart no: CH-1", "Stamp, present: yes"]);
    expect(lines.map((l) => l.cite)).toEqual(["Region 2, Header", "Region 3, Stamp"]);
  });

  it("uses only the person's final answers, never a reader's value", () => {
    const lines = buildSummary([{ region: header, n: 1 }], { h: { "header.chart_no": d("header.chart_no", "edited", "CH-9") } });
    expect(lines[0].text).toBe("Header, chart no: CH-9");
  });

  it("marks a field that is not decided yet instead of guessing", () => {
    const [line] = buildSummary([{ region: header, n: 1 }], {});
    expect(line.text).toBe("Header, chart no: [not confirmed]");
  });

  it("gives every line a unique id", () => {
    const lines = buildSummary([{ region: table, n: 1 }, { region: header, n: 2 }], choices);
    expect(new Set(lines.map((l) => l.id)).size).toBe(lines.length);
  });

  it("contains no advice words", () => {
    const text = buildSummary([{ region: table, n: 1 }, { region: header, n: 2 }, { region: stamp, n: 3 }], choices).map((l) => l.text).join(" ").toLowerCase();
    for (const word of ["should", "recommend", "dose", "diagnos", "normal", "abnormal", "risk"]) expect(text).not.toContain(word);
  });
});

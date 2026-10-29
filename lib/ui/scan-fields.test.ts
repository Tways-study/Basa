import { describe, expect, it } from "vitest";
import { formatValue, groupFields } from "./scan-fields";

describe("formatValue", () => {
  it("shows null, undefined and blank text as unreadable, never as a guess", () => {
    expect(formatValue(null)).toEqual({ text: "unreadable", unreadable: true });
    expect(formatValue(undefined)).toEqual({ text: "unreadable", unreadable: true });
    expect(formatValue("   ")).toEqual({ text: "unreadable", unreadable: true });
  });

  it("writes booleans as yes or no and keeps text and numbers as read", () => {
    expect(formatValue(true).text).toBe("yes");
    expect(formatValue(false).text).toBe("no");
    expect(formatValue(" g/dL ").text).toBe("g/dL");
    expect(formatValue(13.5).text).toBe("13.5");
  });
});

describe("groupFields", () => {
  it("turns row keys into ordered table rows, filling a missing cell as unreadable", () => {
    const { rows, items } = groupFields({
      "row2.test": "Hemoglobin",
      "row2.value": 13.5,
      "row1.test": "Glucose",
      "row1.value": "5.1",
      "row1.unit": "mmol/L",
    });
    expect(items).toEqual([]);
    expect(rows.map((r) => r.n)).toEqual([1, 2]);
    expect(rows[0].test.text).toBe("Glucose");
    expect(rows[1].unit).toEqual({ text: "unreadable", unreadable: true });
  });

  it("orders lines numerically (line2 before line10) and header fields in reading order", () => {
    const lines = groupFields({ line10: "j", line2: "b", line1: "a" }).items.map((i) => i.key);
    expect(lines).toEqual(["line1", "line2", "line10"]);

    const header = groupFields({
      "header.date": "2026-03-14",
      "header.patient_name": "Maria L. Dela Cruz",
      "header.chart_no": "CH-004217",
    }).items.map((i) => i.key);
    expect(header).toEqual(["header.patient_name", "header.chart_no", "header.date"]);
  });

  it("returns nothing for a failed reading with no fields", () => {
    expect(groupFields({})).toEqual({ rows: [], items: [] });
  });
});

import { describe, expect, it } from "vitest";
import { renderReport } from "./report";
import { emptyReadCounts, emptyReviewCounts } from "./score";
import type { GroupTotals, Results, RunSummary } from "./types";

const totals = (): GroupTotals => ({
  charts: 1,
  calls: 13,
  a: { ...emptyReadCounts(), fields: 10, correct: 7, rows: 2, rowsRecalled: 1 },
  b: { ...emptyReadCounts(), fields: 10, correct: 9, rows: 2, rowsRecalled: 2 },
  c: { ...emptyReviewCounts(), fields: 10, sparkCorrect: 9, sparkWrong: 1, caught: 1, flagged: 2, falseFlags: 1, agreed: 8, agreedCorrect: 7, agreedButWrong: 1, rows: 2, rowsRecalled: 2 },
});

const run = (split: "dev" | "test", final: boolean): RunSummary => ({
  generatedAt: "2026-11-01T00:00:00.000Z",
  split,
  margin: 0.2,
  final,
  models: { spark: "m1", open: "m2", sam: "m3" },
  totals: { all: totals(), hard: { ...totals(), charts: 0 }, easy: totals() },
  charts: [
    {
      id: "chart-1",
      hard: false,
      calls: 13,
      errors: [],
      a: totals().a,
      b: totals().b,
      c: totals().c,
      examples: [{ key: "line1", truth: "x", spark: "y", open: "y", status: "agreed", agreedCorrect: false }],
    },
  ],
});

describe("renderReport", () => {
  it("says the held-out set has not run when only dev exists", () => {
    const text = renderReport({ schema: 1, dev: run("dev", false) } as Results);
    expect(text).toContain("Not run yet");
    expect(text).toContain("## Dev set");
    expect(text).toContain("not the headline");
  });

  it("puts the held-out numbers first and lists agreed-but-wrong fields", () => {
    const text = renderReport({ schema: 1, dev: run("dev", false), test: run("test", true) } as Results);
    expect(text.indexOf("Held-out set (final)")).toBeLessThan(text.indexOf("## Dev set"));
    expect(text).toContain("readers agreed on \"y\"");
    expect(text).toContain("C 10.0% (1/10)"); // 1 agreed-but-wrong in 10 fields
    expect(text).toContain("lower than A at 30.0% (3/10)");
  });

  it("shows n/a instead of a made-up number for an empty group", () => {
    const empty = run("dev", false);
    empty.totals.all = { ...totals(), a: emptyReadCounts(), c: emptyReviewCounts() };
    expect(renderReport({ schema: 1, dev: empty } as Results)).toContain("No fields were scored.");
  });
});

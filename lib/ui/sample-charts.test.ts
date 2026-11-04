import { describe, expect, it } from "vitest";
import { ScanIdSchema } from "@/lib/schemas";
import { SAMPLE_CHARTS } from "./sample-charts";

describe("SAMPLE_CHARTS", () => {
  it("uses ids the scan routes accept, with no repeats", () => {
    for (const c of SAMPLE_CHARTS) expect(ScanIdSchema.safeParse(c.id).success).toBe(true);
    expect(new Set(SAMPLE_CHARTS.map((c) => c.id)).size).toBe(SAMPLE_CHARTS.length);
  });
});

import { describe, expect, it, vi } from "vitest";
import type { ReconciledField } from "@/lib/schemas";
import { printWithCheck } from "./print-check";
import { reviewOrder } from "./review-state";
import { formatScanned } from "./scan-date";

const agreed: ReconciledField = {
  key: "header.date",
  status: "agreed",
  value: "2026-03-14",
  readings: { muse_spark: "2026-03-14", muse_spark_open: "2026-03-14" },
};
const mismatch: ReconciledField = {
  key: "row1.value",
  status: "flagged",
  reason: "mismatch",
  readings: { muse_spark: "7.2", muse_spark_open: "1.2" },
};
const region = (id: string, kind: string, fields: ReconciledField[]) => ({ id, kind, fields, readings: [{ error: null }] });

describe("reviewOrder (issue #49)", () => {
  it("keeps the header above a table that has a flagged field", () => {
    const header = region("h", "header", [agreed]);
    const table = region("t", "table", [mismatch]);
    const stamp = region("s", "stamp", [agreed]);
    // Reading order is table, header, stamp here, as when a box is proposed out of order.
    expect(reviewOrder([table, header, stamp], (x) => x).map((x) => x.id)).toEqual(["h", "t", "s"]);
  });

  it("still puts regions that need a person ahead of the calm ones after the header", () => {
    const calm = region("c", "handwriting", [agreed]);
    const flagged = region("f", "table", [mismatch]);
    expect(reviewOrder([calm, flagged], (x) => x).map((x) => x.id)).toEqual(["f", "c"]);
  });
});

describe("formatScanned (issue #48)", () => {
  it("formats a real time with its date", () => {
    expect(formatScanned("2026-11-02T07:42:00.000Z")).toMatch(/2026/);
  });
  it("gives null, not a made-up date, when there is no usable time", () => {
    expect(formatScanned(undefined)).toBeNull();
    expect(formatScanned(null)).toBeNull();
    expect(formatScanned("not a date")).toBeNull();
  });
});

describe("printWithCheck (issue #46)", () => {
  function fakeWindow(fires: boolean, throws = false) {
    const listeners = new Map<string, () => void>();
    return {
      print: vi.fn(() => {
        if (throws) throw new Error("not supported");
        if (fires) listeners.get("beforeprint")?.();
      }),
      addEventListener: (name: string, fn: () => void) => void listeners.set(name, fn),
      removeEventListener: (name: string) => void listeners.delete(name),
    };
  }

  it("reports true when a print dialog started", async () => {
    expect(await printWithCheck(fakeWindow(true), 5)).toBe(true);
  });
  it("reports false when print() did nothing, so the screen can say so", async () => {
    expect(await printWithCheck(fakeWindow(false), 5)).toBe(false);
  });
  it("reports false when print() throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await printWithCheck(fakeWindow(false, true), 5)).toBe(false);
  });
});

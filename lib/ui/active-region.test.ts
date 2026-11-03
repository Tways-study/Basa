import { describe, expect, it } from "vitest";
import { pickActiveRegion } from "./active-region";

const order = ["a", "b", "c"];

describe("pickActiveRegion", () => {
  it("takes the topmost region that crosses the reading line", () => {
    expect(pickActiveRegion(new Set(["c", "b"]), order, "a")).toBe("b");
  });
  it("keeps the current region when none crosses the line", () => {
    expect(pickActiveRegion(new Set(), order, "c")).toBe("c");
  });
  it("starts on the first region", () => {
    expect(pickActiveRegion(new Set(), order, null)).toBe("a");
  });
  it("falls back to the first region when the current one is gone", () => {
    expect(pickActiveRegion(new Set(), order, "zzz")).toBe("a");
  });
  it("ignores ids that are not regions", () => {
    expect(pickActiveRegion(new Set(["zzz"]), order, "b")).toBe("b");
  });
  it("has nothing to show with no regions", () => {
    expect(pickActiveRegion(new Set(), [], null)).toBeNull();
  });
});

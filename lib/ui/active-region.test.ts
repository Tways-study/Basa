import { describe, expect, it } from "vitest";
import { PIN_RELEASE_PX, pickActiveRegion, shouldReleasePin, stepRegion } from "./active-region";

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

describe("stepRegion", () => {
  it("moves to the next and previous region", () => {
    expect(stepRegion(order, "b", 1)).toBe("c");
    expect(stepRegion(order, "b", -1)).toBe("a");
  });
  it("stops at either end", () => {
    expect(stepRegion(order, "a", -1)).toBeNull();
    expect(stepRegion(order, "c", 1)).toBeNull();
  });
  it("treats an unknown or missing region as the first", () => {
    expect(stepRegion(order, null, 1)).toBe("b");
    expect(stepRegion(order, "zzz", 1)).toBe("b");
  });
});

describe("shouldReleasePin", () => {
  it("holds for small scrolls and lets go past the limit, in either direction", () => {
    expect(shouldReleasePin(1000, 1000 + PIN_RELEASE_PX)).toBe(false);
    expect(shouldReleasePin(1000, 1000 + PIN_RELEASE_PX + 1)).toBe(true);
    expect(shouldReleasePin(1000, 1000 - PIN_RELEASE_PX - 1)).toBe(true);
  });
});

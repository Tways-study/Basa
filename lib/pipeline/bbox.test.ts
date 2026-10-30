import { describe, expect, it } from "vitest";
import { fromGrid, growBBox, padBBox, toPixelRect } from "./bbox";

describe("fromGrid", () => {
  it("turns 0-1000 corners into a fractional box", () => {
    const box = fromGrid(100, 200, 600, 700);
    expect(box?.x).toBeCloseTo(0.1);
    expect(box?.y).toBeCloseTo(0.2);
    expect(box?.w).toBeCloseTo(0.5);
    expect(box?.h).toBeCloseTo(0.5);
  });
  it("clamps corners that leave the image", () => {
    const box = fromGrid(-50, 900, 1100, 1200);
    expect(box).toEqual({ x: 0, y: 0.9, w: 1, h: expect.closeTo(0.1) });
  });
  it("rejects empty and inverted boxes", () => {
    expect(fromGrid(500, 500, 500, 600)).toBeNull();
    expect(fromGrid(600, 100, 200, 300)).toBeNull();
  });
});

describe("padBBox", () => {
  it("grows a box by the padding on every side", () => {
    const box = padBBox({ x: 0.3, y: 0.3, w: 0.2, h: 0.2 }, 0.04);
    expect(box.x).toBeCloseTo(0.26);
    expect(box.y).toBeCloseTo(0.26);
    expect(box.w).toBeCloseTo(0.28);
    expect(box.h).toBeCloseTo(0.28);
  });
  it("stays inside the image at the edges", () => {
    const box = padBBox({ x: 0.0, y: 0.9, w: 1, h: 0.1 }, 0.04);
    expect(box.x).toBe(0);
    expect(box.x + box.w).toBeLessThanOrEqual(1);
    expect(box.y + box.h).toBeLessThanOrEqual(1);
  });
});

describe("toPixelRect", () => {
  it("maps fractions to pixels", () => {
    expect(toPixelRect({ x: 0.1, y: 0.2, w: 0.5, h: 0.25 }, 1000, 800)).toEqual({
      left: 100, top: 160, width: 500, height: 200,
    });
  });
  it("never returns a rectangle outside the image or smaller than one pixel", () => {
    const r = toPixelRect({ x: 0.999, y: 0.999, w: 0.001, h: 0.001 }, 100, 100);
    expect(r.left + r.width).toBeLessThanOrEqual(100);
    expect(r.top + r.height).toBeLessThanOrEqual(100);
    expect(r.width).toBeGreaterThanOrEqual(1);
  });
});

describe("growBBox", () => {
  it("grows by a fraction of the box's own size on every side", () => {
    const grown = growBBox({ x: 0.4, y: 0.4, w: 0.2, h: 0.1 }, 0.2, 0.5);
    expect(grown.x).toBeCloseTo(0.36);
    expect(grown.w).toBeCloseTo(0.28);
    expect(grown.y).toBeCloseTo(0.35);
    expect(grown.h).toBeCloseTo(0.2);
  });
  it("stays inside the image", () => {
    expect(growBBox({ x: 0, y: 0.9, w: 0.5, h: 0.1 }, 0.5, 0.5)).toEqual({ x: 0, y: 0.85, w: 0.75, h: expect.closeTo(0.15) });
  });
});

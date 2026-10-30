import { BBoxSchema, type BBox } from "@/lib/schemas";

const GRID = 1000; // Muse Spark answers locations on a 0-1000 grid, not in pixels.

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Muse Spark corners on the 0-1000 grid -> a fractional box, or null if it is empty or inverted. */
export function fromGrid(x1: number, y1: number, x2: number, y2: number): BBox | null {
  const left = clamp01(x1 / GRID);
  const top = clamp01(y1 / GRID);
  const right = clamp01(x2 / GRID);
  const bottom = clamp01(y2 / GRID);
  if (right <= left || bottom <= top) return null;
  return BBoxSchema.parse({ x: left, y: top, w: right - left, h: bottom - top });
}

/** Proposals vary run to run, so grow each box a little (default 4%) and keep it inside the image. */
export function padBBox(box: BBox, pad = 0.04): BBox {
  const left = clamp01(box.x - pad);
  const top = clamp01(box.y - pad);
  const right = clamp01(box.x + box.w + pad);
  const bottom = clamp01(box.y + box.h + pad);
  return BBoxSchema.parse({ x: left, y: top, w: right - left, h: bottom - top });
}

/** Pixel rectangle for sharp.extract, always at least 1x1 and inside the image. */
export function toPixelRect(box: BBox, width: number, height: number) {
  const left = Math.min(width - 1, Math.floor(box.x * width));
  const top = Math.min(height - 1, Math.floor(box.y * height));
  const w = Math.max(1, Math.min(width - left, Math.round(box.w * width)));
  const h = Math.max(1, Math.min(height - top, Math.round(box.h * height)));
  return { left, top, width: w, height: h };
}

/** Overlap of two boxes, 0 to 1. Guards against a refined box snapping to the wrong object. */
export function iou(a: BBox, b: BBox): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  const inter = w * h;
  return inter / (a.w * a.h + b.w * b.h - inter);
}

/**
 * Grow a box by a fraction of its own width and height, clamped to the image. Used for the crop a reader
 * sees, so a box that falls a little short of the text still includes all of it. Relative on purpose:
 * a fixed fraction of the page would pull a neighbouring region into a small box.
 */
export function growBBox(box: BBox, fx: number, fy: number): BBox {
  const left = clamp01(box.x - box.w * fx);
  const top = clamp01(box.y - box.h * fy);
  const right = clamp01(box.x + box.w + box.w * fx);
  const bottom = clamp01(box.y + box.h + box.h * fy);
  return BBoxSchema.parse({ x: left, y: top, w: right - left, h: bottom - top });
}

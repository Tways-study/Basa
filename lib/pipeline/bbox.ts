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

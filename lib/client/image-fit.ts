import { MAX_UPLOAD_BYTES } from "@/lib/schemas";

// Stay well under the 4 MB server limit: multipart framing adds bytes and a phone on
// mobile data should not send more than it needs to.
export const TARGET_UPLOAD_BYTES = Math.floor(MAX_UPLOAD_BYTES * 0.875);

// 2400px on the long edge keeps small print legible for the readers without a huge file.
export const MAX_EDGE = 2400;
const MIN_EDGE = 900;
const QUALITY_STEPS = [0.85, 0.75, 0.65, 0.55] as const;

export type Size = { width: number; height: number };

export class ImageTooLargeError extends Error {
  constructor() {
    super("Could not shrink the photo enough to send. Try taking it again from a little further away.");
    this.name = "ImageTooLargeError";
  }
}

/** Scales to fit the longest edge within maxEdge. Never enlarges. */
export function fitWithin(source: Size, maxEdge: number): Size {
  const longest = Math.max(source.width, source.height);
  if (longest <= maxEdge) return { width: source.width, height: source.height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(source.width * scale)),
    height: Math.max(1, Math.round(source.height * scale)),
  };
}

/**
 * Tries lower quality first, then a smaller size, until the encoded result fits the limit.
 * The encoder is passed in so this stays pure and testable; only the canvas call is browser-only.
 */
export async function fitToLimit<T extends { size: number }>(
  source: Size,
  encode: (size: Size, quality: number) => Promise<T>,
  limit: number = TARGET_UPLOAD_BYTES,
): Promise<T> {
  for (let edge = MAX_EDGE; edge >= MIN_EDGE; edge = Math.round(edge * 0.75)) {
    const size = fitWithin(source, edge);
    for (const quality of QUALITY_STEPS) {
      const out = await encode(size, quality);
      if (out.size <= limit) return out;
    }
  }
  throw new ImageTooLargeError();
}

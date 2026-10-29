import { describe, expect, it, vi } from "vitest";
import { MAX_UPLOAD_BYTES } from "@/lib/schemas";
import { fitToLimit, fitWithin, ImageTooLargeError, MAX_EDGE, TARGET_UPLOAD_BYTES } from "./image-fit";

describe("fitWithin", () => {
  it("shrinks the long edge and keeps the aspect ratio", () => {
    expect(fitWithin({ width: 4000, height: 3000 }, 2000)).toEqual({ width: 2000, height: 1500 });
    expect(fitWithin({ width: 3000, height: 4000 }, 2000)).toEqual({ width: 1500, height: 2000 });
  });

  it("never enlarges a small photo", () => {
    expect(fitWithin({ width: 800, height: 600 }, 2400)).toEqual({ width: 800, height: 600 });
  });
});

describe("fitToLimit", () => {
  it("keeps the target under the server limit", () => {
    expect(TARGET_UPLOAD_BYTES).toBeLessThan(MAX_UPLOAD_BYTES);
  });

  it("returns the first encoding that fits, at the largest size and best quality", async () => {
    const encode = vi.fn(async () => ({ size: 1000 }));
    const out = await fitToLimit({ width: 4000, height: 3000 }, encode);
    expect(out.size).toBe(1000);
    expect(encode).toHaveBeenCalledTimes(1);
    expect(encode).toHaveBeenCalledWith({ width: MAX_EDGE, height: 1800 }, 0.85);
  });

  it("lowers quality, then size, until the result fits", async () => {
    const limit = 100;
    // Only fits once the long edge is below the full size.
    const encode = vi.fn(async (size: { width: number }) => ({ size: size.width > 2000 ? 500 : 50 }));
    const out = await fitToLimit({ width: 4000, height: 3000 }, encode, limit);
    expect(out.size).toBe(50);
    const edges = encode.mock.calls.map(([size]) => size.width);
    expect(edges.at(-1)).toBeLessThanOrEqual(2000);
    expect(edges[0]).toBe(MAX_EDGE);
  });

  it("gives up with a clear error when nothing fits", async () => {
    const encode = vi.fn(async () => ({ size: 10_000_000 }));
    await expect(fitToLimit({ width: 4000, height: 3000 }, encode)).rejects.toBeInstanceOf(ImageTooLargeError);
  });
});

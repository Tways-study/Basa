import sharp from "sharp";
import type { BBox } from "@/lib/schemas";
import { toPixelRect } from "./bbox";

const MAX_SIDE = 2000;

/**
 * Store every scan as an upright JPEG no larger than MAX_SIDE. Phone photos carry an EXIF
 * rotation; baking it in means the fractional boxes we store match what every viewer shows.
 */
export async function normalizeImage(input: Uint8Array): Promise<Uint8Array> {
  const out = await sharp(input)
    .rotate()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  return new Uint8Array(out);
}

export async function cropRegion(image: Uint8Array, box: BBox): Promise<Uint8Array> {
  const { width, height } = await sharp(image).metadata();
  if (!width || !height) throw new Error("Could not read image dimensions");
  const out = await sharp(image).extract(toPixelRect(box, width, height)).jpeg({ quality: 90 }).toBuffer();
  return new Uint8Array(out);
}

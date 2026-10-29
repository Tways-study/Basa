import { fitToLimit } from "./image-fit";

export class UnreadablePhotoError extends Error {
  constructor() {
    super("This browser cannot open that photo. Take a new photo, or choose a JPEG or PNG.");
    this.name = "UnreadablePhotoError";
  }
}

/**
 * Re-encodes a photo as a JPEG small enough to upload (the server rejects over 4 MB, and
 * Vercel rejects bodies over 4.5 MB). Browser only: it needs createImageBitmap and a canvas.
 */
export async function prepareUpload(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    // "from-image" applies the camera's rotation, so the upload is upright.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new UnreadablePhotoError();
  }

  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser cannot prepare the photo for sending.");

    return await fitToLimit({ width: bitmap.width, height: bitmap.height }, (size, quality) =>
      new Promise<Blob>((resolve, reject) => {
        canvas.width = size.width;
        canvas.height = size.height;
        ctx.drawImage(bitmap, 0, 0, size.width, size.height);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("The photo could not be compressed."))),
          "image/jpeg",
          quality,
        );
      }),
    );
  } finally {
    bitmap.close();
  }
}

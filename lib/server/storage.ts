import { getServiceClient } from "./supabase";

const BUCKET = "scans"; // private; images are only reachable through signed URLs made here

export const imagePathFor = (scanId: string) => `${scanId}.jpg`;

export async function uploadScanImage(path: string, bytes: Uint8Array): Promise<void> {
  const { error } = await getServiceClient()
    .storage.from(BUCKET)
    .upload(path, bytes, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
}

export async function downloadScanImage(path: string): Promise<Uint8Array> {
  const { data, error } = await getServiceClient().storage.from(BUCKET).download(path);
  if (error || !data) throw new Error(`Storage download failed: ${error?.message ?? "no data"}`);
  return new Uint8Array(await data.arrayBuffer());
}

export async function signedImageUrl(path: string, expiresInSeconds = 3600): Promise<string | null> {
  const { data, error } = await getServiceClient().storage.from(BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error || !data) return null;
  return data.signedUrl;
}

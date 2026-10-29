import { ScanIdSchema } from "@/lib/schemas";
import { buildScanResult, createSupabaseStore } from "@/lib/server/store";
import { signedImageUrl } from "@/lib/server/storage";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = ScanIdSchema.safeParse((await ctx.params).id);
  if (!id.success) return Response.json({ error: "Scan id must be a UUID." }, { status: 400 });

  try {
    const store = createSupabaseStore();
    const scan = await store.getScan(id.data);
    if (!scan) return Response.json({ error: "Scan not found." }, { status: 404 });

    const [regions, readings, imageUrl] = await Promise.all([
      store.getRegions(id.data),
      store.getReadings(id.data),
      scan.imagePath ? signedImageUrl(scan.imagePath) : Promise.resolve(null),
    ]);
    return Response.json(buildScanResult(scan, regions, readings, imageUrl), {
      headers: { "Cache-Control": "no-store" }, // the page polls this; never serve a stale status
    });
  } catch (err) {
    console.error("scan read failed:", err instanceof Error ? err.message : "unknown error");
    return Response.json({ error: "Could not load the scan." }, { status: 500 });
  }
}

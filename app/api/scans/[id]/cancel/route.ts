import { ScanIdSchema, type SyncAccepted } from "@/lib/schemas";
import { createSupabaseStore } from "@/lib/server/store";

const json = (body: unknown, status: number) => Response.json(body, { status });

/**
 * "Cancel scanning": stops a scan that is still being read. The running pipeline notices on its next
 * check (see CANCEL_POLL_MS) and stops spending model calls. Safe to call twice, and a finished scan is left as it is.
 */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = ScanIdSchema.safeParse((await ctx.params).id);
  if (!id.success) return json({ error: "Scan id must be a UUID." }, 400);

  try {
    const store = createSupabaseStore();
    const scan = await store.getScan(id.data);
    if (!scan) return json({ error: "Scan not found." }, 404);

    // Conditional in the database, so a scan that finished a moment ago is not turned into "cancelled".
    await store.cancelScan(id.data);
    const after = await store.getScan(id.data);
    const body: SyncAccepted = { scanId: id.data, status: (after ?? scan).status };
    return json(body, 200);
  } catch (err) {
    console.error("cancel failed:", err instanceof Error ? err.message : "unknown error");
    return json({ error: "Could not cancel. Try again." }, 500);
  }
}

import { reconcileReadings } from "@/lib/pipeline/reconcile";
import { resolveReview } from "@/lib/pipeline/review";
import { ReviewSubmissionSchema, ScanIdSchema, type ReviewsResponse } from "@/lib/schemas";
import { createReviewStore } from "@/lib/server/review-store";
import { createSupabaseStore } from "@/lib/server/store";

async function scanIdFrom(ctx: { params: Promise<{ id: string }> }) {
  return ScanIdSchema.safeParse((await ctx.params).id);
}

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = await scanIdFrom(ctx);
  if (!id.success) return Response.json({ error: "Scan id must be a UUID." }, { status: 400 });

  try {
    const reviews = await createReviewStore().getReviews(id.data);
    const body: ReviewsResponse = { scanId: id.data, reviews };
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("review read failed:", err instanceof Error ? err.message : "unknown error");
    return Response.json({ error: "Could not load the saved review." }, { status: 500 });
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = await scanIdFrom(ctx);
  if (!id.success) return Response.json({ error: "Scan id must be a UUID." }, { status: 400 });

  const parsed = ReviewSubmissionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "That review could not be read." }, { status: 400 });
  const { regionId, fields: decisions } = parsed.data;

  try {
    const scans = createSupabaseStore();
    const reviews = createReviewStore();

    const scan = await scans.getScan(id.data);
    if (!scan) return Response.json({ error: "Scan not found." }, { status: 404 });
    // Before needs_review the readings are still arriving, so what the person saw may change.
    if (scan.status !== "needs_review" && scan.status !== "done") {
      return Response.json({ error: "This scan is not ready to review yet." }, { status: 409 });
    }

    const [regions, readings] = await Promise.all([scans.getRegions(id.data), scans.getReadings(id.data)]);
    if (!regions.some((r) => r.id === regionId)) {
      return Response.json({ error: "That region is not part of this scan." }, { status: 404 });
    }

    // Derived again here, never taken from the client: the server decides what the readers said.
    const own = readings.filter((r) => r.regionId === regionId);
    const resolved = resolveReview(reconcileReadings(own), decisions);
    if (!resolved.ok) return Response.json({ error: resolved.error }, { status: 422 });

    await reviews.saveReview({
      regionId,
      finalJson: resolved.finalJson,
      fieldStatus: resolved.fieldStatus,
      edited: resolved.edited,
      readings: own.map(({ model, fields, error }) => ({ model, fields, error })),
    });

    // The scan is done once every region that has fields has a stored review.
    const saved = new Set((await reviews.getReviews(id.data)).map((r) => r.regionId));
    const complete = regions.every(
      (r) => reconcileReadings(readings.filter((x) => x.regionId === r.id)).length === 0 || saved.has(r.id),
    );
    if (complete && scan.status !== "done") await scans.setStatus(id.data, "done");

    return Response.json({ regionId, scanComplete: complete });
  } catch (err) {
    console.error("review save failed:", err instanceof Error ? err.message : "unknown error");
    return Response.json({ error: "Could not save the review. Try again." }, { status: 500 });
  }
}

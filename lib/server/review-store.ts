import { DecisionSchema, type Decision, type SavedReview } from "@/lib/schemas";
import { z } from "zod";
import { getServiceClient } from "./supabase";

export interface ReviewStore {
  getReviews(scanId: string): Promise<SavedReview[]>;
  /**
   * One review per region (unique on region_id), so saving twice replaces it. A recognition_event is
   * added only when the person's final answer changed, so a retried request does not duplicate it.
   */
  saveReview(input: {
    regionId: string;
    finalJson: Record<string, string | null>;
    fieldStatus: Record<string, Decision["source"]>;
    edited: boolean;
    readings: unknown;
  }): Promise<void>;
}

function fail(action: string, error: { message: string }): never {
  throw new Error(`Database ${action} failed: ${error.message}`);
}

const FinalSchema = z.record(z.string(), z.string().nullable());
const StatusSchema = z.record(z.string(), DecisionSchema.shape.source);

export function createReviewStore(): ReviewStore {
  const db = getServiceClient();

  return {
    async getReviews(scanId) {
      const { data, error } = await db
        .from("reviews")
        .select("region_id, final_json, field_status, reviewed_at, regions!inner(scan_id)")
        .eq("regions.scan_id", scanId);
      if (error) fail("read", error);
      return (data ?? []).map((row) => {
        const final = FinalSchema.parse(row.final_json);
        const status = StatusSchema.parse(row.field_status);
        return {
          regionId: row.region_id,
          reviewedAt: row.reviewed_at,
          fields: Object.entries(final).map(([key, value]) => ({ key, value, source: status[key] ?? "edited" })),
        };
      });
    },

    async saveReview({ regionId, finalJson, fieldStatus, edited, readings }) {
      const { data: existing, error: readError } = await db
        .from("reviews")
        .select("final_json")
        .eq("region_id", regionId)
        .maybeSingle();
      if (readError) fail("read", readError);

      const { error } = await db.from("reviews").upsert(
        {
          region_id: regionId,
          final_json: finalJson,
          field_status: fieldStatus,
          edited,
          reviewed_at: new Date().toISOString(),
        },
        { onConflict: "region_id" },
      );
      if (error) fail("upsert", error);

      // Key order from jsonb is not stable, so compare as sorted entries.
      const sorted = (o: unknown) => JSON.stringify(Object.entries(o as object).sort(([a], [b]) => a.localeCompare(b)));
      if (existing && sorted(existing.final_json) === sorted(finalJson)) return;

      const { error: eventError } = await db
        .from("recognition_event")
        .insert({ region_id: regionId, readings, human_final: finalJson });
      if (eventError) fail("insert", eventError);
    },
  };
}

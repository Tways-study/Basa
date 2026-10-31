import { reconcileReadings } from "@/lib/pipeline/reconcile";
import type { Decision, Reading, ReconciledField } from "@/lib/schemas";

export type ResolvedReview =
  | { ok: true; finalJson: Record<string, string | null>; fieldStatus: Record<string, Decision["source"]>; edited: boolean }
  | { ok: false; error: string };

/**
 * Checks a person's decisions against the fields the server derived from the stored readings, and
 * builds the record to store. The server never trusts the client's idea of what the readers said:
 * a reader's answer is only accepted if it is what that reader actually returned, and `agreed` only
 * if the readers matched. Pure, so it is tested without a database.
 */
export function resolveReview(fields: ReconciledField[], decisions: Decision[]): ResolvedReview {
  const byKey = new Map<string, Decision>();
  for (const d of decisions) {
    if (byKey.has(d.key)) return { ok: false, error: `The field ${d.key} was answered twice.` };
    byKey.set(d.key, d);
  }

  const known = new Set(fields.map((f) => f.key));
  for (const key of byKey.keys()) {
    if (!known.has(key)) return { ok: false, error: `The field ${key} is not part of this region.` };
  }

  const finalJson: Record<string, string | null> = {};
  const fieldStatus: Record<string, Decision["source"]> = {};
  let edited = false;

  for (const field of fields) {
    const d = byKey.get(field.key);
    // Everything needs a person's answer, agreed fields included.
    if (!d) return { ok: false, error: `The field ${field.key} has not been confirmed.` };

    if (d.source === "agreed") {
      // The schema trims what the person sends, so compare against the trimmed stored value too.
      if (field.status !== "agreed" || d.value !== field.value.trim()) {
        return { ok: false, error: `The readers did not agree on ${field.key}. Pick a value or type one.` };
      }
    } else if (d.source === "muse_spark" || d.source === "muse_spark_open") {
      if (d.value !== field.readings[d.source]?.trim()) {
        return { ok: false, error: `That value is not what the reader returned for ${field.key}.` };
      }
    } else {
      edited = true;
    }

    finalJson[field.key] = d.value;
    fieldStatus[field.key] = d.source;
  }

  return { ok: true, finalJson, fieldStatus, edited };
}

/**
 * Whether every region has been looked at by a person. A region with fields needs a stored review.
 * A region with no fields can only be skipped when both readers actually answered and found nothing:
 * if a reader failed or is missing, "no fields" means "not read", and a person never saw it.
 */
export function isScanComplete(
  regionIds: string[],
  readings: Pick<Reading, "regionId" | "model" | "fields" | "error">[],
  reviewedRegionIds: Set<string>,
): boolean {
  return regionIds.every((id) => {
    const own = readings.filter((r) => r.regionId === id);
    if (reconcileReadings(own).length > 0) return reviewedRegionIds.has(id);
    return own.length >= 2 && own.every((r) => !r.error);
  });
}

import type { Decision, ReconciledField } from "@/lib/schemas";

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
      if (field.status !== "agreed" || d.value !== field.value) {
        return { ok: false, error: `The readers did not agree on ${field.key}. Pick a value or type one.` };
      }
    } else if (d.source === "muse_spark" || d.source === "muse_spark_open") {
      if (d.value !== field.readings[d.source]) {
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

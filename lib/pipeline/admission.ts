export interface AdmissionLimits {
  perHour: number;
  perDay: number;
}

export type Admission = { ok: true } | { ok: false; reason: "hour" | "day"; retryAfterSeconds: number };

/**
 * Decides whether a NEW scan may start, from how many scans were created in the last hour and day.
 * MAX_MODEL_CALLS_PER_SCAN caps one scan; this caps how many scans there can be, so the total model
 * spend has a ceiling even though the sync endpoint has no login. The count is global, not per person.
 * Retry-After is a rough wait (the window is a sliding one), not an exact reset time.
 */
export function decideAdmission(counts: { lastHour: number; lastDay: number }, limits: AdmissionLimits): Admission {
  if (counts.lastDay >= limits.perDay) return { ok: false, reason: "day", retryAfterSeconds: 3600 };
  if (counts.lastHour >= limits.perHour) return { ok: false, reason: "hour", retryAfterSeconds: 300 };
  return { ok: true };
}

import { normalize } from "@/lib/pipeline/reconcile";
import { FieldKeySchema, type RawValue, type ReadingFields, type ReconciledField } from "@/lib/schemas";

// Scoring only: no network, no files. The harness (run.ts) and the tests both call these functions.
// A value counts as correct when it matches the ground truth after the same normalization reconcile uses,
// so "Lab B" and "lab B", or "umol/L" and "µmol/L", are not errors.

export type Truth = Record<string, RawValue>;

/** Ground-truth files hold the shared field keys; keys starting with "_" are notes for people. */
export function truthFrom(json: Record<string, unknown>): Truth {
  const out: Truth = {};
  for (const [key, value] of Object.entries(json)) {
    if (key.startsWith("_")) continue;
    FieldKeySchema.parse(key);
    if (value !== null && typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
      throw new Error(`Ground truth key ${key} must be a string, number, boolean or null`);
    }
    out[key] = value;
  }
  return out;
}

/** A missing answer is the same as null: nothing was read. */
export function sameValue(key: string, a: RawValue | undefined, b: RawValue | undefined): boolean {
  return normalize(key, a ?? null) === normalize(key, b ?? null);
}

const ROW_KEY = /^row([1-9]\d*)\.(test|value|unit)$/;

function rowOf(key: string): number | null {
  const m = ROW_KEY.exec(key);
  return m ? Number(m[1]) : null;
}

/** row number -> the ground-truth keys of that row. */
function truthRows(truth: Truth): Map<number, string[]> {
  const rows = new Map<number, string[]>();
  for (const key of Object.keys(truth)) {
    const n = rowOf(key);
    if (n !== null) rows.set(n, [...(rows.get(n) ?? []), key]);
  }
  return rows;
}

/** Rows the chart does not have but a reader returned with something in them. */
function extraRows(truth: Truth, fields: ReadingFields, keep: (key: string) => boolean = () => true): number {
  const maxTruthRow = Math.max(0, ...truthRows(truth).keys());
  const extra = new Set<number>();
  for (const [key, value] of Object.entries(fields)) {
    const n = rowOf(key);
    if (n !== null && n > maxTruthRow && normalize(key, value) !== null && keep(key)) extra.add(n);
  }
  return extra.size;
}

// ---- One reading against the truth (conditions A and B) ----

export interface ReadCounts {
  fields: number;
  correct: number;
  rows: number;
  rowsRecalled: number;
  hallucinatedRows: number;
}

export interface FieldOutcome {
  key: string;
  truth: RawValue;
  value: RawValue | undefined;
  correct: boolean;
}

export function scoreReading(truth: Truth, fields: ReadingFields): { counts: ReadCounts; outcomes: FieldOutcome[] } {
  const outcomes = Object.keys(truth).map((key) => ({
    key,
    truth: truth[key],
    value: key in fields ? fields[key] : undefined,
    correct: sameValue(key, fields[key], truth[key]),
  }));
  const byKey = new Map(outcomes.map((o) => [o.key, o.correct]));
  const rows = truthRows(truth);
  const rowsRecalled = [...rows.values()].filter((keys) => keys.every((k) => byKey.get(k))).length;
  return {
    outcomes,
    counts: {
      fields: outcomes.length,
      correct: outcomes.filter((o) => o.correct).length,
      rows: rows.size,
      rowsRecalled,
      hallucinatedRows: extraRows(truth, fields),
    },
  };
}

// ---- Two readers plus reconcile (condition C) ----

export interface ReviewCounts {
  fields: number;
  /** Muse Spark's own value was right or wrong, whatever C did with it. */
  sparkCorrect: number;
  sparkWrong: number;
  /** Of the sparkWrong fields, how many C flagged for a person (the headline: error catch rate). */
  caught: number;
  /** Of the sparkCorrect fields, how many C flagged anyway (review burden). */
  falseFlags: number;
  openCorrect: number;
  agreed: number;
  agreedCorrect: number;
  /** Both readers matched on a wrong value: the failure reconcile cannot catch. */
  agreedButWrong: number;
  flagged: number;
  /** Neither reader returned the key at all, so nothing was flagged. Counted when the truth has a value. */
  missedByBoth: number;
  rows: number;
  /** Rows where every field is agreed and correct, or flagged for a person: no silent error. */
  rowsRecalled: number;
  /** Rows beyond the chart's rows that both readers agreed on, so a person is never asked about them. */
  hallucinatedRows: number;
}

export interface ReviewOutcome {
  key: string;
  truth: RawValue;
  status: "agreed" | "flagged" | "absent";
  sparkCorrect: boolean;
  openCorrect: boolean;
  /** The agreed value, when there is one. */
  agreedValue: RawValue | undefined;
  agreedCorrect: boolean | null;
}

export function classifyReview(
  truth: Truth,
  spark: ReadingFields,
  open: ReadingFields,
  reconciled: ReconciledField[],
): ReviewOutcome[] {
  const byKey = new Map(reconciled.map((f) => [f.key, f]));
  return Object.keys(truth).map((key) => {
    const field = byKey.get(key);
    const status = field ? field.status : "absent";
    const agreedValue = field?.status === "agreed" ? field.value : undefined;
    return {
      key,
      truth: truth[key],
      status,
      sparkCorrect: sameValue(key, spark[key], truth[key]),
      openCorrect: sameValue(key, open[key], truth[key]),
      agreedValue,
      agreedCorrect: field?.status === "agreed" ? sameValue(key, field.value, truth[key]) : null,
    };
  });
}

export function scoreReview(
  truth: Truth,
  spark: ReadingFields,
  open: ReadingFields,
  reconciled: ReconciledField[],
): { counts: ReviewCounts; outcomes: ReviewOutcome[] } {
  const outcomes = classifyReview(truth, spark, open, reconciled);
  const sparkWrong = outcomes.filter((o) => !o.sparkCorrect);
  const sparkRight = outcomes.filter((o) => o.sparkCorrect);
  const agreed = outcomes.filter((o) => o.status === "agreed");

  // A row is safe when each of its fields is either agreed and correct, or flagged for a person.
  const safe = new Map(outcomes.map((o) => [o.key, o.status === "flagged" || o.agreedCorrect === true]));
  const rows = truthRows(truth);

  // Rows the chart does not have: count one when any non-null field of it was agreed, so it reaches the record unflagged.
  const flaggedKeys = new Set(reconciled.filter((f) => f.status === "flagged").map((f) => f.key));
  const merged: ReadingFields = { ...open, ...spark };
  const hallucinatedRows = extraRows(truth, merged, (key) => !flaggedKeys.has(key) && reconciled.some((f) => f.key === key));

  return {
    outcomes,
    counts: {
      fields: outcomes.length,
      sparkCorrect: sparkRight.length,
      sparkWrong: sparkWrong.length,
      caught: sparkWrong.filter((o) => o.status === "flagged").length,
      falseFlags: sparkRight.filter((o) => o.status === "flagged").length,
      openCorrect: outcomes.filter((o) => o.openCorrect).length,
      agreed: agreed.length,
      agreedCorrect: agreed.filter((o) => o.agreedCorrect).length,
      agreedButWrong: agreed.filter((o) => !o.agreedCorrect).length,
      flagged: outcomes.filter((o) => o.status === "flagged").length,
      missedByBoth: outcomes.filter((o) => o.status === "absent" && !o.sparkCorrect).length,
      rows: rows.size,
      rowsRecalled: [...rows.values()].filter((keys) => keys.every((k) => safe.get(k))).length,
      hallucinatedRows,
    },
  };
}

// ---- Totals and rates ----

export function addCounts<T extends object>(a: T, b: T): T {
  const out = { ...a } as Record<string, number>;
  for (const [key, value] of Object.entries(b as Record<string, number>)) out[key] = (out[key] ?? 0) + value;
  return out as T;
}

export const emptyReadCounts = (): ReadCounts => ({ fields: 0, correct: 0, rows: 0, rowsRecalled: 0, hallucinatedRows: 0 });

export const emptyReviewCounts = (): ReviewCounts => ({
  fields: 0,
  sparkCorrect: 0,
  sparkWrong: 0,
  caught: 0,
  falseFlags: 0,
  openCorrect: 0,
  agreed: 0,
  agreedCorrect: 0,
  agreedButWrong: 0,
  flagged: 0,
  missedByBoth: 0,
  rows: 0,
  rowsRecalled: 0,
  hallucinatedRows: 0,
});

/** null when there is nothing to divide by, so a report says "n/a" instead of a made-up 0%. */
export const rate = (n: number, d: number): number | null => (d === 0 ? null : n / d);

export function readRates(c: ReadCounts) {
  return {
    accuracy: rate(c.correct, c.fields),
    rowRecall: rate(c.rowsRecalled, c.rows),
    // Nothing is flagged in A or B, so every wrong field reaches the record.
    residualError: rate(c.fields - c.correct, c.fields),
  };
}

export function reviewRates(c: ReviewCounts) {
  return {
    sparkAccuracy: rate(c.sparkCorrect, c.fields),
    openAccuracy: rate(c.openCorrect, c.fields),
    /** Headline: of the fields Muse Spark got wrong, the share C flagged for a person. */
    errorCatchRate: rate(c.caught, c.sparkWrong),
    /** Of the fields Muse Spark got right, the share C flagged anyway. */
    reviewBurden: rate(c.falseFlags, c.sparkCorrect),
    flaggedShare: rate(c.flagged, c.fields),
    agreedAccuracy: rate(c.agreedCorrect, c.agreed),
    rowRecall: rate(c.rowsRecalled, c.rows),
    /** Wrong values left after a person settles every flagged field: agreed-but-wrong plus fields nobody returned. */
    residualError: rate(c.agreedButWrong + c.missedByBoth, c.fields),
  };
}

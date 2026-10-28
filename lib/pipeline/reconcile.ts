import type { FlagReason, ReadingFields, ReconciledField, RawValue } from "@/lib/schemas";

// Pure functions only: no I/O, so the eval harness and the server share the same logic.

const TRUE_WORDS = new Set(["true", "yes", "y", "present", "1"]);
const FALSE_WORDS = new Set(["false", "no", "n", "absent", "0"]);

/** Trim and collapse whitespace. Returns null when nothing readable is left. */
export function cleanText(raw: RawValue): string | null {
  if (raw === null) return null;
  const s = String(raw).replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
}

/**
 * Canonical form of a plain number, built from the string so 7.20 and 7.2 match
 * without float rounding. Returns null if the text is not a plain number.
 */
export function canonicalNumber(text: string): string | null {
  let t = text.replace(/\s+/g, "");
  if (/^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, ""); // 1,200 -> 1200
  else if (/^[+-]?\d+,\d+$/.test(t)) t = t.replace(",", "."); // 7,2 -> 7.2
  const m = /^([+-]?)(\d*)(?:\.(\d+))?$/.exec(t);
  if (!m || (m[2] === "" && m[3] === undefined)) return null;
  const int = m[2].replace(/^0+(?=\d)/, "") || "0";
  const frac = (m[3] ?? "").replace(/0+$/, "");
  const negative = m[1] === "-" && (int !== "0" || frac !== "");
  return `${negative ? "-" : ""}${int}${frac ? `.${frac}` : ""}`;
}

/** The form two readings are compared in. Display text is kept separately. */
export function normalize(key: string, raw: RawValue): string | null {
  const text = cleanText(raw);
  if (text === null) return null;
  const lower = text.toLowerCase();

  if (key.endsWith(".present")) {
    if (TRUE_WORDS.has(lower)) return "true";
    if (FALSE_WORDS.has(lower)) return "false";
    return lower;
  }
  if (key.endsWith(".unit")) {
    // Unit spellings vary (mg/dL, MG / dl, µmol/L), so ignore case, spaces and the micro sign variant.
    return lower.replace(/\s+/g, "").replace(/[µμ]/g, "u").replace(/\.$/, "");
  }
  if (key.endsWith(".value")) {
    return canonicalNumber(text) ?? lower;
  }
  // Dates and names are compared as text on purpose: guessing day/month order would hide real differences.
  return lower;
}

/**
 * Compare two readers field by field. A match is `agreed`; anything else is `flagged`.
 * A flagged field carries no value, so nothing can preselect one reader's answer.
 */
export function reconcile(spark: ReadingFields, open: ReadingFields): ReconciledField[] {
  const keys = [...new Set([...Object.keys(spark), ...Object.keys(open)])].sort(compareKeys);

  return keys.map((key): ReconciledField => {
    const inSpark = key in spark;
    const inOpen = key in open;
    const sparkText = inSpark ? cleanText(spark[key]) : null;
    const openText = inOpen ? cleanText(open[key]) : null;
    const readings = { muse_spark: sparkText, muse_spark_open: openText };

    // A row or line only one reader found is flagged automatically.
    if (inSpark !== inOpen) return flagged(key, "one_reader_only", readings);

    const a = normalize(key, spark[key]);
    const b = normalize(key, open[key]);
    if (a === null && b === null) return flagged(key, "both_unreadable", readings);
    if (a === null || b === null) return flagged(key, "one_unreadable", readings);
    if (a !== b) return flagged(key, "mismatch", readings);

    return {
      key,
      status: "agreed",
      value: sparkText as string,
      readings: { muse_spark: sparkText as string, muse_spark_open: openText as string },
    };
  });
}

function flagged(
  key: string,
  reason: FlagReason,
  readings: { muse_spark: string | null; muse_spark_open: string | null },
): ReconciledField {
  return { key, status: "flagged", reason, readings };
}

// row2 sorts before row10, so the review screen reads top to bottom.
function compareKeys(a: string, b: string): number {
  return a.localeCompare(b, "en", { numeric: true });
}

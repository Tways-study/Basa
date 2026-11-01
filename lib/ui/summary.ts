import type { Decision, ReconciledField, RegionKind } from "@/lib/schemas";
import { displayValue } from "./print-record";
import { labelForKey } from "./review-state";

export const REGION_LABEL: Record<RegionKind, string> = {
  header: "Header",
  table: "Table",
  handwriting: "Handwriting",
  stamp: "Stamp",
  printed: "Printed text",
  signature: "Signature",
};

export type SummaryLine = {
  /** Stable key for lists. */
  id: string;
  /** The region this line came from, so the screen can highlight it on the photo. */
  regionId: string;
  /** Region number in reading order, the same number shown on the photo marks. */
  n: number;
  text: string;
  /** Where the line comes from, e.g. "Region 2, Table". */
  cite: string;
};

type RegionIn = { id: string; kind: RegionKind; fields: ReconciledField[] };

const ROW_KEY = /^row([1-9]\d*)\.(test|value|unit)$/;

/**
 * The confirmed record restated as plain lines, each citing its source region.
 * A fixed template over the person's final answers: no model call and no wording of its own, so it can only
 * say what the record says (not advice, not inference). An unreadable field reads "[not legible on source]".
 */
export function buildSummary(
  regions: { region: RegionIn; n: number }[],
  choices: Record<string, Record<string, Decision | undefined>>,
): SummaryLine[] {
  const lines: SummaryLine[] = [];
  for (const { region, n } of regions) {
    if (region.fields.length === 0) continue;
    const mine = choices[region.id] ?? {};
    const cite = `Region ${n}, ${REGION_LABEL[region.kind]}`;
    const rows = new Map<number, { test?: string; value?: string; unit?: string }>();
    const single: SummaryLine[] = [];
    for (const field of region.fields) {
      const text = displayValue(field.key, mine[field.key]);
      const m = ROW_KEY.exec(field.key);
      if (m) {
        const row = rows.get(Number(m[1])) ?? {};
        row[m[2] as "test" | "value" | "unit"] = text;
        rows.set(Number(m[1]), row);
      } else {
        single.push({ id: `${region.id}:${field.key}`, regionId: region.id, n, text: `${labelForKey(field.key)}: ${text}`, cite });
      }
    }
    lines.push(...single);
    for (const [rowN, row] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
      // Keep the three parts in table order; a part the readers never returned is left out, not invented.
      const parts = [row.test, row.value, row.unit].filter((p): p is string => p !== undefined);
      lines.push({ id: `${region.id}:row${rowN}`, regionId: region.id, n, text: `Row ${rowN}: ${parts.join(" ")}`, cite });
    }
  }
  return lines;
}

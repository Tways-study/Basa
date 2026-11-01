import type { Decision, ReconciledField, RegionKind } from "@/lib/schemas";
import { labelForKey } from "./review-state";

/** What a printed copy shows for one field. A value is never left blank: an unreadable field says so. */
export const NOT_LEGIBLE = "[not legible on source]";
export const NOT_CONFIRMED = "[not confirmed]";

export function printableValue(decision: Decision | undefined): string {
  if (!decision) return NOT_CONFIRMED;
  if (decision.source === "unreadable" || decision.value === null) return NOT_LEGIBLE;
  const text = decision.value.trim();
  return text === "" ? NOT_LEGIBLE : text;
}

/** The text a person reads for a field. "present" fields are stored as true or false and read as yes or no. */
export function displayValue(key: string, decision: Decision | undefined): string {
  const raw = printableValue(decision);
  if (!key.endsWith(".present")) return raw;
  return raw === "true" ? "yes" : raw === "false" ? "no" : raw;
}

export type PrintRow = { n: number; test: string; value: string; unit: string };
export type PrintItem = { label: string; text: string };
export type PrintSection = { n: number; kind: RegionKind; rows: PrintRow[]; items: PrintItem[] };

type RegionIn = { id: string; kind: RegionKind; fields: ReconciledField[] };

const ROW_KEY = /^row([1-9]\d*)\.(test|value|unit)$/;

/**
 * The confirmed record as plain sections. Only the person's final answers are used, never a reader's raw output.
 * `n` is the region's number in reading order, the same number shown on the photo marks and the review screen.
 */
export function buildPrintable(regions: { region: RegionIn; n: number }[], choices: Record<string, Record<string, Decision | undefined>>): PrintSection[] {
  const sections: PrintSection[] = [];
  for (const { region, n } of regions) {
    if (region.fields.length === 0) continue;
    const mine = choices[region.id] ?? {};
    const rowMap = new Map<number, PrintRow>();
    const items: PrintItem[] = [];
    for (const field of region.fields) {
      const text = displayValue(field.key, mine[field.key]);
      const m = ROW_KEY.exec(field.key);
      if (m) {
        const row = rowMap.get(Number(m[1])) ?? { n: Number(m[1]), test: NOT_CONFIRMED, value: NOT_CONFIRMED, unit: NOT_CONFIRMED };
        row[m[2] as "test" | "value" | "unit"] = text;
        rowMap.set(Number(m[1]), row);
      } else {
        items.push({ label: labelForKey(field.key), text });
      }
    }
    sections.push({ n, kind: region.kind, rows: [...rowMap.values()].sort((a, b) => a.n - b.n), items });
  }
  return sections;
}

import type { RawValue, ReadingFields } from "@/lib/schemas";

export type FieldValue = { text: string; unreadable: boolean };

/** null is "could not read". It is shown as such, never as a blank or a guess. */
export function formatValue(value: RawValue | undefined): FieldValue {
  if (value === null || value === undefined) return { text: "unreadable", unreadable: true };
  if (typeof value === "boolean") return { text: value ? "yes" : "no", unreadable: false };
  const text = String(value).trim();
  return text === "" ? { text: "unreadable", unreadable: true } : { text, unreadable: false };
}

export type TableRow = { n: number; test: FieldValue; value: FieldValue; unit: FieldValue };
export type ListItem = { key: string; value: FieldValue };
export type GroupedFields = { rows: TableRow[]; items: ListItem[] };

const ROW_KEY = /^row([1-9]\d*)\.(test|value|unit)$/;
const NUMBERED_KEY = /^([a-z]+)([1-9]\d*)$/;

// Header keys appear in the order a person reads a chart header.
const FIXED_ORDER = [
  "header.patient_name",
  "header.chart_no",
  "header.date",
  "stamp.present",
  "stamp.text",
  "signature.present",
];

function rank(key: string): [number, number, string] {
  const fixed = FIXED_ORDER.indexOf(key);
  if (fixed !== -1) return [0, fixed, key];
  const numbered = NUMBERED_KEY.exec(key);
  if (numbered) return [1, Number(numbered[2]), key];
  return [2, 0, key];
}

/** Splits table keys into rows and orders everything else the way a person would read it. */
export function groupFields(fields: ReadingFields): GroupedFields {
  const rowMap = new Map<number, Partial<Record<"test" | "value" | "unit", RawValue>>>();
  const items: ListItem[] = [];

  for (const [key, raw] of Object.entries(fields)) {
    const row = ROW_KEY.exec(key);
    if (row) {
      const n = Number(row[1]);
      rowMap.set(n, { ...rowMap.get(n), [row[2]]: raw });
    } else {
      items.push({ key, value: formatValue(raw) });
    }
  }

  items.sort((a, b) => {
    const [ga, na, ka] = rank(a.key);
    const [gb, nb, kb] = rank(b.key);
    return ga - gb || na - nb || ka.localeCompare(kb);
  });

  const rows = [...rowMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([n, cells]) => ({
      n,
      test: formatValue(cells.test),
      value: formatValue(cells.value),
      unit: formatValue(cells.unit),
    }));

  return { rows, items };
}

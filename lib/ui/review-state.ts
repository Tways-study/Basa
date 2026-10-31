import type { Decision, ReaderId, ReconciledField } from "@/lib/schemas";

/** A person's answer for one field. A missing entry means not decided yet, which is where every field starts. */
export type Choice = Decision;
export type Choices = Record<string, Choice | undefined>;

export type Option =
  | { id: string; source: "agreed" | ReaderId; value: string; label: string }
  | { id: "edited"; source: "edited"; label: string }
  | { id: "unreadable"; source: "unreadable"; label: string };

const READER_LABEL: Record<ReaderId, string> = {
  muse_spark: "Muse Spark",
  muse_spark_open: "Muse Spark Open",
};

/**
 * The answers a person may give for a field. A flagged field offers each reader that actually found
 * something, but never marks one as chosen: the person picks. A reader that found nothing is not an option.
 */
export function optionsFor(field: ReconciledField): Option[] {
  const options: Option[] = [];
  if (field.status === "agreed") {
    options.push({ id: "agreed", source: "agreed", value: field.value, label: "Confirm" });
  } else {
    for (const reader of ["muse_spark", "muse_spark_open"] as const) {
      const value = field.readings[reader];
      if (value !== null && value.trim() !== "") {
        options.push({ id: reader, source: reader, value, label: READER_LABEL[reader] });
      }
    }
  }
  options.push({ id: "edited", source: "edited", label: "Type a value" });
  options.push({ id: "unreadable", source: "unreadable", label: "Can't be read" });
  return options;
}

/** Bulk confirm touches only agreed fields that are still undecided. It can never settle a flagged one. */
export function confirmAgreed(fields: ReconciledField[], choices: Choices): Choices {
  const next = { ...choices };
  for (const f of fields) {
    if (f.status === "agreed" && !next[f.key]) next[f.key] = { key: f.key, source: "agreed", value: f.value };
  }
  return next;
}

export type Progress = { total: number; decided: number; flaggedLeft: number; agreedLeft: number; complete: boolean };

export function progressOf(fields: ReconciledField[], choices: Choices): Progress {
  let decided = 0;
  let flaggedLeft = 0;
  let agreedLeft = 0;
  for (const f of fields) {
    if (choices[f.key]) decided += 1;
    else if (f.status === "flagged") flaggedLeft += 1;
    else agreedLeft += 1;
  }
  return { total: fields.length, decided, flaggedLeft, agreedLeft, complete: fields.length > 0 && decided === fields.length };
}

/** Human wording for a key, e.g. row2.value -> "Row 2, value". */
export function labelForKey(key: string): string {
  const row = /^row(\d+)\.(\w+)$/.exec(key);
  if (row) return `Row ${row[1]}, ${row[2]}`;
  const line = /^line(\d+)$/.exec(key);
  if (line) return `Line ${line[1]}`;
  const [group, name] = key.split(".");
  return name ? `${group[0].toUpperCase()}${group.slice(1)}, ${name.replace("_", " ")}` : key;
}

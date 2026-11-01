import { z } from "zod";
import { DecisionSchema } from "@/lib/schemas";
import type { Choices } from "./review-state";

// Answers a person has picked but not confirmed yet. Confirm record is the only thing that writes to
// the database, so without this a refresh (a pull-down on a phone, or the browser dropping a background
// tab) would throw away a review in progress. The draft lives on this device only and is cleared as
// soon as the record is saved. The server still re-checks every answer when it is confirmed.

const DraftSchema = z.record(z.string(), z.record(z.string(), DecisionSchema));

/** The part of Storage this uses, so tests can pass a plain object. */
export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const keyFor = (scanId: string) => `basa-review-draft:${scanId}`;

/** Region id -> answers. Anything that does not parse is treated as no draft, never as partial answers. */
export function loadDraft(storage: DraftStorage, scanId: string): Record<string, Choices> | null {
  const raw = storage.getItem(keyFor(scanId));
  if (!raw) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    storage.removeItem(keyFor(scanId));
    return null;
  }
  const parsed = DraftSchema.safeParse(json);
  if (!parsed.success) {
    storage.removeItem(keyFor(scanId));
    return null;
  }
  return Object.keys(parsed.data).length > 0 ? parsed.data : null;
}

export function saveDraft(storage: DraftStorage, scanId: string, choices: Record<string, Choices>): void {
  const clean: Record<string, Choices> = {};
  for (const [regionId, answers] of Object.entries(choices)) {
    const kept = Object.fromEntries(Object.entries(answers).filter(([, c]) => c !== undefined));
    if (Object.keys(kept).length > 0) clean[regionId] = kept;
  }
  if (Object.keys(clean).length === 0) storage.removeItem(keyFor(scanId));
  else storage.setItem(keyFor(scanId), JSON.stringify(clean));
}

export function clearDraft(storage: DraftStorage, scanId: string): void {
  storage.removeItem(keyFor(scanId));
}

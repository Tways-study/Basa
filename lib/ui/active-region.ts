/**
 * Which region the source dock should show. `crossing` holds the ids of regions that currently cross the
 * reading line near the top of the screen. The topmost one in render order wins, so the answer depends
 * only on where the person has scrolled, never on what they answered (a field must not jump while it
 * is being answered). With nothing crossing the line (between regions), the last choice is kept.
 */
export function pickActiveRegion(crossing: ReadonlySet<string>, orderedIds: readonly string[], current: string | null): string | null {
  for (const id of orderedIds) if (crossing.has(id)) return id;
  return current !== null && orderedIds.includes(current) ? current : (orderedIds[0] ?? null);
}

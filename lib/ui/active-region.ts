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

/** How far (px) the page may scroll from where a region was pinned before the dock goes back to following the scroll. */
export const PIN_RELEASE_PX = 300;

/** True once the person has scrolled far enough from the pinned spot that the pin should let go. */
export function shouldReleasePin(pinnedAtY: number, currentY: number): boolean {
  return Math.abs(currentY - pinnedAtY) > PIN_RELEASE_PX;
}

/**
 * The region one step before (-1) or after (+1) `current` in review order, or null at either end.
 * An unknown `current` counts as the first region, matching `pickActiveRegion`.
 */
export function stepRegion(orderedIds: readonly string[], current: string | null, direction: -1 | 1): string | null {
  const at = current === null ? 0 : Math.max(0, orderedIds.indexOf(current));
  return orderedIds[at + direction] ?? null;
}

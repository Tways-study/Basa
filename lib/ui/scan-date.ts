/**
 * "2 Nov 2026, 3:42 PM" in the viewer's own timezone, or null when there is no usable time.
 * Null (not a made-up date) so the screen can leave the line out instead of showing a wrong one.
 */
export function formatScanned(when: string | number | Date | null | undefined): string | null {
  if (when === null || when === undefined) return null;
  const date = new Date(when);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("en-PH", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

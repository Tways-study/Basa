import type { BBox } from "@/lib/schemas";

export type Mark = { n: number; box: BBox; tone: "ink" | "flag" | "verified" };

const TONE: Record<Mark["tone"], string> = {
  ink: "border-ink",
  flag: "border-flag",
  verified: "border-verified",
};

// Spans, not divs: this is also used inside a button, which may only hold phrasing content.
// Boxes come from stored fractions, so they follow any image size. No masks: undecoded.
export function Marks({ marks }: { marks: Mark[] }) {
  return (
    <>
      {marks.map(({ n, box, tone }) => (
        <span
          key={n}
          aria-hidden="true"
          className={`pointer-events-none absolute block border-2 ${TONE[tone]}`}
          style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }}
        >
          <span className="absolute -top-px -left-px bg-paper px-1 font-mono text-xs leading-5 text-ink">{n}</span>
        </span>
      ))}
    </>
  );
}

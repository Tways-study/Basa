"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import type { SummaryLine } from "@/lib/ui/summary";

/**
 * The confirmed record restated in plain lines, each citing its source region. Pointing at a line (hover,
 * keyboard focus, or a tap that pins it) draws that region heavier on the photo. It restates the record and
 * adds nothing: no advice and no inference.
 */
export function RecordSummary({ lines, onActive }: { lines: SummaryLine[]; onActive: (regionId: string | null) => void }) {
  const [pinned, setPinned] = useState<string | null>(null);

  // A tap has no hover, so a tap pins the line until it is tapped again; hover and focus still work on top.
  function pin(line: SummaryLine) {
    const next = pinned === line.id ? null : line.id;
    setPinned(next);
    onActive(next === null ? null : line.regionId);
  }

  return (
    <section aria-labelledby="record-summary-heading" className="flex w-full flex-col gap-2 border-t pt-4">
      <h2 id="record-summary-heading" className="text-2xl font-semibold">
        Summary of the confirmed record
      </h2>
      <p className="text-sm text-muted-foreground">
        These lines only restate what you confirmed. Select a line to see where it came from on the photo.
      </p>
      <ul className="flex flex-col">
        {lines.map((line) => (
          <li key={line.id} className="border-b last:border-b-0">
            <button
              type="button"
              aria-pressed={pinned === line.id}
              onClick={() => pin(line)}
              onMouseEnter={() => onActive(line.regionId)}
              onMouseLeave={() => onActive(pinned === null ? null : (lines.find((l) => l.id === pinned)?.regionId ?? null))}
              onFocus={() => onActive(line.regionId)}
              onBlur={() => onActive(pinned === null ? null : (lines.find((l) => l.id === pinned)?.regionId ?? null))}
              className="flex min-h-11 w-full flex-col items-start gap-0.5 rounded-md px-1 py-2 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-muted"
            >
              <span className="font-mono break-words">{line.text}</span>
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin aria-hidden="true" className="size-4" />
                {line.cite}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

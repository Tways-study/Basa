"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pickActiveRegion } from "@/lib/ui/active-region";

// Not `review-region-…`: that is the heading id each section is labelled by.
export const regionDomId = (id: string) => `region-section-${id}`;

/**
 * Follows the region being reviewed, for the source dock: the topmost region crossing a reading line a
 * little below the top of the screen, or the one holding keyboard focus or a tap, whichever happened last.
 * Observer entries only report changes, so the crossing set is kept between callbacks.
 */
export function useActiveRegion(orderedIds: readonly string[]) {
  const key = orderedIds.join("|");
  const ids = useMemo(() => (key ? key.split("|") : []), [key]);
  const [active, setActive] = useState<string | null>(null);
  const crossing = useRef(new Set<string>());

  useEffect(() => {
    if (ids.length === 0) return;
    crossing.current = new Set();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = ids.find((x) => regionDomId(x) === entry.target.id);
          if (!id) continue;
          if (entry.isIntersecting) crossing.current.add(id);
          else crossing.current.delete(id);
        }
        setActive((current) => pickActiveRegion(crossing.current, ids, current));
      },
      // A thin band 20 to 35% down the screen: below the sticky progress strip, above the middle.
      { rootMargin: "-20% 0px -65% 0px" },
    );
    for (const id of ids) {
      const el = document.getElementById(regionDomId(id));
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [ids]);

  // Focus (answering a field) or a tap inside a region pins that region until the next scroll change.
  const pin = useCallback((id: string) => setActive(id), []);
  return { activeId: pickActiveRegion(new Set(), ids, active), pin };
}

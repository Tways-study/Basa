"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pickActiveRegion, shouldReleasePin, stepRegion } from "@/lib/ui/active-region";

// Not `review-region-…`: that is the heading id each section is labelled by.
export const regionDomId = (id: string) => `region-section-${id}`;

/**
 * Follows the region being reviewed, for the source dock: the topmost region crossing a reading line a
 * little below the top of the screen, or the one holding keyboard focus, a tap or a Previous/Next press.
 * A pinned region stays until the page has scrolled well away from where it was pinned, so the dock does
 * not jump while someone answers. Observer entries only report changes, so the crossing set is kept
 * between callbacks.
 */
export function useActiveRegion(orderedIds: readonly string[]) {
  const key = orderedIds.join("|");
  const ids = useMemo(() => (key ? key.split("|") : []), [key]);
  const [active, setActive] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const crossing = useRef(new Set<string>());
  // Refs so the observer and scroll listener (set up once per id list) see the latest values.
  const pinnedRef = useRef(false);
  const pinnedAtY = useRef(0);

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
        if (pinnedRef.current) return;
        setActive((current) => pickActiveRegion(crossing.current, ids, current));
      },
      // A thin band 20 to 35% down the screen: below the sticky progress strip, above the middle.
      { rootMargin: "-20% 0px -65% 0px" },
    );
    for (const id of ids) {
      const el = document.getElementById(regionDomId(id));
      if (el) observer.observe(el);
    }

    function onScroll() {
      if (!pinnedRef.current || !shouldReleasePin(pinnedAtY.current, window.scrollY)) return;
      pinnedRef.current = false;
      setPinned(false);
      setActive((current) => pickActiveRegion(crossing.current, ids, current));
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [ids]);

  // Focus (answering a field), a tap inside a region, or a step pins that region until the page scrolls away.
  const pin = useCallback((id: string) => {
    pinnedRef.current = true;
    pinnedAtY.current = window.scrollY;
    setPinned(true);
    setActive(id);
  }, []);

  const activeId = pickActiveRegion(new Set(), ids, active);

  // Previous / Next: jump to that region's section, then pin it. The scroll is instant so the pin point
  // is recorded at the final position.
  const step = useCallback(
    (direction: -1 | 1) => {
      const target = stepRegion(ids, activeId, direction);
      if (!target) return;
      document.getElementById(regionDomId(target))?.scrollIntoView({ behavior: "instant", block: "start" });
      pin(target);
    },
    [ids, activeId, pin],
  );

  return {
    activeId,
    pinned,
    pin,
    step,
    canPrev: stepRegion(ids, activeId, -1) !== null,
    canNext: stepRegion(ids, activeId, 1) !== null,
  };
}

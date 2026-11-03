"use client";

import { useSyncExternalStore } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { SourceCrop } from "@/components/scan/source-crop";
import type { ImageSize } from "@/components/scan/use-image-size";
import { Button } from "@/components/ui/button";
import type { BBox } from "@/lib/schemas";

export type DockRegion = { n: number; kindLabel: string; box: BBox };

const STORAGE_KEY = "basa.source-dock.open";

/** Dock height while open, so the page can keep its last controls clear of it. */
export const DOCK_OPEN_PAD = "pb-[calc(35dvh+3.5rem)]";
export const DOCK_CLOSED_PAD = "pb-20";

// Set on every toggle, so the button still works when the browser refuses to store anything.
let remembered: boolean | null = null;

function readOpen(): boolean {
  if (remembered !== null) return remembered;
  try {
    return localStorage.getItem(STORAGE_KEY) !== "closed";
  } catch (err) {
    console.error("dock state read failed:", err instanceof Error ? err.name : "unknown error");
    return true;
  }
}

const listeners = new Set<() => void>();

/** Open or closed, remembered on this device as a convenience; the screen works without it. */
export function useDockOpen(): [boolean, (open: boolean) => void] {
  // A store read, so the server and first client render agree (open) and no state is set in an effect.
  const open = useSyncExternalStore(
    (notify) => {
      listeners.add(notify);
      return () => void listeners.delete(notify);
    },
    readOpen,
    () => true,
  );
  return [
    open,
    (next) => {
      remembered = next;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "open" : "closed");
      } catch (err) {
        console.error("dock state write failed:", err instanceof Error ? err.name : "unknown error");
      }
      for (const notify of listeners) notify();
    },
  ];
}

function ActiveSource({ region, url, size }: { region: DockRegion; url: string | null; size: ImageSize | null }) {
  return (
    <SourceCrop url={url} box={region.box} size={size} label={`Crop of region ${region.n}, the area the readers saw`} />
  );
}

/** Phones: pinned to the bottom, following the region being reviewed. Collapses to a one-line bar. */
export function SourceDock({
  region,
  url,
  size,
  open,
  onOpenChange,
}: {
  region: DockRegion | null;
  url: string | null;
  size: ImageSize | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!region) return null;
  return (
    <section
      aria-label="Photo of the region you are checking"
      className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-ink bg-background pb-[env(safe-area-inset-bottom)] lg:hidden print:hidden"
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4">
        <p className="font-medium" aria-live="polite">
          Region {region.n}, {region.kindLabel}
        </p>
        <Button variant="ghost" aria-expanded={open} aria-controls="source-dock-body" onClick={() => onOpenChange(!open)}>
          {open ? <ChevronDown aria-hidden="true" /> : <ChevronUp aria-hidden="true" />}
          {open ? "Hide photo" : "Show photo"}
        </Button>
      </div>
      {open ? (
        <div
          id="source-dock-body"
          tabIndex={0}
          aria-label={`Photo of region ${region.n}, scrollable`}
          className="mx-auto max-h-[35dvh] max-w-5xl overflow-auto px-4 pb-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ActiveSource region={region} url={url} size={size} />
        </div>
      ) : null}
    </section>
  );
}

/** Desktop: the crop under the photo in the sticky left column. */
export function SourcePanel({ region, url, size }: { region: DockRegion | null; url: string | null; size: ImageSize | null }) {
  if (!region) return null;
  return (
    <section aria-label="Photo of the region you are checking" className="hidden flex-col gap-2 lg:flex print:hidden">
      <h2 className="text-lg font-semibold">
        Region {region.n}, {region.kindLabel}
      </h2>
      <ActiveSource region={region} url={url} size={size} />
    </section>
  );
}

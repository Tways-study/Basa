"use client";

import { useSyncExternalStore } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Maximize2, Minimize2, Pin, ScrollText } from "lucide-react";
import { SourceCrop } from "@/components/scan/source-crop";
import type { ImageSize } from "@/components/scan/use-image-size";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { BBox } from "@/lib/schemas";

export type DockRegion = { n: number; kindLabel: string; box: BBox };

/** Previous / Next between regions, and whether the dock is following the scroll or pinned by a tap. */
export type DockNav = { canPrev: boolean; canNext: boolean; pinned: boolean; onStep: (direction: -1 | 1) => void };

export type DockSize = "hidden" | "small" | "large";

const STORAGE_KEY = "basa.source-dock.size";

/** Height of the photo area per size, and the page padding that keeps the last controls clear of the whole dock. */
const BODY_HEIGHT: Record<Exclude<DockSize, "hidden">, string> = { small: "max-h-[min(30dvh,12rem)]", large: "max-h-[min(45dvh,22rem)]" };
export const DOCK_PAD: Record<DockSize, string> = {
  hidden: "pb-24",
  small: "pb-[calc(min(30dvh,12rem)+6rem)]",
  large: "pb-[calc(min(45dvh,22rem)+6rem)]",
};

function isSize(value: string | null): value is DockSize {
  return value === "hidden" || value === "small" || value === "large";
}

// Set on every change, so the buttons still work when the browser refuses to store anything.
let remembered: DockSize | null = null;
// The size to come back to when "Show photo" is pressed after hiding.
let lastShown: Exclude<DockSize, "hidden"> = "small";

function readSize(): DockSize {
  if (remembered !== null) return remembered;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isSize(stored) ? stored : "small";
  } catch (err) {
    console.error("dock state read failed:", err instanceof Error ? err.name : "unknown error");
    return "small";
  }
}

const listeners = new Set<() => void>();

/** Hidden, small or large, remembered on this device as a convenience; the screen works without it. */
export function useDockSize(): [DockSize, (size: DockSize) => void] {
  // A store read, so the server and first client render agree (small) and no state is set in an effect.
  const size = useSyncExternalStore(
    (notify) => {
      listeners.add(notify);
      return () => void listeners.delete(notify);
    },
    readSize,
    () => "small" as const,
  );
  return [
    size,
    (next) => {
      remembered = next;
      if (next !== "hidden") lastShown = next;
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch (err) {
        console.error("dock state write failed:", err instanceof Error ? err.name : "unknown error");
      }
      for (const notify of listeners) notify();
    },
  ];
}

/** The crop, tappable: opens it at full width in a dialog, where the browser's own pinch zoom works. */
function ActiveSource({ region, url, size }: { region: DockRegion; url: string | null; size: ImageSize | null }) {
  const label = `Crop of region ${region.n}, the area the readers saw`;
  if (!url || !size) return <SourceCrop url={url} box={region.box} size={size} label={label} />;
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`Enlarge the photo of region ${region.n}`}
          className="block w-full cursor-zoom-in rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <SourceCrop url={url} box={region.box} size={size} label={label} />
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Region {region.n}, {region.kindLabel}
          </DialogTitle>
          <DialogDescription>Pinch to zoom. Press Escape or the close button to go back.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[75dvh] overflow-auto">
          <SourceCrop url={url} box={region.box} size={size} label={label} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StepButtons({ nav }: { nav: DockNav }) {
  return (
    <>
      <Button variant="ghost" size="icon" aria-label="Previous region" disabled={!nav.canPrev} onClick={() => nav.onStep(-1)}>
        <ChevronLeft aria-hidden="true" />
      </Button>
      <Button variant="ghost" size="icon" aria-label="Next region" disabled={!nav.canNext} onClick={() => nav.onStep(1)}>
        <ChevronRight aria-hidden="true" />
      </Button>
    </>
  );
}

/** Words and an icon, so the mode never rests on colour. Pinned lets go after a good scroll. */
function FollowTag({ pinned }: { pinned: boolean }) {
  const Icon = pinned ? Pin : ScrollText;
  return (
    <span className="flex items-center gap-1 text-sm text-muted-foreground">
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      {pinned ? "Pinned here" : "Following scroll"}
    </span>
  );
}

/** Phones: pinned to the bottom, following the region being reviewed. Hide it, or make it larger. */
export function SourceDock({
  region,
  url,
  size,
  dockSize,
  onSizeChange,
  nav,
}: {
  region: DockRegion | null;
  url: string | null;
  size: ImageSize | null;
  dockSize: DockSize;
  onSizeChange: (size: DockSize) => void;
  nav: DockNav;
}) {
  if (!region) return null;
  const open = dockSize !== "hidden";
  return (
    <section
      aria-label="Photo of the region you are checking"
      className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-ink bg-background pb-[env(safe-area-inset-bottom)] lg:hidden print:hidden"
    >
      <div className="mx-auto flex max-w-5xl items-center gap-1 px-2">
        <StepButtons nav={nav} />
        <div className="flex min-w-0 flex-1 flex-col px-1">
          <p className="font-medium" aria-live="polite">
            Region {region.n}, {region.kindLabel}
          </p>
          <FollowTag pinned={nav.pinned} />
        </div>
        {open ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={dockSize === "large" ? "Make the photo smaller" : "Make the photo larger"}
            onClick={() => onSizeChange(dockSize === "large" ? "small" : "large")}
          >
            {dockSize === "large" ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          aria-label={open ? "Hide photo" : "Show photo"}
          aria-expanded={open}
          aria-controls="source-dock-body"
          onClick={() => onSizeChange(open ? "hidden" : lastShown)}
        >
          {open ? <ChevronDown aria-hidden="true" /> : <ChevronUp aria-hidden="true" />}
        </Button>
      </div>
      {open ? (
        <div
          id="source-dock-body"
          tabIndex={0}
          aria-label={`Photo of region ${region.n}, scrollable`}
          className={`mx-auto ${BODY_HEIGHT[dockSize]} max-w-5xl overflow-auto px-4 pb-3 outline-none focus-visible:ring-2 focus-visible:ring-ring`}
        >
          <ActiveSource region={region} url={url} size={size} />
        </div>
      ) : null}
    </section>
  );
}

/** Desktop: the crop under the photo in the sticky left column. */
export function SourcePanel({
  region,
  url,
  size,
  nav,
}: {
  region: DockRegion | null;
  url: string | null;
  size: ImageSize | null;
  nav: DockNav;
}) {
  if (!region) return null;
  return (
    <section aria-label="Photo of the region you are checking" className="hidden flex-col gap-2 lg:flex print:hidden">
      <div className="flex items-center gap-1">
        <h2 className="min-w-0 flex-1 text-lg font-semibold">
          Region {region.n}, {region.kindLabel}
        </h2>
        <StepButtons nav={nav} />
      </div>
      <FollowTag pinned={nav.pinned} />
      <ActiveSource region={region} url={url} size={size} />
    </section>
  );
}

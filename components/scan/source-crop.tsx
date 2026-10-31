import type { BBox } from "@/lib/schemas";
import { READ_MARGIN, growBBox } from "@/lib/pipeline/bbox";
import type { ImageSize } from "./use-image-size";

/**
 * The area the readers saw: the stored box grown by READ_MARGIN, the same as the server does before
 * reading. Showing a tighter crop would hide the words a clipped box left out, which is the one case
 * where both readers agree and are still wrong.
 */
export function SourceCrop({
  url,
  box,
  size,
  label,
}: {
  url: string | null;
  box: BBox;
  size: ImageSize | null;
  label: string;
}) {
  if (!url || !size) {
    return (
      <div className="flex min-h-24 items-center justify-center rounded-md border bg-muted p-3 text-sm text-muted-foreground">
        {url ? "Loading the crop" : "The photo could not be loaded."}
      </div>
    );
  }

  const g = growBBox(box, READ_MARGIN, READ_MARGIN);
  return (
    <div
      role="img"
      aria-label={label}
      className="relative w-full overflow-hidden rounded-md border bg-card"
      // No max height: it would cut the bottom off a tall region while the image scale stays width-based,
      // and the lower rows are the ones a short box would have clipped.
      style={{ aspectRatio: `${g.w * size.width} / ${g.h * size.height}` }}
    >
      {/* The whole photo, scaled and shifted so only the grown box shows. Percentages keep it exact at any width. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        draggable={false}
        className="absolute max-w-none select-none"
        style={{ width: `${100 / g.w}%`, left: `${(-g.x / g.w) * 100}%`, top: `${(-g.y / g.h) * 100}%` }}
      />
    </div>
  );
}

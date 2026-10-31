import { type Mark, Marks } from "@/components/scan/marks";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export type { Mark };

/** The chart photo, enlargeable. Boxes are drawn from stored fractions, so they follow any size. No masks: undecoded. */
export function ChartPhoto({
  url,
  onError,
  marks = [],
}: {
  url: string;
  onError: () => void;
  marks?: Mark[];
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="Enlarge the chart photo"
          className="block w-full rounded-md border bg-card p-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background lg:sticky lg:top-4"
        >
          <span className="relative mx-auto block w-fit max-w-full">
            {/* A signed storage URL that changes per request, so next/image cannot optimise it. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="The chart photo you sent" className="block max-h-[70dvh] w-auto max-w-full" onError={onError} />
            <Marks marks={marks} />
          </span>
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Chart photo</DialogTitle>
          <DialogDescription>Press Escape or the close button to go back.</DialogDescription>
        </DialogHeader>
        <span className="relative mx-auto block w-fit max-w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="The chart photo you sent, enlarged" className="block max-h-[75dvh] w-auto max-w-full" />
          <Marks marks={marks} />
        </span>
      </DialogContent>
    </Dialog>
  );
}

import Image from "next/image";
import { Check, TriangleAlert } from "lucide-react";
import { CaptureForm } from "@/components/capture/capture-form";
import { OutboxList } from "@/components/capture/outbox-list";
import { type Mark, Marks } from "@/components/scan/marks";

// The sample is the synthetic chart from eval/fixtures. Boxes are its real regions (1100 x 1400 px),
// coloured the way the review screen colours them, so the person has seen the language before using it.
const W = 1100;
const H = 1400;
const box = (x1: number, y1: number, x2: number, y2: number) => ({ x: x1 / W, y: y1 / H, w: (x2 - x1) / W, h: (y2 - y1) / H });
const SAMPLE_MARKS: Mark[] = [
  { n: 1, box: box(173, 333, 952, 601), tone: "verified" },
  { n: 2, box: box(178, 644, 530, 752), tone: "verified" },
  { n: 3, box: box(750, 813, 974, 930), tone: "flag" },
];

const STEPS = [
  { title: "Photograph the page", text: "Lay it flat, avoid glare, and keep all four corners in view." },
  { title: "Basa reads each part twice", text: "Two separate readers go through every table, line and stamp." },
  { title: "You check and confirm", text: "Where the readers differ, you choose. Nothing is confirmed until you do." },
];

export default function Home() {
  return (
    // Same outer width as the header and the results page, so the wordmark and content share one left edge.
    <main className="mx-auto w-full max-w-5xl px-4 pt-6 pb-16 sm:px-6 sm:pt-10">
      <div className="grid gap-x-14 gap-y-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
        <div className="flex flex-col gap-10">
          <div className="flex flex-col gap-5">
            <h1 className="text-5xl leading-[1.02] font-semibold tracking-tight sm:text-6xl">Photograph a chart</h1>
            <p className="max-w-[44ch] text-lg">
              Basa turns a paper chart into a digital record. A person checks every value against the photo before it is
              confirmed.
            </p>
          </div>

          <CaptureForm />
          <OutboxList />

          <ol className="flex flex-col border-t border-ink">
            {STEPS.map((step, i) => (
              <li key={step.title} className="grid grid-cols-[2.5rem_1fr] items-baseline gap-x-2 border-b py-4">
                <span aria-hidden="true" className="font-display text-3xl leading-none font-semibold">
                  {i + 1}
                </span>
                <div>
                  <h2 className="font-sans text-lg font-semibold">{step.title}</h2>
                  <p className="mt-0.5 max-w-[52ch] text-muted-foreground">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>

          <p className="text-sm text-muted-foreground">Demo build. Use sample charts only, never real patient records.</p>
        </div>

        {/* After the steps on a phone, beside them on a wide screen: the main action always comes first. */}
        <figure className="flex flex-col gap-4 lg:sticky lg:top-6">
          <div className="relative w-full rounded-md border bg-card p-2">
            <div className="relative">
              <Image
                src="/preview-chart.jpg"
                alt="A sample chart with three boxed areas: two outlined in green and one in amber"
                width={W}
                height={H}
                sizes="(min-width: 1024px) 22rem, 90vw"
                className="block h-auto w-full"
                priority
              />
              <Marks marks={SAMPLE_MARKS} />
            </div>
          </div>
          <figcaption className="flex flex-col gap-3">
            <p className="font-display text-xl font-semibold">What you will see</p>
            <ul className="flex flex-col gap-2">
              <li className="flex items-start gap-2">
                <Check aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-verified" />
                <span>Green: both readers agreed. You still confirm it against the photo.</span>
              </li>
              <li className="flex items-start gap-2">
                <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-flag" />
                <span>Amber: the readers differ, so the choice is yours.</span>
              </li>
            </ul>
            <p className="text-sm text-muted-foreground">Sample chart with made-up values.</p>
          </figcaption>
        </figure>
      </div>
    </main>
  );
}

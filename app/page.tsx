import { CaptureForm } from "@/components/capture/capture-form";

export default function Home() {
  return (
    // Same outer width as the header and the results page, so the wordmark and content share one left edge.
    <main className="mx-auto w-full max-w-5xl px-4 pt-6 pb-12 sm:px-6 sm:pt-10">
      <div className="flex max-w-xl flex-col gap-6">
        <div>
          <h1 className="text-4xl leading-[1.05] font-semibold tracking-tight sm:text-5xl">
            Photograph a chart
          </h1>
          <p className="mt-3 text-lg">
            Fit the whole page in the frame. Basa reads it, and a person checks the result before it is confirmed.
          </p>
        </div>

        <CaptureForm />

        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>Lay the chart flat and avoid glare.</li>
          <li>Keep the camera square to the page, with all four corners in view.</li>
          <li>Hold steady until the photo is taken.</li>
        </ul>

        <p className="text-sm text-muted-foreground">
          Demo build. Use sample charts only, never real patient records.
        </p>
      </div>
    </main>
  );
}

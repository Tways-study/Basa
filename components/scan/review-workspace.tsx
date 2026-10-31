"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CircleX, Loader2 } from "lucide-react";
import { z } from "zod";
import { ChartPhoto, type Mark } from "@/components/scan/chart-photo";
import { FieldRow } from "@/components/scan/field-row";
import { SourceCrop } from "@/components/scan/source-crop";
import { useImageSize } from "@/components/scan/use-image-size";
import { Button } from "@/components/ui/button";
import { type ReaderId, type RegionKind, type ScanResult, ReviewsResponseSchema } from "@/lib/schemas";
import { type Choices, confirmAgreed, progressOf } from "@/lib/ui/review-state";

type Region = ScanResult["regions"][number];

const KIND_LABEL: Record<RegionKind, string> = {
  header: "Header",
  table: "Table",
  handwriting: "Handwriting",
  stamp: "Stamp",
  printed: "Printed text",
  signature: "Signature",
};

const ErrorBodySchema = z.object({ error: z.string() });

async function readFailure(res: Response): Promise<string> {
  const parsed = ErrorBodySchema.safeParse(await res.json().catch(() => null));
  return parsed.success ? parsed.data.error : "The server could not save the review. Try again.";
}

type Save = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

export function ReviewWorkspace({
  scan,
  photoUrl,
  onPhotoError,
  onSaved,
  preview = false,
}: {
  scan: ScanResult;
  photoUrl: string | null;
  onPhotoError?: () => void;
  /** Called after a successful save so the page can pick up the new scan status. */
  onSaved?: () => void;
  /** Design preview on sample data: no request is made, and saving only pretends. */
  preview?: boolean;
}) {
  // Reading order: top of the page first. Regions with no fields have nothing to decide.
  const regions = useMemo(
    () => [...scan.regions].sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x),
    [scan.regions],
  );
  const reviewable = regions.filter((r) => r.fields.length > 0);

  const [choices, setChoices] = useState<Record<string, Choices>>({});
  const [save, setSave] = useState<Save>({ kind: "idle" });
  const [loadProblem, setLoadProblem] = useState<string | null>(null);
  const size = useImageSize(photoUrl);
  // What was last stored for each region, so Confirm sends only what changed and a retry after a
  // failure does not repeat regions that already saved.
  const savedSignature = useRef<Record<string, string>>({});

  // A person may come back to a scan they already reviewed: show their earlier decisions.
  useEffect(() => {
    if (preview) return;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/scans/${scan.scanId}/review`, { signal: controller.signal, cache: "no-store" });
        if (!res.ok) throw new Error(`The server answered ${res.status}`);
        const parsed = ReviewsResponseSchema.safeParse(await res.json());
        if (!parsed.success) throw new Error("unexpected reply");
        const next: Record<string, Choices> = {};
        for (const review of parsed.data.reviews) {
          next[review.regionId] = Object.fromEntries(review.fields.map((f) => [f.key, f]));
        }
        // Only fill what is still empty, so a decision made while this loaded is not overwritten.
        setChoices((current) => ({ ...next, ...current }));
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("review load failed:", err instanceof Error ? err.message : "unknown error");
        setLoadProblem("Earlier decisions could not be loaded. You can still review this scan.");
      }
    })();
    return () => controller.abort();
  }, [scan.scanId, preview]);

  // Counted per region, because the same field key (row1.value) appears in more than one region.
  const progress = reviewable
    .map((r) => progressOf(r.fields, choices[r.id] ?? {}))
    .reduce(
      (sum, p) => ({
        total: sum.total + p.total,
        decided: sum.decided + p.decided,
        flaggedLeft: sum.flaggedLeft + p.flaggedLeft,
        agreedLeft: sum.agreedLeft + p.agreedLeft,
        complete: sum.complete && p.complete,
      }),
      { total: 0, decided: 0, flaggedLeft: 0, agreedLeft: 0, complete: reviewable.length > 0 },
    );

  function choose(regionId: string, key: string, choice: Choices[string]) {
    setSave({ kind: "idle" });
    setChoices((current) => ({ ...current, [regionId]: { ...current[regionId], [key]: choice } }));
  }

  function bulkConfirm() {
    setSave({ kind: "idle" });
    setChoices((current) => {
      const next = { ...current };
      for (const r of reviewable) next[r.id] = confirmAgreed(r.fields, current[r.id] ?? {});
      return next;
    });
  }

  async function submit() {
    setSave({ kind: "saving" });
    if (preview) {
      setSave({ kind: "saved" });
      return;
    }
    try {
      for (const r of reviewable) {
        const fields = r.fields.map((f) => choices[r.id]?.[f.key]).filter((c) => c !== undefined);
        const signature = JSON.stringify(fields);
        if (savedSignature.current[r.id] === signature) continue;
        const n = regions.indexOf(r) + 1;
        const res = await fetch(`/api/scans/${scan.scanId}/review`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ regionId: r.id, fields }),
          signal: AbortSignal.timeout(20_000),
        });
        if (!res.ok) {
          // Name the region, so the person knows which part to look at.
          setSave({ kind: "error", message: `Region ${n} (${KIND_LABEL[r.kind]}): ${await readFailure(res)}` });
          return;
        }
        savedSignature.current[r.id] = signature;
      }
      setSave({ kind: "saved" });
      onSaved?.();
    } catch (err) {
      console.error("review save failed:", err instanceof Error ? err.name : "unknown error");
      setSave({
        kind: "error",
        message:
          err instanceof Error && err.name === "TypeError"
            ? "Could not reach the server. Your choices are kept here. Try again when you are online."
            : "Something went wrong saving the review. Try again.",
      });
    }
  }

  const marks: Mark[] = regions.map((r, i) => {
    const mine = choices[r.id] ?? {};
    // Green means the readers matched (and the person confirmed it). A flagged field the person settled
    // is no longer amber, but it is not green either: the readers did not agree on it.
    const flaggedOpen = r.fields.some((f) => f.status === "flagged" && !mine[f.key]);
    const allAgreedAndConfirmed = r.fields.length > 0 && r.fields.every((f) => f.status === "agreed" && mine[f.key]);
    const tone: Mark["tone"] = flaggedOpen ? "flag" : allAgreedAndConfirmed ? "verified" : "ink";
    return { n: i + 1, box: r.bbox, tone };
  });

  const pct = progress.total === 0 ? 0 : Math.round((progress.decided / progress.total) * 100);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      {photoUrl ? (
        <ChartPhoto url={photoUrl} onError={onPhotoError ?? (() => {})} marks={marks} />
      ) : (
        <p className="rounded-md border bg-muted p-3 text-muted-foreground">The photo could not be loaded.</p>
      )}

      <div className="flex flex-col gap-6">
        <div className="sticky top-0 z-10 -mx-1 flex flex-col gap-2 border-b bg-background px-1 py-3">
          <p role="status" aria-live="polite" className="font-medium">
            {progress.decided} of {progress.total} fields decided
            {progress.flaggedLeft > 0 ? `. ${progress.flaggedLeft} still need you.` : "."}
          </p>
          <div aria-hidden="true" className="h-1.5 w-full rounded-md bg-line">
            <div className="h-full rounded-md bg-ink transition-[width] duration-200" style={{ width: `${pct}%` }} />
          </div>
          {progress.agreedLeft > 0 ? (
            <div className="flex flex-col items-start gap-1">
              <Button variant="outline" onClick={bulkConfirm}>
                <Check aria-hidden="true" />
                Confirm {progress.agreedLeft} matching {progress.agreedLeft === 1 ? "field" : "fields"}
              </Button>
              <p className="text-sm text-muted-foreground">
                Matching means the two readers agreed, not that the value is right. Check the crop first.
              </p>
            </div>
          ) : null}
        </div>

        {loadProblem ? <p role="status" className="text-sm">{loadProblem}</p> : null}

        {regions.map((region, i) => (
          <RegionReview
            key={region.id}
            region={region}
            n={i + 1}
            photoUrl={photoUrl}
            size={size}
            choices={choices[region.id] ?? {}}
            onChoose={(key, choice) => choose(region.id, key, choice)}
          />
        ))}

        {regions.length === 0 ? <p className="border-t pt-4 text-muted-foreground">No regions were found on this page.</p> : null}

        <div className="flex flex-col items-start gap-3 border-t pt-4">
          <Button size="lg" onClick={submit} disabled={!progress.complete || save.kind === "saving"}>
            {save.kind === "saving" ? (
              <Loader2 aria-hidden="true" className="motion-safe:animate-spin" />
            ) : (
              <Check aria-hidden="true" />
            )}
            {save.kind === "saving" ? "Saving" : "Confirm record"}
          </Button>
          {!progress.complete && progress.total > 0 ? (
            <p className="text-sm text-muted-foreground">Decide every field to confirm the record.</p>
          ) : null}
          {save.kind === "saved" ? (
            <p role="status" className="flex items-start gap-2">
              <Check aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-verified" />
              The record is confirmed and saved. You can still change a field and confirm again.
            </p>
          ) : null}
          {save.kind === "error" ? (
            <p role="alert" className="flex items-start gap-2 rounded-md border border-stamp p-3">
              <CircleX aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-stamp" />
              <span>{save.message}</span>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function RegionReview({
  region,
  n,
  photoUrl,
  size,
  choices,
  onChoose,
}: {
  region: Region;
  n: number;
  photoUrl: string | null;
  size: ReturnType<typeof useImageSize>;
  choices: Choices;
  onChoose: (key: string, choice: Choices[string]) => void;
}) {
  const headingId = `review-region-${region.id}`;
  const failed = region.readings.filter((r) => r.error);
  const failedReaders: ReaderId[] = failed.map((r) => r.model);

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 border-t pt-4">
      <h2 id={headingId} className="text-2xl font-semibold">
        {n}. {KIND_LABEL[region.kind]}
      </h2>

      <SourceCrop
        url={photoUrl}
        box={region.bbox}
        size={size}
        label={`Crop of region ${n}, the area the readers saw`}
      />

      {failed.map((r) => (
        <div key={r.model} role="alert" className="flex items-start gap-2 rounded-md border border-stamp p-3">
          <CircleX aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-stamp" />
          <div className="flex flex-col gap-1">
            <p>
              <span className="font-medium">{r.model === "muse_spark" ? "Muse Spark" : "Muse Spark Open"} failed on this region.</span>{" "}
              {region.fields.length === 0
                ? "There is nothing to decide here, and the scan cannot be completed until this region is read again."
                : "Every field below needs your choice."}
            </p>
            <p className="font-mono text-sm break-words text-muted-foreground">{r.error}</p>
          </div>
        </div>
      ))}

      {region.fields.length === 0 ? (
        <p className="text-muted-foreground">
          {region.readings.length === 0 ? "Waiting to be read." : "Neither reader found anything in this region."}
        </p>
      ) : (
        region.fields.map((field) => (
          <FieldRow
            key={field.key}
            field={field}
            name={`${region.id}:${field.key}`}
            failedReaders={failedReaders}
            choice={choices[field.key]}
            onChoose={(choice) => onChoose(field.key, choice)}
          />
        ))
      )}
    </section>
  );
}

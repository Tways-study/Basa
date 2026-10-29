import { CircleX } from "lucide-react";
import type { ReaderId, RegionKind, ScanResult } from "@/lib/schemas";
import { type FieldValue, groupFields } from "@/lib/ui/scan-fields";

type Region = ScanResult["regions"][number];
type Reading = Region["readings"][number];

const KIND_LABEL: Record<RegionKind, string> = {
  header: "Header",
  table: "Table",
  handwriting: "Handwriting",
  stamp: "Stamp",
  printed: "Printed text",
  signature: "Signature",
};

const READER_LABEL: Record<ReaderId, string> = {
  muse_spark: "Muse Spark",
  muse_spark_open: "Muse Spark Open",
};

// An unreadable value gets an icon and a word as well as red, so it never relies on color.
function Value({ value }: { value: FieldValue }) {
  if (!value.unreadable) return <span className="break-words">{value.text}</span>;
  return (
    <span className="inline-flex items-center gap-1.5 font-medium text-stamp">
      <CircleX aria-hidden="true" className="size-4 shrink-0" />
      {value.text}
    </span>
  );
}

function Fields({ reading, kind }: { reading: Reading; kind: RegionKind }) {
  const { rows, items } = groupFields(reading.fields);

  if (rows.length === 0 && items.length === 0) {
    return <p className="text-muted-foreground">Nothing was read in this region.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse font-mono text-sm sm:text-base">
            <caption className="sr-only">{KIND_LABEL[kind]} rows as read</caption>
            <thead>
              <tr className="border-b text-left font-sans text-sm text-muted-foreground">
                <th scope="col" className="py-2 pr-4 font-medium">Test</th>
                <th scope="col" className="py-2 pr-4 font-medium">Value</th>
                <th scope="col" className="py-2 font-medium">Unit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.n} className="border-b last:border-b-0">
                  <td className="py-2 pr-4 align-top"><Value value={row.test} /></td>
                  <td className="py-2 pr-4 align-top"><Value value={row.value} /></td>
                  <td className="py-2 align-top"><Value value={row.unit} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {items.length > 0 ? (
        <dl className="flex flex-col gap-3">
          {items.map((item) => (
            <div key={item.key} className="grid gap-0.5 sm:grid-cols-[13rem_1fr] sm:gap-4">
              <dt className="font-mono text-sm text-muted-foreground">{item.key}</dt>
              <dd className="font-mono">
                <Value value={item.value} />
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

export function RegionBlock({ region }: { region: Region }) {
  const headingId = `region-${region.id}`;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 border-t pt-4">
      <h2 id={headingId} className="text-2xl font-semibold">
        {KIND_LABEL[region.kind]}
      </h2>

      {region.readings.length === 0 ? (
        <p className="text-muted-foreground">Waiting to be read.</p>
      ) : (
        region.readings.map((reading) => (
          <div key={reading.model} className="flex flex-col gap-3">
            {reading.error ? (
              <div role="alert" className="flex items-start gap-2 rounded-md border border-stamp p-3">
                <CircleX aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-stamp" />
                <div className="flex flex-col gap-1">
                  <p>
                    <span className="font-medium">This region could not be read.</span> A person will need to
                    check it on the photo.
                  </p>
                  {/* The adapter's own message: kept for whoever is fixing the pipeline, not the main text. */}
                  <p className="font-mono text-sm break-words text-muted-foreground">{reading.error}</p>
                </div>
              </div>
            ) : (
              <Fields reading={reading} kind={region.kind} />
            )}
            <p className="text-sm text-muted-foreground">
              Read by {READER_LABEL[reading.model]} in {(reading.latencyMs / 1000).toFixed(1)} s
            </p>
          </div>
        ))
      )}
    </section>
  );
}

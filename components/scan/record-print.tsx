import type { PrintSection } from "@/lib/ui/print-record";

const KIND_LABEL: Record<PrintSection["kind"], string> = {
  header: "Header",
  table: "Table",
  handwriting: "Handwriting",
  stamp: "Stamp",
  printed: "Printed text",
  signature: "Signature",
};

/**
 * The patient copy. Hidden on screen and the only thing shown when printing (the review screen is print:hidden).
 * It holds confirmed answers only, restated as written on the source, with no summary or interpretation.
 */
export function RecordPrint({
  sections,
  scanId,
  confirmedOn,
}: {
  sections: PrintSection[];
  scanId: string;
  /** Already formatted, or null when the stored time is not known. */
  confirmedOn: string | null;
}) {
  return (
    <article className="hidden text-black print:block" aria-hidden="true">
      <h1 className="text-3xl font-semibold">Copy of a chart record</h1>
      <p className="mt-1 text-sm">
        Reference {scanId.slice(0, 8)}
        {confirmedOn ? ` · Confirmed on ${confirmedOn}` : ""}
      </p>

      {sections.map((s) => (
        <section key={s.n} className="mt-5 break-inside-avoid border-t border-black pt-3">
          <h2 className="text-xl font-semibold">
            {s.n}. {KIND_LABEL[s.kind]}
          </h2>

          {s.rows.length > 0 ? (
            <table className="mt-2 w-full border-collapse font-mono text-sm">
              <thead>
                <tr className="border-b border-black text-left font-sans">
                  <th className="py-1 pr-3 font-semibold">Test</th>
                  <th className="py-1 pr-3 font-semibold">Value</th>
                  <th className="py-1 font-semibold">Unit</th>
                </tr>
              </thead>
              <tbody>
                {s.rows.map((r) => (
                  <tr key={r.n} className="border-b border-black/30">
                    <td className="py-1 pr-3 align-top">{r.test}</td>
                    <td className="py-1 pr-3 align-top">{r.value}</td>
                    <td className="py-1 align-top">{r.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}

          {s.items.length > 0 ? (
            <dl className="mt-2 grid grid-cols-[10rem_1fr] gap-x-4 gap-y-1 text-sm">
              {s.items.map((i) => (
                <div key={i.label} className="contents">
                  <dt className="font-semibold">{i.label}</dt>
                  <dd className="font-mono break-words">{i.text}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </section>
      ))}

      <p className="mt-8 border-t border-black pt-3 text-sm">Reviewed by: ______________________________</p>
      <p className="mt-4 text-xs">
        This is a copy of a paper chart that was photographed, read by software and checked field by field by a
        person. Values are restated as written on the source; a value that could not be read says so. It is not
        medical advice and does not replace the original chart.
      </p>
    </article>
  );
}

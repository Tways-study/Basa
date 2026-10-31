"use client";

import { useState } from "react";
import { Check, CircleX, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { FlagReason, ReaderId, ReconciledField } from "@/lib/schemas";
import { type Choice, labelForKey, optionsFor } from "@/lib/ui/review-state";

const READERS: { id: ReaderId; label: string }[] = [
  { id: "muse_spark", label: "Muse Spark" },
  { id: "muse_spark_open", label: "Muse Spark Open" },
];

const REASON: Record<FlagReason, string> = {
  mismatch: "The readers disagree",
  one_unreadable: "One reader could not read this",
  both_unreadable: "Neither reader could read this",
  one_reader_only: "Only one reader found this row",
};

const OPTION_BOX =
  "flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 has-[:checked]:border-ink has-[:checked]:bg-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring";

export function FieldRow({
  field,
  name,
  failedReaders,
  choice,
  onChoose,
}: {
  field: ReconciledField;
  /** Unique per region and key, so the radio groups on one page do not merge. */
  name: string;
  /** Readers whose call for this region failed, so a blank is shown as a failure and not as "found nothing". */
  failedReaders: ReaderId[];
  choice: Choice | undefined;
  onChoose: (choice: Choice | undefined) => void;
}) {
  const [editing, setEditing] = useState(choice?.source === "edited");
  const [draft, setDraft] = useState(choice?.source === "edited" ? (choice.value ?? "") : "");
  const label = labelForKey(field.key);
  const options = optionsFor(field);
  const picked = editing ? "edited" : choice?.source;

  function pick(source: string, value: string | null) {
    setEditing(false);
    onChoose({ key: field.key, source, value } as Choice);
  }

  return (
    <fieldset className="flex flex-col gap-2 rounded-md border p-3">
      <legend className="flex flex-wrap items-center gap-2 px-1 font-medium">
        {label}
        {field.status === "agreed" ? (
          <Badge variant="verified">
            <Check aria-hidden="true" />
            Readers matched
          </Badge>
        ) : (
          <Badge variant="flag">
            <TriangleAlert aria-hidden="true" />
            Needs you
          </Badge>
        )}
      </legend>

      {field.status === "flagged" ? <p className="text-sm">{REASON[field.reason]}. Check the crop, then choose.</p> : null}

      {/* A flagged field lists each reader. One that produced nothing cannot be picked, but it is still shown, and a failed call says so. */}
      {field.status === "flagged"
        ? READERS.filter((r) => !options.some((o) => o.id === r.id)).map((r) => (
            <p key={r.id} className="flex items-center gap-2 text-sm">
              <CircleX aria-hidden="true" className="size-4 shrink-0 text-stamp" />
              <span>
                {r.label}: {failedReaders.includes(r.id) ? "failed to read this region" : "found nothing readable here"}
              </span>
            </p>
          ))
        : null}

      <div role="radiogroup" aria-label={`Answer for ${label}`} className="flex flex-col gap-2">
        {options.map((o) => (
          <label key={o.id} className={OPTION_BOX}>
            <input
              type="radio"
              name={name}
              className="size-5 shrink-0 accent-ink"
              checked={picked === o.source}
              onChange={() => {
                if (o.source === "edited") {
                  setEditing(true);
                  const text = draft.trim();
                  onChoose(text ? { key: field.key, source: "edited", value: text } : undefined);
                } else if (o.source === "unreadable") {
                  pick("unreadable", null);
                } else {
                  pick(o.source, o.value);
                }
              }}
            />
            <span className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-sm text-muted-foreground">{o.label}</span>
              {"value" in o ? <span className="font-mono text-base break-words">{o.value}</span> : null}
            </span>
          </label>
        ))}
      </div>

      {editing ? (
        <input
          type="text"
          aria-label={`Value for ${label}`}
          className="min-h-11 rounded-md border bg-card px-3 font-mono text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={draft}
          maxLength={500}
          onChange={(e) => {
            setDraft(e.target.value);
            const text = e.target.value.trim();
            onChoose(text ? { key: field.key, source: "edited", value: text } : undefined);
          }}
          autoFocus
        />
      ) : null}
    </fieldset>
  );
}

import type { GroupTotals, Results, RunSummary } from "./types";

// Renders docs/eval-results.md from eval/results.json. Pure, so it is tested and never hand-edited.

const pct = (n: number, d: number) => (d === 0 ? "n/a" : `${((100 * n) / d).toFixed(1)}% (${n}/${d})`);

function accuracyTable(t: GroupTotals): string {
  const row = (name: string, right: string, rows: string, halluc: number, left: string) =>
    `| ${name} | ${right} | ${rows} | ${halluc} | ${left} |`;
  return [
    "| Condition | Fields right with no person involved | Table row recall | Hallucinated rows | Wrong values left in the record |",
    "|---|---|---|---|---|",
    row("A. Whole-image read", pct(t.a.correct, t.a.fields), pct(t.a.rowsRecalled, t.a.rows), t.a.hallucinatedRows, pct(t.a.fields - t.a.correct, t.a.fields)),
    row("B. SAM regions, one reader", pct(t.b.correct, t.b.fields), pct(t.b.rowsRecalled, t.b.rows), t.b.hallucinatedRows, pct(t.b.fields - t.b.correct, t.b.fields)),
    row(
      "C. Basa (two readers, reconcile)",
      pct(t.c.agreedCorrect, t.c.fields),
      pct(t.c.rowsRecalled, t.c.rows),
      t.c.hallucinatedRows,
      pct(t.c.agreedButWrong + t.c.missedByBoth, t.c.fields),
    ),
  ].join("\n");
}

function catchTable(t: GroupTotals): string {
  const c = t.c;
  return [
    "| Measure for condition C | Result |",
    "|---|---|",
    `| **Error catch rate** (Muse Spark's wrong fields that C flagged) | ${pct(c.caught, c.sparkWrong)} |`,
    `| Review burden (Muse Spark's right fields that C flagged anyway) | ${pct(c.falseFlags, c.sparkCorrect)} |`,
    `| Fields flagged for a person | ${pct(c.flagged, c.fields)} |`,
    `| **Agreed but wrong** (both readers matched on a wrong value) | ${pct(c.agreedButWrong, c.fields)} |`,
    `| Missed by both readers (nothing returned, nothing flagged) | ${pct(c.missedByBoth, c.fields)} |`,
    `| Muse Spark field accuracy | ${pct(c.sparkCorrect, c.fields)} |`,
    `| Muse Spark Open field accuracy | ${pct(c.openCorrect, c.fields)} |`,
  ].join("\n");
}

function verdict(run: RunSummary): string {
  const t = run.totals.all;
  const aLeft = t.a.fields - t.a.correct;
  const cLeft = t.c.agreedButWrong + t.c.missedByBoth;
  if (t.a.fields === 0 || t.c.fields === 0) return "No fields were scored.";
  const aRate = aLeft / t.a.fields;
  const cRate = cLeft / t.c.fields;
  const compare = cRate < aRate ? "lower than" : cRate > aRate ? "higher than" : "the same as";
  const caveat = run.split === "dev" ? " This is the dev set, used for tuning, so it is not the headline." : "";
  return `Wrong values left in the record after a person settles every flagged field: C ${pct(cLeft, t.c.fields)}, which is ${compare} A at ${pct(aLeft, t.a.fields)}.${caveat}`;
}

function section(title: string, run: RunSummary): string {
  const lines = [
    `## ${title}`,
    "",
    `Run on ${run.generatedAt}. ${run.totals.all.charts} charts (${run.totals.hard.charts} hard), ${run.totals.all.c.fields} fields, ${run.totals.all.calls} model calls. ` +
      `Read margin ${run.margin}. Models: Muse Spark \`${run.models.spark}\`, Muse Spark Open \`${run.models.open}\`, SAM \`${run.models.sam}\`.`,
    "",
    verdict(run),
    "",
    "### All charts",
    "",
    accuracyTable(run.totals.all),
    "",
    catchTable(run.totals.all),
  ];
  for (const [label, group] of [["Hard charts", run.totals.hard], ["Other charts", run.totals.easy]] as const) {
    if (group.charts === 0) continue;
    lines.push("", `### ${label} (${group.charts})`, "", accuracyTable(group), "", catchTable(group));
  }

  const silent = run.charts.flatMap((ch) =>
    ch.examples
      .filter((e) => (e.status === "agreed" && e.agreedCorrect === false) || e.status === "absent")
      .map((e) => `- \`${ch.id}\` \`${e.key}\`: truth ${JSON.stringify(e.truth)}, ${e.status === "absent" ? "neither reader returned it" : `readers agreed on ${JSON.stringify(e.spark)}`}`),
  );
  lines.push("", "### Agreed but wrong, and fields nobody returned", "");
  lines.push(silent.length ? silent.slice(0, 30).join("\n") : "None in this run.");
  const errored = run.charts.filter((ch) => ch.errors.length > 0);
  if (errored.length) {
    lines.push("", "### Calls that failed", "", "A failed reader call leaves a region with one reader, so condition C flags every field in it. Those flags count toward review burden and make it look higher than the readers' real disagreement rate.", "", ...errored.map((ch) => `- \`${ch.id}\`: ${ch.errors.length} error(s), first: ${ch.errors[0]}`));
  }
  return lines.join("\n");
}

export function renderReport(results: Results): string {
  const parts = [
    "# Eval results",
    "",
    "Written by `pnpm eval`; do not edit by hand. The prompt tuning log is in `docs/eval-tuning.md`. Every chart is synthetic: no real patient data and no real clinic photos, apart from the phone photo run described in the README when it exists.",
    "",
    "## What the numbers mean",
    "",
    "- **A** reads the whole chart once with Muse Spark. **B** finds regions (Muse Spark proposes boxes, SAM tightens them) and reads each with Muse Spark only. **C** is Basa: the same regions, read by Muse Spark and Muse Spark Open, then reconciled. B and C share one segmentation per chart.",
    "- A value is right when it matches the typed ground truth after the same normalization reconcile uses (case, spacing, number format, unit spelling).",
    "- **Fields right with no person involved:** A and B, fields that are correct. C, fields both readers agreed on that are correct. C flags the rest for a person.",
    "- **Wrong values left in the record:** what remains wrong if a person settles every flagged field correctly. For A and B that is every error. For C it is the agreed-but-wrong fields plus fields neither reader returned.",
    "- **Table row recall:** rows where every field is right (A, B) or agreed-and-right or flagged (C).",
    "- **Error catch rate** is the share of Muse Spark's wrong fields that C flagged. **Agreed but wrong** is the failure reconcile cannot catch: both readers matched on a wrong value.",
    "- Small samples: read the counts in brackets, not only the percentages.",
    "",
  ];
  if (results.test) parts.push(section(results.test.final ? "Held-out set (final)" : "Held-out set", results.test), "");
  else parts.push("## Held-out set", "", "Not run yet. It is run once, with `pnpm eval --split=test --final`, after prompts are frozen.", "");
  if (results.dev) parts.push(section("Dev set", results.dev), "");
  return parts.join("\n").trimEnd() + "\n";
}

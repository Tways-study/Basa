import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { getBasetenEnv, getMetaEnv, getPipelineEnv, getSamEnv } from "@/lib/env";
import { getModelAdapters } from "@/lib/models";
import { createMockAdapters } from "@/lib/models/mock";
import type { ModelAdapters, SegmentedRegion } from "@/lib/models/types";
import { READ_MARGIN, growBBox } from "@/lib/pipeline/bbox";
import { CallBudget } from "@/lib/pipeline/budget";
import { cropRegion, normalizeImage } from "@/lib/pipeline/crop";
import { reconcile } from "@/lib/pipeline/reconcile";
import type { ReaderId, ReadingFields } from "@/lib/schemas";
import { renderReport } from "./report";
import {
  addCounts,
  emptyReadCounts,
  emptyReviewCounts,
  scoreReading,
  scoreReview,
  truthFrom,
} from "./score";
import type { ChartRaw, ChartSummary, Example, GroupTotals, Results, RunSummary, Split } from "./types";
import { readWholeImage, type WholeImageResult } from "./whole-image";

// pnpm eval --split=dev                 run the dev charts (the default)
// pnpm eval --split=test --final        the held-out run: once, after prompts are frozen
// Other flags: --ids=a,b  --limit=N  --margin=0.2  --mock  --redo-final
// Run with MOCK_MODELS=false: a latency of 0 ms means you got the mock, and the harness stops.

const ROOT = process.cwd();
const CONCURRENCY = 4;
const MAX_EXAMPLES = 40;

const ManifestSchema = z.object({
  charts: z
    .array(
      z.object({
        id: z.string().min(1),
        file: z.string().min(1),
        split: z.enum(["dev", "test"]),
        hard: z.boolean(),
        /** Ground-truth JSON; defaults to the image path with .json. */
        truth: z.string().optional(),
      }),
    )
    .min(1),
});
type ManifestChart = z.infer<typeof ManifestSchema>["charts"][number];

function parseArgs(argv: string[]) {
  const flags = new Set<string>();
  const values = new Map<string, string>();
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [key, value] = arg.slice(2).split("=");
    if (value === undefined) flags.add(key);
    else values.set(key, value);
  }
  return { flags, values };
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function pool<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function lane() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return results;
}

/** The chart-level view of one reader: its regions' fields side by side. A key already read keeps its first non-null value. */
function merge(readings: { model: string; fields: ReadingFields }[], model: ReaderId): ReadingFields {
  const out: ReadingFields = {};
  for (const r of readings) {
    if (r.model !== model) continue;
    for (const [key, value] of Object.entries(r.fields)) {
      if (!(key in out) || out[key] === null) out[key] = value;
    }
  }
  return out;
}

const message = (err: unknown) => (err instanceof Error ? err.message : "failed");

interface ChartOutcome {
  summary: ChartSummary;
  raw: ChartRaw;
  sawRealLatency: boolean;
}

async function runChart(entry: ManifestChart, opts: { mock: boolean; margin: number; maxCalls: number }): Promise<ChartOutcome> {
  const image = await normalizeImage(new Uint8Array(await readFile(path.join(ROOT, entry.file))));
  const truthPath = entry.truth ?? entry.file.replace(/\.[^.]+$/, ".json");
  const truth = truthFrom(JSON.parse(await readFile(path.join(ROOT, truthPath), "utf8")) as Record<string, unknown>);

  const budget = new CallBudget(opts.maxCalls);
  const onRequest = () => budget.take();
  const adapters: ModelAdapters = opts.mock ? createMockAdapters() : getModelAdapters({ onRequest });
  const errors: string[] = [];

  // Condition A: one read of the whole chart.
  let whole: WholeImageResult = { fields: {}, latencyMs: 0, error: null };
  if (!opts.mock) {
    try {
      whole = await readWholeImage(image, { onRequest });
    } catch (err) {
      whole = { fields: {}, latencyMs: 0, error: message(err) };
    }
    if (whole.error) errors.push(`whole image: ${whole.error}`);
  }

  // Regions, then both readers on the same crops the pipeline uses. B and C share this one run.
  let regions: SegmentedRegion[] = [];
  try {
    regions = await adapters.segmenter.segment(image);
  } catch (err) {
    errors.push(`segmentation: ${message(err)}`);
  }
  const crops = await Promise.all(regions.map((r) => cropRegion(image, growBBox(r.bbox, opts.margin, opts.margin))));

  const tasks = regions.flatMap((region, i) => adapters.readers.map((reader) => ({ region, i, reader })));
  const readings = await pool(tasks, CONCURRENCY, async ({ region, i, reader }) => {
    try {
      const r = await reader.readRegion({ regionId: `${entry.id}:${i}`, kind: region.kind, image: crops[i] });
      if (r.error) errors.push(`${region.kind} ${reader.id}: ${r.error}`);
      return { kind: region.kind, model: reader.id, fields: r.fields, latencyMs: r.latencyMs, error: r.error };
    } catch (err) {
      errors.push(`${region.kind} ${reader.id}: ${message(err)}`);
      return { kind: region.kind, model: reader.id, fields: {}, latencyMs: 0, error: message(err) };
    }
  });

  const spark = merge(readings, "muse_spark");
  const open = merge(readings, "muse_spark_open");
  const reconciled = reconcile(spark, open);

  const a = scoreReading(truth, whole.fields).counts;
  const b = scoreReading(truth, spark).counts;
  const c = scoreReview(truth, spark, open, reconciled);

  const examples: Example[] = c.outcomes
    .filter((o) => !o.sparkCorrect || !o.openCorrect || o.status === "flagged")
    .slice(0, MAX_EXAMPLES)
    .map((o) => ({
      key: o.key,
      truth: o.truth,
      spark: spark[o.key],
      open: open[o.key],
      status: o.status,
      agreedCorrect: o.agreedCorrect,
    }));

  return {
    summary: { id: entry.id, hard: entry.hard, calls: budget.calls, errors, a, b, c: c.counts, examples },
    raw: {
      id: entry.id,
      regions: regions.map((r) => ({ kind: r.kind, bbox: r.bbox })),
      whole: { fields: whole.fields, latencyMs: whole.latencyMs, error: whole.error },
      readings,
    },
    sawRealLatency: whole.latencyMs > 0 || readings.some((r) => r.latencyMs > 0),
  };
}

function totalsOf(charts: ChartSummary[]): GroupTotals {
  return charts.reduce<GroupTotals>(
    (t, ch) => ({
      charts: t.charts + 1,
      calls: t.calls + ch.calls,
      a: addCounts(t.a, ch.a),
      b: addCounts(t.b, ch.b),
      c: addCounts(t.c, ch.c),
    }),
    { charts: 0, calls: 0, a: emptyReadCounts(), b: emptyReadCounts(), c: emptyReviewCounts() },
  );
}

async function loadResults(file: string): Promise<Results> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as Results;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { schema: 1 };
    throw err;
  }
}

async function main() {
  const { flags, values } = parseArgs(process.argv.slice(2));
  const mock = flags.has("mock");
  const split = (values.get("split") ?? "dev") as Split;
  if (split !== "dev" && split !== "test") fail("--split must be dev or test");
  const margin = values.has("margin") ? Number(values.get("margin")) : READ_MARGIN;
  if (!Number.isFinite(margin) || margin < 0 || margin > 1) fail("--margin must be a number from 0 to 1");

  // The mock returns the same fake chart for every image, so scoring it against the truth means nothing.
  if (process.env.MOCK_MODELS === "true" && !mock) {
    fail("MOCK_MODELS is true, so these would be fake readings. Set MOCK_MODELS=false in .env.local (the value must be exactly false), or pass --mock to test the harness itself.");
  }
  const resultsFile = path.join(ROOT, "eval/results.json");
  const results = await loadResults(resultsFile);
  if (split === "test" && !mock) {
    if (!flags.has("final")) fail("The held-out set is run once, after prompts are frozen. Add --final to run it.");
    if (results.test?.final && !flags.has("redo-final")) {
      fail(`The held-out run was already made on ${results.test.generatedAt}. Re-running it spends the held-out set; add --redo-final only if you mean it.`);
    }
  }

  let models = { spark: "mock", open: "mock", sam: "mock" };
  let maxCalls = 1000;
  if (!mock) {
    try {
      models = { spark: getMetaEnv().META_SPARK_MODEL, open: getBasetenEnv().BASETEN_MODEL, sam: getSamEnv().META_SAM_MODEL };
      maxCalls = getPipelineEnv().MAX_MODEL_CALLS_PER_SCAN;
    } catch (err) {
      fail(message(err)); // names the missing variables, never their values
    }
  }

  const manifest = ManifestSchema.parse(JSON.parse(await readFile(path.join(ROOT, "eval/manifest.json"), "utf8")));
  const ids = new Set(manifest.charts.map((c) => c.id));
  if (ids.size !== manifest.charts.length) fail("eval/manifest.json has a duplicate chart id");
  let charts = manifest.charts.filter((c) => c.split === split);
  if (values.has("ids")) {
    const wanted = new Set(values.get("ids")!.split(","));
    charts = charts.filter((c) => wanted.has(c.id));
  }
  if (values.has("limit")) charts = charts.slice(0, Number(values.get("limit")));
  if (charts.length === 0) fail(`No charts to run in the ${split} split.`);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = path.join(ROOT, "eval/runs", `${mock ? "mock-" : ""}${split}-${stamp}`);
  await mkdir(runDir, { recursive: true });
  console.log(`${mock ? "MOCK " : ""}${split} split: ${charts.length} chart(s), margin ${margin}, call cap ${maxCalls} per chart`);

  const summaries: ChartSummary[] = [];
  for (const entry of charts) {
    const out = await runChart(entry, { mock, margin, maxCalls });
    if (!mock && !out.sawRealLatency) fail(`${entry.id}: every latency is 0 ms, so this looks like the mock. Stopping.`);
    summaries.push(out.summary);
    await writeFile(path.join(runDir, `${entry.id}.json`), JSON.stringify(out.raw, null, 2));
    const s = out.summary;
    console.log(
      `${entry.id}: A ${s.a.correct}/${s.a.fields}  B ${s.b.correct}/${s.b.fields}  C flagged ${s.c.flagged}, ` +
        `agreed-but-wrong ${s.c.agreedButWrong}, missed ${s.c.missedByBoth}  (${s.calls} calls${s.errors.length ? `, ${s.errors.length} error(s)` : ""})`,
    );
    for (const e of s.errors) console.log(`  ! ${e}`);
  }

  const summary: RunSummary = {
    generatedAt: new Date().toISOString(),
    split,
    margin,
    final: split === "test" && flags.has("final"),
    models,
    totals: {
      all: totalsOf(summaries),
      hard: totalsOf(summaries.filter((s) => s.hard)),
      easy: totalsOf(summaries.filter((s) => !s.hard)),
    },
    charts: summaries,
  };

  if (mock) {
    console.log(`Mock run: nothing written to eval/results.json or docs/eval-results.md. Raw files are in ${path.relative(ROOT, runDir)}.`);
    return;
  }
  if (values.has("ids") || values.has("limit")) {
    console.log(`Partial run (--ids or --limit): eval/results.json and docs/eval-results.md were not changed. Raw files are in ${path.relative(ROOT, runDir)}.`);
    return;
  }
  results[split] = summary;
  await writeFile(resultsFile, JSON.stringify(results, null, 2) + "\n");
  await writeFile(path.join(ROOT, "docs/eval-results.md"), renderReport(results));
  console.log(`Wrote eval/results.json and docs/eval-results.md. Raw model outputs: ${path.relative(ROOT, runDir)} (not committed).`);
}

main().catch((err) => fail(message(err)));

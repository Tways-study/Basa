import type { RawValue, ReadingFields } from "@/lib/schemas";
import type { ReadCounts, ReviewCounts } from "./score";

export type Split = "dev" | "test";

/** One field worth looking at: a reader got it wrong, or C flagged it. */
export interface Example {
  key: string;
  truth: RawValue;
  spark: RawValue | undefined;
  open: RawValue | undefined;
  status: "agreed" | "flagged" | "absent";
  /** For an agreed field: was the agreed value right. */
  agreedCorrect: boolean | null;
}

export interface ChartSummary {
  id: string;
  hard: boolean;
  calls: number;
  errors: string[];
  a: ReadCounts;
  b: ReadCounts;
  c: ReviewCounts;
  examples: Example[];
}

export interface GroupTotals {
  charts: number;
  calls: number;
  a: ReadCounts;
  b: ReadCounts;
  c: ReviewCounts;
}

export interface RunSummary {
  generatedAt: string;
  split: Split;
  /** The read margin the readers saw, as a fraction of the box size. */
  margin: number;
  /** True only for the one held-out run made with --final. */
  final: boolean;
  models: { spark: string; open: string; sam: string };
  totals: { all: GroupTotals; hard: GroupTotals; easy: GroupTotals };
  charts: ChartSummary[];
}

export interface Results {
  schema: 1;
  dev?: RunSummary;
  test?: RunSummary;
}

/** What is written per chart under eval/runs/: everything the models said, for provenance. */
export interface ChartRaw {
  id: string;
  regions: { kind: string; bbox: { x: number; y: number; w: number; h: number } }[];
  whole: { fields: ReadingFields; latencyMs: number; error: string | null };
  readings: { kind: string; model: string; fields: ReadingFields; latencyMs: number; error: string | null }[];
}

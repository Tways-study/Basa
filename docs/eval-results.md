# Eval results

Written by `pnpm eval`; do not edit by hand. Every chart is synthetic: no real patient data and no real clinic photos, apart from the phone photo run described in the README when it exists.

## What the numbers mean

- **A** reads the whole chart once with Muse Spark. **B** finds regions (Muse Spark proposes boxes, SAM tightens them) and reads each with Muse Spark only. **C** is Basa: the same regions, read by Muse Spark and Muse Spark Open, then reconciled. B and C share one segmentation per chart.
- A value is right when it matches the typed ground truth after the same normalization reconcile uses (case, spacing, number format, unit spelling).
- **Fields right with no person involved:** A and B, fields that are correct. C, fields both readers agreed on that are correct. C flags the rest for a person.
- **Wrong values left in the record:** what remains wrong if a person settles every flagged field correctly. For A and B that is every error. For C it is the agreed-but-wrong fields plus fields neither reader returned.
- **Table row recall:** rows where every field is right (A, B) or agreed-and-right or flagged (C).
- **Error catch rate** is the share of Muse Spark's wrong fields that C flagged. **Agreed but wrong** is the failure reconcile cannot catch: both readers matched on a wrong value.
- Small samples: read the counts in brackets, not only the percentages.

## Held-out set

Not run yet. It is run once, with `pnpm eval --split=test --final`, after prompts are frozen.

## Dev set

Run on 2026-10-31T10:33:51.790Z. 3 charts (1 hard), 63 fields, 39 model calls. Read margin 0.2. Models: Muse Spark `muse-spark-1.3`, Muse Spark Open `meta-models/muse-spark-open`, SAM `sam-3.1`.

Wrong values left in the record after a person settles every flagged field: C 0.0% (0/63), which is the same as A at 0.0% (0/63). This is the dev set, used for tuning, so it is not the headline.

### All charts

| Condition | Fields right with no person involved | Table row recall | Hallucinated rows | Wrong values left in the record |
|---|---|---|---|---|
| A. Whole-image read | 100.0% (63/63) | 100.0% (13/13) | 0 | 0.0% (0/63) |
| B. SAM regions, one reader | 100.0% (63/63) | 100.0% (13/13) | 0 | 0.0% (0/63) |
| C. Basa (two readers, reconcile) | 73.0% (46/63) | 100.0% (13/13) | 0 | 0.0% (0/63) |

| Measure for condition C | Result |
|---|---|
| **Error catch rate** (Muse Spark's wrong fields that C flagged) | n/a |
| Review burden (Muse Spark's right fields that C flagged anyway) | 27.0% (17/63) |
| Fields flagged for a person | 27.0% (17/63) |
| **Agreed but wrong** (both readers matched on a wrong value) | 0.0% (0/63) |
| Missed by both readers (nothing returned, nothing flagged) | 0.0% (0/63) |
| Muse Spark field accuracy | 100.0% (63/63) |
| Muse Spark Open field accuracy | 73.0% (46/63) |

### Hard charts (1)

| Condition | Fields right with no person involved | Table row recall | Hallucinated rows | Wrong values left in the record |
|---|---|---|---|---|
| A. Whole-image read | 100.0% (23/23) | 100.0% (5/5) | 0 | 0.0% (0/23) |
| B. SAM regions, one reader | 100.0% (23/23) | 100.0% (5/5) | 0 | 0.0% (0/23) |
| C. Basa (two readers, reconcile) | 34.8% (8/23) | 100.0% (5/5) | 0 | 0.0% (0/23) |

| Measure for condition C | Result |
|---|---|
| **Error catch rate** (Muse Spark's wrong fields that C flagged) | n/a |
| Review burden (Muse Spark's right fields that C flagged anyway) | 65.2% (15/23) |
| Fields flagged for a person | 65.2% (15/23) |
| **Agreed but wrong** (both readers matched on a wrong value) | 0.0% (0/23) |
| Missed by both readers (nothing returned, nothing flagged) | 0.0% (0/23) |
| Muse Spark field accuracy | 100.0% (23/23) |
| Muse Spark Open field accuracy | 34.8% (8/23) |

### Other charts (2)

| Condition | Fields right with no person involved | Table row recall | Hallucinated rows | Wrong values left in the record |
|---|---|---|---|---|
| A. Whole-image read | 100.0% (40/40) | 100.0% (8/8) | 0 | 0.0% (0/40) |
| B. SAM regions, one reader | 100.0% (40/40) | 100.0% (8/8) | 0 | 0.0% (0/40) |
| C. Basa (two readers, reconcile) | 95.0% (38/40) | 100.0% (8/8) | 0 | 0.0% (0/40) |

| Measure for condition C | Result |
|---|---|
| **Error catch rate** (Muse Spark's wrong fields that C flagged) | n/a |
| Review burden (Muse Spark's right fields that C flagged anyway) | 5.0% (2/40) |
| Fields flagged for a person | 5.0% (2/40) |
| **Agreed but wrong** (both readers matched on a wrong value) | 0.0% (0/40) |
| Missed by both readers (nothing returned, nothing flagged) | 0.0% (0/40) |
| Muse Spark field accuracy | 100.0% (40/40) |
| Muse Spark Open field accuracy | 95.0% (38/40) |

### Agreed but wrong, and fields nobody returned

None in this run.

### Calls that failed

- `hard-chart-01`: 1 error(s), first: table muse_spark_open: The model's answer contained no JSON

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

Run on 2026-10-31T11:17:25.901Z. 8 charts (3 hard), 169 fields, 104 model calls. Read margin 0.2. Models: Muse Spark `muse-spark-1.3`, Muse Spark Open `meta-models/muse-spark-open`, SAM `sam-3.1`.

Wrong values left in the record after a person settles every flagged field: C 0.0% (0/169), which is the same as A at 0.0% (0/169). This is the dev set, used for tuning, so it is not the headline.

### All charts

| Condition | Fields right with no person involved | Table row recall | Hallucinated rows | Wrong values left in the record |
|---|---|---|---|---|
| A. Whole-image read | 100.0% (169/169) | 100.0% (35/35) | 0 | 0.0% (0/169) |
| B. SAM regions, one reader | 100.0% (169/169) | 100.0% (35/35) | 0 | 0.0% (0/169) |
| C. Basa (two readers, reconcile) | 89.9% (152/169) | 100.0% (35/35) | 0 | 0.0% (0/169) |

| Measure for condition C | Result |
|---|---|
| **Error catch rate** (Muse Spark's wrong fields that C flagged) | n/a |
| Review burden (Muse Spark's right fields that C flagged anyway) | 10.1% (17/169) |
| Fields flagged for a person | 10.1% (17/169) |
| **Agreed but wrong** (both readers matched on a wrong value) | 0.0% (0/169) |
| Missed by both readers (nothing returned, nothing flagged) | 0.0% (0/169) |
| Muse Spark field accuracy | 100.0% (169/169) |
| Muse Spark Open field accuracy | 89.9% (152/169) |

### Hard charts (3)

| Condition | Fields right with no person involved | Table row recall | Hallucinated rows | Wrong values left in the record |
|---|---|---|---|---|
| A. Whole-image read | 100.0% (66/66) | 100.0% (14/14) | 0 | 0.0% (0/66) |
| B. SAM regions, one reader | 100.0% (66/66) | 100.0% (14/14) | 0 | 0.0% (0/66) |
| C. Basa (two readers, reconcile) | 78.8% (52/66) | 100.0% (14/14) | 0 | 0.0% (0/66) |

| Measure for condition C | Result |
|---|---|
| **Error catch rate** (Muse Spark's wrong fields that C flagged) | n/a |
| Review burden (Muse Spark's right fields that C flagged anyway) | 21.2% (14/66) |
| Fields flagged for a person | 21.2% (14/66) |
| **Agreed but wrong** (both readers matched on a wrong value) | 0.0% (0/66) |
| Missed by both readers (nothing returned, nothing flagged) | 0.0% (0/66) |
| Muse Spark field accuracy | 100.0% (66/66) |
| Muse Spark Open field accuracy | 78.8% (52/66) |

### Other charts (5)

| Condition | Fields right with no person involved | Table row recall | Hallucinated rows | Wrong values left in the record |
|---|---|---|---|---|
| A. Whole-image read | 100.0% (103/103) | 100.0% (21/21) | 0 | 0.0% (0/103) |
| B. SAM regions, one reader | 100.0% (103/103) | 100.0% (21/21) | 0 | 0.0% (0/103) |
| C. Basa (two readers, reconcile) | 97.1% (100/103) | 100.0% (21/21) | 0 | 0.0% (0/103) |

| Measure for condition C | Result |
|---|---|
| **Error catch rate** (Muse Spark's wrong fields that C flagged) | n/a |
| Review burden (Muse Spark's right fields that C flagged anyway) | 2.9% (3/103) |
| Fields flagged for a person | 2.9% (3/103) |
| **Agreed but wrong** (both readers matched on a wrong value) | 0.0% (0/103) |
| Missed by both readers (nothing returned, nothing flagged) | 0.0% (0/103) |
| Muse Spark field accuracy | 100.0% (103/103) |
| Muse Spark Open field accuracy | 97.1% (100/103) |

### Agreed but wrong, and fields nobody returned

None in this run.

### Calls that failed

A failed reader call leaves a region with one reader, so condition C flags every field in it. Those flags count toward review burden and make it look higher than the readers' real disagreement rate.

- `gen-d05`: 1 error(s), first: table muse_spark_open: The model's answer contained no JSON

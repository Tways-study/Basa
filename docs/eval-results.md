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

Run on 2026-10-31T11:38:04.910Z. 8 charts (3 hard), 169 fields, 104 model calls. Read margin 0.2. Models: Muse Spark `muse-spark-1.3`, Muse Spark Open `meta-models/muse-spark-open`, SAM `sam-3.1`.

Wrong values left in the record after a person settles every flagged field: C 1.2% (2/169), which is higher than A at 0.0% (0/169). This is the dev set, used for tuning, so it is not the headline.

### All charts

| Condition | Fields right with no person involved | Table row recall | Hallucinated rows | Wrong values left in the record |
|---|---|---|---|---|
| A. Whole-image read | 100.0% (169/169) | 100.0% (35/35) | 0 | 0.0% (0/169) |
| B. SAM regions, one reader | 98.2% (166/169) | 100.0% (35/35) | 0 | 1.8% (3/169) |
| C. Basa (two readers, reconcile) | 95.9% (162/169) | 100.0% (35/35) | 0 | 1.2% (2/169) |

| Measure for condition C | Result |
|---|---|
| **Error catch rate** (Muse Spark's wrong fields that C flagged) | 33.3% (1/3) |
| Review burden (Muse Spark's right fields that C flagged anyway) | 2.4% (4/166) |
| Fields flagged for a person | 3.0% (5/169) |
| **Agreed but wrong** (both readers matched on a wrong value) | 1.2% (2/169) |
| Missed by both readers (nothing returned, nothing flagged) | 0.0% (0/169) |
| Muse Spark field accuracy | 98.2% (166/169) |
| Muse Spark Open field accuracy | 96.4% (163/169) |

### Hard charts (3)

| Condition | Fields right with no person involved | Table row recall | Hallucinated rows | Wrong values left in the record |
|---|---|---|---|---|
| A. Whole-image read | 100.0% (66/66) | 100.0% (14/14) | 0 | 0.0% (0/66) |
| B. SAM regions, one reader | 95.5% (63/66) | 100.0% (14/14) | 0 | 4.5% (3/66) |
| C. Basa (two readers, reconcile) | 95.5% (63/66) | 100.0% (14/14) | 0 | 3.0% (2/66) |

| Measure for condition C | Result |
|---|---|
| **Error catch rate** (Muse Spark's wrong fields that C flagged) | 33.3% (1/3) |
| Review burden (Muse Spark's right fields that C flagged anyway) | 0.0% (0/63) |
| Fields flagged for a person | 1.5% (1/66) |
| **Agreed but wrong** (both readers matched on a wrong value) | 3.0% (2/66) |
| Missed by both readers (nothing returned, nothing flagged) | 0.0% (0/66) |
| Muse Spark field accuracy | 95.5% (63/66) |
| Muse Spark Open field accuracy | 97.0% (64/66) |

### Other charts (5)

| Condition | Fields right with no person involved | Table row recall | Hallucinated rows | Wrong values left in the record |
|---|---|---|---|---|
| A. Whole-image read | 100.0% (103/103) | 100.0% (21/21) | 0 | 0.0% (0/103) |
| B. SAM regions, one reader | 100.0% (103/103) | 100.0% (21/21) | 0 | 0.0% (0/103) |
| C. Basa (two readers, reconcile) | 96.1% (99/103) | 100.0% (21/21) | 0 | 0.0% (0/103) |

| Measure for condition C | Result |
|---|---|
| **Error catch rate** (Muse Spark's wrong fields that C flagged) | n/a |
| Review burden (Muse Spark's right fields that C flagged anyway) | 3.9% (4/103) |
| Fields flagged for a person | 3.9% (4/103) |
| **Agreed but wrong** (both readers matched on a wrong value) | 0.0% (0/103) |
| Missed by both readers (nothing returned, nothing flagged) | 0.0% (0/103) |
| Muse Spark field accuracy | 100.0% (103/103) |
| Muse Spark Open field accuracy | 96.1% (99/103) |

### Agreed but wrong, and fields nobody returned

- `hard-chart-01` `line1`: truth "Fasting sample, 07:40.", readers agreed on "Fasting sample, 07:4"
- `hard-chart-01` `line2`: truth "Recheck K+ in one week.", readers agreed on "Recheck K+ in one w"

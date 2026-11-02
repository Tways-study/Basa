# Eval results

Written by `pnpm eval`; do not edit by hand. The prompt tuning log is in `docs/eval-tuning.md`. Every chart is synthetic: no real patient data and no real clinic photos. Charts whose id starts with `screen-` are phone photographs of a screen showing a generated chart, not of paper, so they carry moiré and glare that paper would not.

## What the numbers mean

- **A** reads the whole chart once with Muse Spark. **B** finds regions (Muse Spark proposes boxes, SAM tightens them) and reads each with Muse Spark only. **C** is Basa: the same regions, read by Muse Spark and Muse Spark Open, then reconciled. B and C share one segmentation per chart.
- A value is right when it matches the typed ground truth after the same normalization reconcile uses (case, spacing, number format, unit spelling).
- **Fields right with no person involved:** A and B, fields that are correct. C, fields both readers agreed on that are correct. C flags the rest for a person.
- **Wrong values left in the record:** what remains wrong if a person settles every flagged field correctly. For A and B that is every error. For C it is the agreed-but-wrong fields plus fields neither reader returned.
- **Table row recall:** rows where every field is right (A, B) or agreed-and-right or flagged (C).
- **Error catch rate** is the share of Muse Spark's wrong fields that C flagged. **Agreed but wrong** is the failure reconcile cannot catch: both readers matched on a wrong value.
- Small samples: read the counts in brackets, not only the percentages.

## Held-out set (final)

Run on 2026-11-02T13:41:19.366Z. 12 charts (5 hard), 252 fields, 159 model calls. Read margin 0.2. Models: Muse Spark `muse-spark-1.3`, Muse Spark Open `meta-models/muse-spark-open`, SAM `sam-3.1`.

Wrong values left in the record after a person settles every flagged field: C 1.2% (3/252), which is lower than A at 1.6% (4/252).

### All charts

| Condition | Fields right with no person involved | Table row recall | Hallucinated rows | Wrong values left in the record |
|---|---|---|---|---|
| A. Whole-image read | 98.4% (248/252) | 100.0% (52/52) | 0 | 1.6% (4/252) |
| B. SAM regions, one reader | 97.6% (246/252) | 100.0% (52/52) | 0 | 2.4% (6/252) |
| C. Basa (two readers, reconcile) | 94.8% (239/252) | 100.0% (52/52) | 0 | 1.2% (3/252) |

| Measure for condition C | Result |
|---|---|
| **Error catch rate** (Muse Spark's wrong fields that C flagged) | 50.0% (3/6) |
| Review burden (Muse Spark's right fields that C flagged anyway) | 2.8% (7/246) |
| Fields flagged for a person | 4.0% (10/252) |
| **Agreed but wrong** (both readers matched on a wrong value) | 1.2% (3/252) |
| Missed by both readers (nothing returned, nothing flagged) | 0.0% (0/252) |
| Muse Spark field accuracy | 97.6% (246/252) |
| Muse Spark Open field accuracy | 94.8% (239/252) |

### Hard charts (5)

| Condition | Fields right with no person involved | Table row recall | Hallucinated rows | Wrong values left in the record |
|---|---|---|---|---|
| A. Whole-image read | 96.2% (102/106) | 100.0% (22/22) | 0 | 3.8% (4/106) |
| B. SAM regions, one reader | 95.3% (101/106) | 100.0% (22/22) | 0 | 4.7% (5/106) |
| C. Basa (two readers, reconcile) | 92.5% (98/106) | 100.0% (22/22) | 0 | 1.9% (2/106) |

| Measure for condition C | Result |
|---|---|
| **Error catch rate** (Muse Spark's wrong fields that C flagged) | 60.0% (3/5) |
| Review burden (Muse Spark's right fields that C flagged anyway) | 3.0% (3/101) |
| Fields flagged for a person | 5.7% (6/106) |
| **Agreed but wrong** (both readers matched on a wrong value) | 1.9% (2/106) |
| Missed by both readers (nothing returned, nothing flagged) | 0.0% (0/106) |
| Muse Spark field accuracy | 95.3% (101/106) |
| Muse Spark Open field accuracy | 92.5% (98/106) |

### Other charts (7)

| Condition | Fields right with no person involved | Table row recall | Hallucinated rows | Wrong values left in the record |
|---|---|---|---|---|
| A. Whole-image read | 100.0% (146/146) | 100.0% (30/30) | 0 | 0.0% (0/146) |
| B. SAM regions, one reader | 99.3% (145/146) | 100.0% (30/30) | 0 | 0.7% (1/146) |
| C. Basa (two readers, reconcile) | 96.6% (141/146) | 100.0% (30/30) | 0 | 0.7% (1/146) |

| Measure for condition C | Result |
|---|---|
| **Error catch rate** (Muse Spark's wrong fields that C flagged) | 0.0% (0/1) |
| Review burden (Muse Spark's right fields that C flagged anyway) | 2.8% (4/145) |
| Fields flagged for a person | 2.7% (4/146) |
| **Agreed but wrong** (both readers matched on a wrong value) | 0.7% (1/146) |
| Missed by both readers (nothing returned, nothing flagged) | 0.0% (0/146) |
| Muse Spark field accuracy | 99.3% (145/146) |
| Muse Spark Open field accuracy | 96.6% (141/146) |

### Agreed but wrong, and fields nobody returned

- `gen-t04` `line1`: truth "Sample taken 11:40.", readers agreed on "Sample taken 1 1:40."
- `screen-t10` `line2`: truth "Sample taken 07:20.", readers agreed on "Sample taken 0720."
- `gen-t12` `line1`: truth "Form filed at front desk.", readers agreed on "Form copied-filed at front desk."

## Dev set

Run on 2026-10-31T13:05:22.230Z. 8 charts (3 hard), 169 fields, 106 model calls. Read margin 0.2. Models: Muse Spark `muse-spark-1.3`, Muse Spark Open `meta-models/muse-spark-open`, SAM `sam-3.1`.

Wrong values left in the record after a person settles every flagged field: C 0.0% (0/169), which is the same as A at 0.0% (0/169). This is the dev set, used for tuning, so it is not the headline.

### All charts

| Condition | Fields right with no person involved | Table row recall | Hallucinated rows | Wrong values left in the record |
|---|---|---|---|---|
| A. Whole-image read | 100.0% (169/169) | 100.0% (35/35) | 0 | 0.0% (0/169) |
| B. SAM regions, one reader | 100.0% (169/169) | 100.0% (35/35) | 0 | 0.0% (0/169) |
| C. Basa (two readers, reconcile) | 97.0% (164/169) | 100.0% (35/35) | 0 | 0.0% (0/169) |

| Measure for condition C | Result |
|---|---|
| **Error catch rate** (Muse Spark's wrong fields that C flagged) | n/a |
| Review burden (Muse Spark's right fields that C flagged anyway) | 3.0% (5/169) |
| Fields flagged for a person | 3.0% (5/169) |
| **Agreed but wrong** (both readers matched on a wrong value) | 0.0% (0/169) |
| Missed by both readers (nothing returned, nothing flagged) | 0.0% (0/169) |
| Muse Spark field accuracy | 100.0% (169/169) |
| Muse Spark Open field accuracy | 97.0% (164/169) |

### Hard charts (3)

| Condition | Fields right with no person involved | Table row recall | Hallucinated rows | Wrong values left in the record |
|---|---|---|---|---|
| A. Whole-image read | 100.0% (66/66) | 100.0% (14/14) | 0 | 0.0% (0/66) |
| B. SAM regions, one reader | 100.0% (66/66) | 100.0% (14/14) | 0 | 0.0% (0/66) |
| C. Basa (two readers, reconcile) | 97.0% (64/66) | 100.0% (14/14) | 0 | 0.0% (0/66) |

| Measure for condition C | Result |
|---|---|
| **Error catch rate** (Muse Spark's wrong fields that C flagged) | n/a |
| Review burden (Muse Spark's right fields that C flagged anyway) | 3.0% (2/66) |
| Fields flagged for a person | 3.0% (2/66) |
| **Agreed but wrong** (both readers matched on a wrong value) | 0.0% (0/66) |
| Missed by both readers (nothing returned, nothing flagged) | 0.0% (0/66) |
| Muse Spark field accuracy | 100.0% (66/66) |
| Muse Spark Open field accuracy | 97.0% (64/66) |

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

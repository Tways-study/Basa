# Eval prompt tuning log (dev set only)

Phase 7, task 4. Prompts are tuned on the dev set only; the held-out set is run once at the end with `--final`. Raw model outputs per run are in `eval/runs/` (not committed); the dev summary of each run is in `eval/tuning/*.json`. Every run is the 8 dev charts, about 104 model calls, `MOCK_MODELS=false`. Dates are 2026-10-31.

## What was tried

| # | Change | Why | Evidence | Decision |
|---|---|---|---|---|
| 1 | Add "Copy each word once, exactly as it looks: never repeat letters or syllables" to the read prompt (and to condition A's prompt) | Muse Spark Open repeats letters: `Alccantara`, `Creatininine`, `Platelelets`, `Bautitista`, `Hemeglobin`, `Potakassium` | One full dev run: flags 5 and the same slips on `gen-d02` and `smoke-chart-02`. Paired test on `gen-d02`, 3 runs each way, flags per run: with the sentence 1, 4 (one failed table read), 2; without 1, 15 (one failed table read), 2. Ignoring the failed reads: identical | **Reverted.** No measurable effect on the slip |
| 2 | Retry once when a reader's answer has no JSON in it (`NoJsonError` in `lib/models/reader.ts`); the same one retry for condition A in `eval/whole-image.ts`. The retry is a real call and counts against the per-scan call cap | A whole table read came back as words, not JSON, in 6 observed reads (`hard-chart-01` twice, `gen-d05`, `gen-d04` header, `gen-d02` twice), and each one made the region flag every field: 12 to 15 false flags | Fired 3 times in the two runs after the change (call counts 105 and 106 instead of 104) and every retry returned good JSON. `hard-chart-01` went from 15 flags in one run to 0 to 1 | **Kept.** 8 new unit tests in `lib/models/reader.test.ts` |
| 3 | Add "The picture is a crop, so a word, number or line may be cut off at its edge: if the end of one is cut off, use null for that key and never guess the rest" | `hard-chart-01` once had both readers agree on a cut-off line (`Fasting sample, 07:4`), which reconcile cannot flag | Margin 0 (to make clipping likely), `hard-chart-01`: 1 of 3 runs clipped without the sentence, 0 of 3 with it; flags the same (0, 1, 1 against 1, 1, 1). Full dev run: no extra nulls (1 null answer in 104 calls), but gen-d05 had both readers agree on a wrong digit under the fold (`8.6` for `5.6`) | **Reverted.** Too few clip events to show a benefit; not worth an unproven sentence in the production prompt. The 20% read margin stays as the defence against clipping |

Three changes is the cap, so tuning stops here.

## Runs

| Run | Code | A | B | C: Muse Spark wrong / caught | Agreed but wrong | Flagged (false flags) | Notes |
|---|---|---|---|---|---|---|---|
| R1 | clean renders, baseline prompts | 169/169 | 169/169 | 0 / n/a | 0 | 17 (17) | `gen-d05` table failed to return JSON: 12 flags |
| R2 | harder charts, baseline | 169/169 | 166/169 | 3 / 1 | 2 | 5 (4) | `hard-chart-01`: both readers cut the same line (`07:4`) |
| T0 | R2 code, repeated | 169/169 | 167/169 | 2 / 2 | 0 | 20 (18) | `hard-chart-01` table failed to return JSON: 15 flags |
| T1 | + change 1 | 169/169 | 169/169 | 0 / n/a | 0 | 5 (5) | |
| T2 | + change 2 (retry) | 167/169 | 169/169 | 0 / n/a | 0 | 5 (5) | one retry fired and recovered the `hard-chart-01` table |
| T3 | + change 3 | 169/169 | 168/169 | 1 / 0 | 1 | 5 (5) | both readers read `8.6` for `5.6` on `gen-d05` |
| **T4** | **final: change 2 only** | **169/169** | **169/169** | **0 / n/a** | **0** | **5 (5)** | two retries fired and recovered; this run is the one in `docs/eval-results.md` |

## What this shows

- **Run-to-run noise is as large as any effect we measured.** The same code scored B at 166, 167 and 169 on different runs, `agreed but wrong` swung between 2 and 0, and flags between 5 and 20. A 104-call run cannot show a small prompt effect. The held-out run is one draw from this spread, so the report gives counts and says the result varies.
- **The only change with a clear effect was the retry,** because a failed JSON answer is a large, discrete event (12 to 15 false flags at once). Prompt wording changes did nothing we could detect.
- **Muse Spark Open's stutter is steady and prompt-resistant.** It appears on the same charts (`gen-d02` most) run after run, around 4 to 5 slips in 169 fields, and Muse Spark is right each time. These are false flags: they raise review burden, not errors. A person settles them in seconds, but they are the reason review burden is about 3% of fields (5 of 169).
- **Both readers are strong on these charts.** Condition A and B are at or near 100% on every dev run, even at 28% resolution. The headline error catch rate has few events to measure on dev (0 to 2 Muse Spark errors per run), so the held-out percentage will rest on a handful of fields. Treat it as an anecdote with counts, not a rate.
- **The failure reconcile cannot catch did happen twice in seven full dev runs** (a cut-off line, then both readers misreading a digit under a fold). It is real, and it must be reported on its own line.

## Prompts as frozen for the held-out run

Pending the freeze (before the Nov 3 noon freeze). At the time of writing the read prompt is the baseline prompt plus the one retry on a no-JSON answer. The commit hash and date go here when the freeze is made.

# Phase 4 plan: full pipeline (2026-10-30)

Source: Phase 4 in `docs/BUILD_PLAN.md`. Scope freeze at the 8 PM check-in on Oct 30; after that only bug fixes.

## Order of work

1. **Table header row.** The table read prompt skips the chart's own header row (`TEST`, `VALUE`, `UNIT`), which today comes back as `row1`. Unit test on the prompt.
2. **Baseten reader (Muse Spark Open).** Adapter in `lib/models/` with the same `readRegion()` shape as Muse Spark. Reads only `message.content`, never stores `reasoning_content`, `reasoning_effort: "low"`, `max_tokens` 1500, `finish_reason: length` is a failed reading. Model ID and URL from env (`BASETEN_MODEL`, `BASETEN_MODEL_URL`), unsuffixed `meta-models/muse-spark-open` until `-1026` works for us.
3. **Two readers per region.** `Promise.allSettled` per region, concurrency capped at about 4.
4. **Reconcile in the pipeline.** Write `agreed` / `flagged` per field. A row only one reader found is `flagged`.
5. **Job states.** `queued → segmenting → reading → reconciling → needs_review → done`, `failed` reachable from any state. Each stage idempotent; re-running creates no duplicate rows.
6. **Cost guard and resilience.** `MAX_MODEL_CALLS_PER_SCAN` counts both readers (and SAM once it exists); a timeout and bounded retries on every model call.
7. **SAM box-prompt step.** Built 2026-10-30 for boxes only (see `docs/new-work.md`); mask decoding is blocked on a format spec. Original note: held back. The region strategy (Muse Spark proposes boxes, one SAM request returns masks) still needs the team's OK and a test on a real phone photo of a printed chart. Fallback if SAM is unusable: padded Muse Spark boxes directly (cut-order item 6).

## Done when (from the build plan)

- A real chart produces flagged fields where the two readers differ.
- Killing the process mid-scan and re-running the stage completes the scan without duplicates.
- The call-count guard stops a scan that exceeds the cap.

## Decisions to record

- Baseten model ID: unsuffixed until the organizers answer about `-1026`. No Open Weights prize claim yet.
- Phone test deferred (see `docs/phone-test.md`); step 7 waits on it.

# Basa — Build Plan (scaffold to deployment)

Source of truth for build order. CLAUDE.md holds the rules; this file holds the sequence.
Work one phase at a time. A phase is finished only when every "Done when" line is true and you have logged it in `docs/new-work.md`.

Owners: **T** = Tways, **A** = Alex, **D** = Adrian. Dates are PHT.

**Why phases and gates:** each phase produces something runnable, so integration problems show up on day 2, not day 8. If a gate is missed, cut scope (see "Cut order") instead of carrying the gap forward.

---

## Phase 0 — Repo, scaffold, accounts (Oct 27) · T, with A and D claiming credits

Tasks
1. Fresh public GitHub repo. First commit after kickoff. Add A and D as collaborators.
2. Scaffold: `pnpm create next-app` (App Router, TypeScript, Tailwind, ESLint). Then add: `zod`, `idb`, `@supabase/supabase-js`, `vitest`, `@playwright/test`.
3. `tsconfig.json`: `"strict": true`. Add scripts from CLAUDE.md (`typecheck`, `lint`, `test`, `test:e2e`, `eval`).
4. Commit `CLAUDE.md`, `.env.example` (names only), `.gitignore` covering `.env*.local`, and the `docs/` folder with `new-work.md`.
5. Create Supabase project and Vercel project; connect Vercel to the GitHub repo so every push to `main` deploys.
6. Everyone claims Meta API, Baseten and Modal credits and sets the spend alert.

Done when
- A push to `main` deploys a blank page on a public Vercel URL.
- A and D have each pushed a branch.
- `pnpm typecheck && pnpm lint && pnpm test` passes on an empty project.

## Phase 1 — Smoke test and contracts (Oct 28, by noon) · T

Tasks
1. One tiny script per model (SAM 3.1, Muse Spark, Muse Spark Open on Baseten): send one test image, print the raw response. Run from a server-side script, never the browser.
2. Write what you actually observed into `docs/models-notes.md`: endpoint, auth header name, request shape, response shape, image size limits, latency, error format. Do not guess any of it. Mark each row **observed** (we saw it) or **documented** (read from the provider's official docs, not yet run). Run a text-only call first (`pnpm smoke:<name>`), then the image call.
3. Write Zod schemas in `lib/schemas/` (field, reading, reconciled field, region, job status) and `lib/pipeline/reconcile.ts` with unit tests.
4. Add `MOCK_MODELS=true`: every adapter returns fixture data with no network call.

Done when
- All three models return something parseable, or the failure and fallback are written in `models-notes.md`.
- Schemas and `reconcile` are merged to `main` and A and D have pulled them.
- The app runs end to end in mock mode with no credentials.

## Phase 2 — Database and storage (Oct 28) · D (done by T on Oct 29, who took over Adrian's part; see `docs/new-work.md`)

Tasks
1. Migration for `scans`, `regions`, `readings`, `reviews`, `recognition_event` (see CLAUDE.md data model). Add a unique constraint on `readings (region_id, model)` so retries cannot duplicate.
2. Enable RLS on every table. Add **no** anon policies. The server uses the service role key; the browser never reads these tables directly.
3. Private Storage bucket for scan images and masks. Access through signed URLs created server-side.
4. Commit the migration as a file in `supabase/migrations/`.

Done when
- Querying any table with the anon key returns nothing, and writing is refused.
- Querying with the service role works.
- The bucket is private (a direct public URL returns an error).

## Phase 3 — Walking skeleton (Oct 29) · T for API, A for UI

Goal: one chart goes from phone camera to a stored result on the live URL, with a single reader. Ugly is fine. Working is the point.

Status (2026-10-30): tasks 1 to 6 are done. The API shipped in PRs #15 and #16, and Tways built the UI (capture screen, results page, UI foundation) in PR #18. Production has all server variables and runs the Phase 4 pipeline; Preview is verified for the Supabase variables only, not yet for the Meta and Baseten keys. The Production run (a Mac run on `basa-chi.vercel.app` reached `needs_review` in about 14 s with both readers and no errors). Still open, and it is the only thing keeping Phase 3 open: the first Done when line, a real photo taken on a **phone** on mobile data. A Mac webcam rehearsal is logged in `docs/phone-test.md` and does not count. Use the printed `eval/fixtures/smoke-chart-02.jpg`; the steps and the result log are in `docs/phone-test.md`.

Tasks
1. A: capture screen that opens the camera or file picker and shows the photo.
2. T: `POST /api/sync` that validates the upload (Zod), stores the image, creates a `scans` row, runs segment then one reader, saves `regions` and `readings`.
3. T: `GET /api/scans/[id]` returning job status and results.
4. A: results page that polls status and renders the raw fields.
5. Deploy. Add all server env vars in Vercel first (see Phase 9 list).
6. A: UI foundation. Run `pnpm dlx shadcn@latest init`; map its CSS variables to the palette and keep the six variables already in `app/globals.css`; add only the components in use (button, badge, dialog). Add `lucide-react`. Load Fraunces, IBM Plex Sans and IBM Plex Mono with `next/font`. Tell Tways which dependencies were added and why.

Done when
- A real photo taken on a phone reaches a stored result on the public URL.
- No secret appears in browser network traffic or the client bundle.
- `pnpm build` passes and the capture screen uses the restyled shadcn button with a lucide icon.

## Phase 4 — Full pipeline (Oct 30) · T

**Complete (2026-10-30), confirmed by Tways.** Status (2026-10-30): all three Done when lines shown on the real path (see `docs/new-work.md`): flagged fields from a real disagreement (once, on `eval/fixtures/hard-chart-01.jpg`), a real SIGKILL and resume with no duplicates, and the call cap on real calls. Tasks 1 to 6 built; SAM refines boxes but its masks are not decoded (format undocumented, see `docs/models-notes.md`). Masks decided: boxes only (2026-10-30). Clipped-crop risk addressed with a 20% read margin (`READ_MARGIN`); re-measure on a phone photo.

Tasks
1. Job states: `queued → segmenting → reading → reconciling → needs_review → done`, with `failed` reachable from any state. Each stage is idempotent: re-running it must not create duplicate rows.
2. Add the second reader (Muse Spark Open via Baseten). Run both readers per region with `Promise.allSettled`; cap concurrency at about 4. Per `docs/models-notes.md`: read only `message.content` (never `reasoning_content`); set `reasoning_effort` (`minimal` for Muse Spark, `low` for Muse Spark Open) with `max_tokens` 1500 and fail a reading on `finish_reason: length`; parse SAM's streamed special-token output (delta events only) into Zod-validated boxes and masks. Region strategy, built: Muse Spark proposes padded boxes, then one SAM box-prompt request returns tight boxes. **Boxes only**: the mask byte format is undocumented, so masks are parsed but not decoded (`mask_path` stays null). The readers see the stored box grown by 20% (`READ_MARGIN`), because a box that ends short of the text makes both readers drop the same words and still agree.
3. Wire in `reconcile`: `agreed` / `flagged` per field. Built as `reconcileReadings`, derived from the stored readings on every `GET /api/scans/[id]` (a `fields` array per region), not stored; Phase 5 writes `reviews` rows when a person decides.
4. Cost guard: enforce `MAX_MODEL_CALLS_PER_SCAN` in code.
5. Timeouts and bounded retries on every model call.
6. Table read prompt: skip the chart's own header row (`TEST`, `VALUE`, `UNIT`). Today it comes back as `row1` (observed 2026-10-30).

Done when
- A real chart produces flagged fields where the two readers differ.
- Killing the process mid-scan and re-running the stage completes the scan without duplicates.
- The call-count guard stops a scan that exceeds the cap.

**Scope freeze at the 8 PM check-in on Oct 30.** After that, only bug fixes, and the out-of-scope list is binding.

Scope freeze, in practice (set 2026-10-30):
- **In scope** is the tasks written in Phases 5 to 8, plus the Phase 3 phone run. Nothing is added. A new idea goes on a list, not into the build, unless all three of us agree and something of equal size is cut.
- **Allowed after the freeze:** those tasks, bug fixes, cuts from the cut order, and docs.
- **Frozen contracts:** the shared field keys, the `ScanResult` shape (`lib/schemas/sync.ts`), the reconciled field shape, region kinds and job statuses. Change one only when all three agree, because Alex's screens and Adrian's eval code read them.
- **Not allowed:** anything on the out-of-scope list in `CLAUDE.md`, and new dependencies without telling Tways why.
- `main` must always deploy; every change goes through a PR from a `tways/`, `alex/` or `adrian/` branch; no debugging on `main` after Nov 3.
- **State at the freeze:** Production is the PR #21 merge, READY; `basa-chi.vercel.app` answers 200 and the scan API answers its own 404 for an unknown id; typecheck, lint and 92 tests pass.
- **Agenda for the 8 PM check-in:** (1) the phone run result; (2) the organizers' answers on the SAM mask format, Baseten `-1026` and the Startup track requirements; (3) Alex and Adrian confirm they pulled `main` and read their task lists, and name any blocker; (4) is anything behind the day-by-day gates, and does the cut order apply; (5) everyone agrees the freeze out loud.

## Phase 5 — Review UI (Oct 29 to Oct 31) · A

What the API gives you now (merged, live on Production; types in `lib/schemas/sync.ts`): `GET /api/scans/[id]` returns, per region, `kind`, a fractional `bbox`, the raw `readings` from each reader (with `error` when a call failed) and `fields`, the reconciled list. Each field is `agreed` (has `value`) or `flagged` (has a `reason`, no `value`, and both readers' texts in `readings`). A flagged field has no value on purpose: never preselect one. `fields` is the same array whether a reader failed, found nothing or disagreed. Mock mode (`MOCK_MODELS=true`) returns a chart with a real mismatch (7.2 vs 1.2), an unreadable value, a spelling difference and one that agrees after normalizing (`µmol/L` vs `umol/L`), so you can build the whole screen without credentials.

Tasks
1. Review screen: source crop beside both readings per field. `agreed` fields fast-confirm; `flagged` fields need an explicit pick or edit. Never preselect a model's value for a flagged field. Show the crop the readers saw: the stored box grown by `READ_MARGIN` from `lib/pipeline/bbox.ts` (client-safe), not the bare box.
2. Overlay of the **SAM boxes** drawn from stored fractional boxes. There are no masks: they are undecoded (format undocumented), so do not wait for them.
3. Write `reviews` and `recognition_event` rows on confirm (a route handler; the browser never writes to the database).
4. 44px touch targets, keyboard operation, labels on every control, 360px layout.
5. Optional, first thing on the cut list: a GSAP reveal of the box overlay with `@gsap/react`, lazy-loaded, off under `prefers-reduced-motion`.
6. Show a failed reading as a failed reading (the results page already does): a flagged field caused by a reader that errored must say so, and the person decides it.

Done when
- A full scan can be reviewed end to end and a confirmed record is stored.
- Works at 360px wide and on a real phone.
- The overlay appears without animation when reduced motion is on, and GSAP is not in the capture route's client chunks (or GSAP was cut and the overlay simply appears).

Note for the review copy: "agreed" means the two readers matched, not that the value is right. A box that clips the text can still produce an agreed wrong answer, so the source crop must always be visible next to the value.

## Phase 6 — Offline outbox (Oct 30 to Nov 1) · A

Tasks
1. IndexedDB queue via `idb`: capture always saves locally first, with a status badge (saved on device, syncing, synced, failed).
2. Sync on the `online` event, on app start, and via a "Sync now" button. Retries use backoff.
3. Idempotency: the client generates the scan id, so a repeated upload cannot create a second scan. The server already treats a repeat `POST /api/sync` for a known id as a no-op (200), and resumes one that failed or went quiet for 90 s. The capture screen (`components/capture/capture-form.tsx`) already makes the id, downscales the photo below 4 MB (`lib/client/image-fit.ts`) and sends the multipart form; the outbox should store that downscaled blob and reuse the same sender.

Done when
- With the network off, a capture shows "saved on device". After the network returns, it syncs without a manual step.
- Syncing the same item twice creates one scan.

## Phase 7 — Eval harness (Oct 28 to Nov 3) · D, with T

What exists now: `eval/fixtures/` holds `smoke-chart-01`, `smoke-chart-02` and `hard-chart-01` (each a `.jpg` plus ground-truth `.json`; `smoke-chart-02.json` also has `_regions` boxes in pixels, `hard-chart-01.json` does not yet). The real pipeline pieces are importable, so `eval/run.ts` does not need the HTTP routes or the database: `getModelAdapters()` (Muse Spark proposes boxes, SAM refines them, both readers), `cropRegion` and `growBBox(box, READ_MARGIN, READ_MARGIN)` (the crop the readers see), `reconcileReadings`, and `normalize` from `lib/pipeline/reconcile.ts` for comparing a value with the ground truth. A scan costs about 12 model calls (one proposal, one SAM, two reads per region), so 30 charts times three conditions is well inside the free credits.

Tasks
1. Ground-truth JSON first, then the chart, then the photo. Use the shared field keys in CLAUDE.md. Follow `hard-chart-01.json` (flat keys, fictional values).
2. `eval/manifest.json`: 30 charts, 10 dev and 20 held-out test, 10 marked hard. **What makes a chart hard:** both models read blurred and even smeared digits correctly, so blur alone does not make the readers disagree (1 content disagreement in 7 real runs). Use things models actually get wrong: real handwriting (cursive, crossed-out words, ink over a stamp), digits that look alike in handwriting, low-contrast ink, a crease through a value, text close to a region edge.
3. `eval/run.ts` runs three conditions: A whole-image single read, B SAM plus one reader, C Basa (SAM, two readers, reconcile). Metrics: field accuracy, table row recall, hallucinated rows, error catch rate (headline), review burden. Run with `MOCK_MODELS=false`; `.env.local` has it `true`, and an eval that quietly used the mock readers would be meaningless (latency 0 ms is the tell).
4. Tune prompts on the dev set only. Run the held-out set once at the end for the final numbers.
5. Print one synthetic chart, photograph it with a phone, and run it through the pipeline: it re-measures the 20% read margin and the SAM boxes on a real photo (the only real-photo evidence we will have).

Report "agreed but wrong" separately: both readers matching a wrong value is the failure reconcile cannot catch, and the 20% read margin exists because of it. A condition C result that hides it would overstate the error catch rate.

Done when
- `pnpm eval` writes `eval/results.json` and a table in `docs/eval-results.md`.
- Condition C beats A on the held-out set, or the honest result is documented.

## Phase 8 — Hardening (Nov 1 to Nov 2) · T and A

Tasks
1. Cited summary: deterministic template first. Every line cites its source region. No advice, no inference.
2. `/api/scans/[id]/resume` endpoint. Include a retry for a failed reading in a scan that already reached `needs_review`: today a repeat sync is a no-op for finished scans, so a Baseten timeout stays failed (the error shows and every field is flagged, so it is safe, but there is no way to try again).
3. Empty, loading and error states for every screen.
4. One Playwright happy-path test in mock mode.
5. Accessibility pass (contrast, focus order, reduced motion; icon-only controls labeled; contrast checked on the restyled shadcn components).
6. Secret scan of the repo and git history.

Done when
- The demo chart runs three times in a row without help.
- `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` passes.

**Feature freeze: Nov 3, 12:00 PM.**

---

## Phase 9 — Deployment checklist (do it early, repeat before submitting)

Do a first full deploy in Phase 3 and repeat this list before each milestone. A deployment you have not rehearsed is the most common way to lose a demo.

### Environment variables in Vercel (Production and Preview)

Tick **Preview** as well as Production on every variable, with exactly these names. A Production-only variable makes Preview deploys fail with `missing or invalid environment variables`, and changes reach only new deployments.

| Variable | Exposed to browser? |
|---|---|
| `META_API_KEY`, `META_API_BASE_URL` (`https://api.meta.ai/v1`, no trailing slash or period), `META_SPARK_MODEL` (`muse-spark-1.3`), `META_SAM_MODEL` (`sam-3.1`) | No |
| `BASETEN_API_KEY`, `BASETEN_MODEL_URL` (the full chat-completions endpoint), `BASETEN_MODEL` (`meta-models/muse-spark-open`, or `-1026` if we get access) | No |
| `SUPABASE_SERVICE_ROLE_KEY` | **No, never** |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | No (server only) |
| `MAX_MODEL_CALLS_PER_SCAN` | No |
| `MOCK_MODELS` | No, set to `false` in Production |

### Steps
1. Run `pnpm build` locally. Fix every type and lint error before pushing.
2. Apply migrations to the production Supabase project from `supabase/migrations/`.
3. Verify security: anon-key query against each table returns nothing; bucket is private; service role key appears nowhere in client code (search the build output).
4. Set env vars in Vercel, then trigger a **Preview** deploy from a branch and run the full flow on it.
5. Check function duration. Model calls are slow, so do not run a whole scan in one request. Process per region, and look up your Vercel plan's function time limit and set `maxDuration` on the route within it. Do not assume a limit.
6. Merge to `main` for the **Production** deploy.
7. Smoke test on a real phone, logged out, on mobile data: capture, sync, process, review, confirm.
8. Confirm Baseten and Meta dashboards show your calls (Baseten logs are your proof for the Open Weights prize).
9. Check spend alerts and remaining credits.
10. Repo hygiene: README states "new codebase, nothing reused, synthetic data only"; `docs/new-work.md` is complete; no `.env*` committed; rotate any key that ever touched git.
11. Open the repo and demo video links in a logged-out browser window.

### Rollback
Keep the last known-good deployment. If Production breaks, promote or roll back to it in Vercel first, then debug on a branch. Never debug on `main` after Nov 3.

---

## Cut order if we fall behind
1. Service worker caching and motion polish (GSAP mask reveal goes first: the mask just appears).
2. Summary becomes a plain cited list.
3. Handwriting regions (keep tables, stamps, headers).
4. Move the open-weights reader from Baseten to Modal if Baseten fails twice.
5. Second reader becomes Muse Spark with a different prompt (drop the Open Weights claim).
6. Muse Spark proposes region boxes if SAM output is unusable.

## Starting a Claude Code session
Paste this at the top of every session:

> Read CLAUDE.md and docs/BUILD_PLAN.md. We are on Phase N, task M. State a short plan for it, list the files you will touch, then wait for my OK. Do not start the next phase.

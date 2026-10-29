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

## Phase 2 — Database and storage (Oct 28) · D

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

Tasks
1. Job states: `queued → segmenting → reading → reconciling → needs_review → done`, with `failed` reachable from any state. Each stage is idempotent: re-running it must not create duplicate rows.
2. Add the second reader (Muse Spark Open via Baseten). Run both readers per region with `Promise.allSettled`; cap concurrency at about 4. Per `docs/models-notes.md`: read only `message.content` (never `reasoning_content`), leave `max_tokens` headroom for reasoning, and parse SAM's streamed special-token output into Zod-validated boxes and masks (one SAM request per object type, each counted against the call cap).
3. Wire in `reconcile`: write `agreed` / `flagged` per field.
4. Cost guard: enforce `MAX_MODEL_CALLS_PER_SCAN` in code.
5. Timeouts and bounded retries on every model call.

Done when
- A real chart produces flagged fields where the two readers differ.
- Killing the process mid-scan and re-running the stage completes the scan without duplicates.
- The call-count guard stops a scan that exceeds the cap.

**Scope freeze at the 8 PM check-in on Oct 30.** After that, only bug fixes and the out-of-scope list is binding.

## Phase 5 — Review UI (Oct 29 to Oct 31) · A

Tasks
1. Review screen: source crop beside both readings per field. `agreed` fields fast-confirm; `flagged` fields need an explicit pick or edit. Never preselect a model's value for a flagged field.
2. SAM overlay drawn from stored fractional boxes.
3. Write `reviews` and `recognition_event` rows on confirm.
4. 44px touch targets, keyboard operation, labels on every control, 360px layout.
5. SAM mask reveal with GSAP and `@gsap/react`: lazy-loaded client component, off under `prefers-reduced-motion`.

Done when
- A full scan can be reviewed end to end and a confirmed record is stored.
- Works at 360px wide and on a real phone.
- The mask appears without animation when reduced motion is on, and GSAP is not in the capture route's client chunks.

## Phase 6 — Offline outbox (Oct 30 to Nov 1) · A

Tasks
1. IndexedDB queue via `idb`: capture always saves locally first, with a status badge (saved on device, syncing, synced, failed).
2. Sync on the `online` event, on app start, and via a "Sync now" button. Retries use backoff.
3. Idempotency: the client generates the scan id, so a repeated upload cannot create a second scan.

Done when
- With the network off, a capture shows "saved on device". After the network returns, it syncs without a manual step.
- Syncing the same item twice creates one scan.

## Phase 7 — Eval harness (Oct 28 to Nov 3) · D, with T

Tasks
1. Ground-truth JSON first, then the chart, then the photo. Use the shared field keys in CLAUDE.md.
2. `eval/manifest.json`: 30 charts, 10 dev and 20 held-out test, 10 marked hard.
3. `eval/run.ts` runs three conditions: A whole-image single read, B SAM plus one reader, C Basa (SAM, two readers, reconcile). Metrics: field accuracy, table row recall, hallucinated rows, error catch rate (headline), review burden.
4. Tune prompts on the dev set only. Run the held-out set once at the end for the final numbers.

Done when
- `pnpm eval` writes `eval/results.json` and a table in `docs/eval-results.md`.
- Condition C beats A on the held-out set, or the honest result is documented.

## Phase 8 — Hardening (Nov 1 to Nov 2) · T and A

Tasks
1. Cited summary: deterministic template first. Every line cites its source region. No advice, no inference.
2. `/api/scans/[id]/resume` endpoint.
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
| Variable | Exposed to browser? |
|---|---|
| `META_API_KEY`, `META_API_BASE_URL` (`https://api.meta.ai/v1`, no trailing slash or period), `META_SPARK_MODEL` (`muse-spark-1.3`), `META_SAM_MODEL` (`sam-3.1`) | No |
| `BASETEN_API_KEY`, `BASETEN_MODEL_URL` (the full chat-completions endpoint) | No |
| `SUPABASE_SERVICE_ROLE_KEY` | **No, never** |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes (designed to be public) |
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

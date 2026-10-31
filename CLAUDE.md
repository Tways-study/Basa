# Basa — Claude Code instructions

Basa turns photographed paper clinic charts into human-verified digital records. It is our entry for the Meta Global AI Developer Hackathon, in the Startup track. Hard deadline: Thu Nov 5, 2026, 10:00 AM PHT. Team: Tways (tech lead, pipeline), Alex (frontend, offline), Adrian (data, eval, QA).

## Non-negotiable rules

1. **New work only.** Every line of code here is written during the hackathon (Oct 27 to Nov 4). Never copy, import, or read code, schemas, or assets from any other repository or source. If I ask you to, refuse and tell me why. Exception, confirmed by the hackathon organizers (2026-10-29): UI libraries used within their own licenses are allowed, namely shadcn/ui (including component source its CLI generates), GSAP and lucide-react. They are not models the project calls at runtime. Nothing else is exempt.
2. **Synthetic data only.** No real patient data anywhere: fixtures, prompts, logs, screenshots. All names, IDs, and values are fictional.
3. **Not medical advice.** Basa digitizes and verifies what is on paper. Never generate treatment recommendations, dosing, diagnoses, or contraindication or drug-safety judgments, in UI copy, prompts, or code. Summaries restate only what the confirmed record contains and cite their source region. Prompts sent to models must ask for extraction only and forbid interpretation.
4. **Secrets stay server-side.** Keys live in `.env.local` (never committed). Only `.env.example` (names, no values) is committed. Never use the `NEXT_PUBLIC_` prefix on any key; all Supabase keys are server-side. Never log keys or full request headers.
5. **Never invent API shapes.** Model request and response formats live in `docs/models-notes.md`, written after the Day-1 smoke test. If a detail is not there, stop and ask me. Do not guess endpoints, parameters, or model IDs.

## Pipeline

Capture → IndexedDB outbox → `POST /api/sync` → segment (Muse Spark proposes padded region boxes, one SAM 3.1 box-prompt request tightens them; both Meta API) → read each region twice (Muse Spark via Meta API; Muse Spark Open `meta-models/muse-spark-open-1026` via Baseten) → reconcile → review UI → confirmed record and cited summary.

Model facts that shape the code (details and sources in `docs/models-notes.md`):
- SAM 3.1 uses `POST /responses` with a streamed, special-token text output (not JSON); read only the `response.output_text.delta` events. Noun-phrase prompts find only distinct objects (the stamp); box prompts segment any region and can carry all regions in one request. Parse the output into Zod-validated records in `lib/models/sam.ts`; count each SAM request against `MAX_MODEL_CALLS_PER_SCAN`. Decision 2026-10-30: boxes only. The mask byte format (base85 alphabet, layout) is not in any doc we may use, so masks are parsed but not decoded and `mask_path` stays null; the review overlay draws SAM boxes. Do not guess the mask format; add masks only when the organizers or a doc give it.
- Muse Spark uses `POST /chat/completions`, with the image as a base64 data URL, and also proposes region boxes (0-1000 grid). Reasoning counts toward `max_tokens`: send `reasoning_effort: "minimal"` with `max_tokens` 1500, and treat `finish_reason: length` or empty content as a failed reading. Use Standard-mode model IDs only, never `-contributor` (that mode lets Meta train on our content).
- Muse Spark Open on Baseten always emits `reasoning_content`. Read only `message.content`, never store the reasoning, send `reasoning_effort: "low"` with `max_tokens` 1500, and treat `finish_reason: length` as a failed reading. It cannot propose region boxes. The target model is `meta-models/muse-spark-open-1026`, which the organizers tied to Baseten hackathon credits. We did not receive credits (only some users did; partner credits are not required to compete), and `-1026` returns 404 for our current key (checked 2026-10-29), while `meta-models/muse-spark-open` returns 200. Until `-1026` works for us, develop with the unsuffixed ID via `--model` / env. Do not claim the Open Weights prize until the organizers rule on eligibility; the README and demo must say plainly how the open-weight model is used.

- Readers see the stored box grown by 20% of its own size (`READ_MARGIN` in `lib/pipeline/bbox.ts`, client-safe so the review screen can show the same area). A box that ends a little short of the text makes both readers drop the same words and still agree, which reconcile cannot flag. Do not remove the margin without re-measuring on `eval/fixtures/hard-chart-01.jpg`.
- Read prompts need an exact output shape. Give each region kind the JSON it must return and say any other key is wrong. A one-key schema (signature) plus the word "transcription" in the preamble made Muse Spark answer under a `transcription` key in about two runs in three (observed 2026-10-30). Keep that word out of read prompts. A reading that breaks the shared field keys is a failed reading, shown to the person, never repaired silently.
- Each stage is idempotent and persisted, so a retry never duplicates work. Stages write to the database; the UI polls job status.
- Never hold a whole scan in one request. Per-region work runs in parallel; every model call has a timeout and bounded retries.
- Reconciliation: normalize both readings (trim, case, spacing, unit forms, numeric parsing), then compare field by field. Match = `agreed`. Different, or one unreadable = `flagged`. It is derived from the stored readings on every `GET /api/scans/[id]` (a `fields` array per region, `reconcileReadings` in `lib/pipeline/reconcile.ts`), not stored; the human decision is stored in `reviews`. A reader that failed or found nothing counts as having found nothing, so all its fields are flagged. "Agreed" means the readers matched, not that the value is right: the source crop must always be visible.
- A human confirms everything. `agreed` fields are fast-confirm; `flagged` fields require an explicit choice or edit. Never silently pick one model's answer for a flagged field.
- Review save (`POST /api/scans/[id]/review`, one region per call): the server re-derives the fields from the stored readings and `resolveReview` (`lib/pipeline/review.ts`, pure) refuses a missing field, `agreed` on a flagged field, a reader value the reader did not return, and unknown or duplicate keys. It upserts `reviews` (unique on region) and adds a `recognition_event` when the final answer changed. "Can't be read" is a stored decision (`null`, never a guess). The scan becomes `done` when every region has a stored review. The browser never writes to the database.
- Outbox: capture saves the downscaled JPEG to IndexedDB first (`lib/outbox/`), then sends through the one shared sender (`send.ts`). The scan id is made at capture, so a repeat `POST /api/sync` is a no-op on the server. Sync runs on app start, on the `online` event, from "Sync now" and on a backoff timer; one run at a time per tab.
- Known issues in the merged review and outbox code (2026-10-31, from an automated review of PR #24; the first two spot-checked in the code, the rest not yet verified): a saved edit is not shown after a reload (`field-row.tsx` seeds its state once); `resolveReview` compares a trimmed value with an untrimmed reader value; a region with no reconciled fields counts as reviewed; the source crop can be cut off by `maxHeight`; the `recognition_event` write is not atomic with the review; the overlay turns green on any decision. Details in `docs/new-work.md`. Fix before relying on the review screen in the demo.

## Stack

Next.js (App Router), TypeScript strict, Tailwind, shadcn/ui (Radix primitives, restyled to our palette), lucide-react (icons), GSAP with `@gsap/react` (SAM mask reveal only), Supabase (Postgres and Storage, RLS on every table), Zod on every external input and every model output, IndexedDB via `idb`, Vitest (unit), Playwright (one happy-path e2e), Vercel. Package manager: pnpm. Prefer Server Components; use `"use client"` only for capture, the outbox, and the screens that poll or review (results page, review screen).

Next.js 16 with `cacheComponents`: anything that reads `params`, `searchParams` or other request data must sit inside `<Suspense>`. This version differs from older Next.js examples, so read the matching guide in `node_modules/next/dist/docs/` before using a Next.js API.

## Layout

- `app/` routes: `app/page.tsx` is the capture screen, `app/scans/[id]/page.tsx` the results and review page, `app/review-preview/page.tsx` the review screen on sample data (404 in Production), `app/api/sync/route.ts` the sync endpoint, `app/api/scans/[id]/route.ts` job status and results, `app/api/scans/[id]/review/route.ts` saves and reads reviews
- `components/ui/` shadcn components (button, badge, dialog), restyled to the palette; `components/capture/` (capture form, outbox list, `use-outbox`) and `components/scan/` (results, `review-workspace`, `field-row`, `source-crop`, `chart-photo`, `marks`) our own components
- `lib/models/` one adapter per model, each returning Zod-validated data; model IDs and base URLs come from env. `spark.ts` (region proposals and a reader), `baseten.ts` (the second reader), `sam.ts` (box refinement), `chat.ts` (shared chat-completions call, timeout and bounded retries), `reader.ts` (the shared read prompt), `mock.ts`, and `index.ts` (`getModelAdapters`)
- `lib/pipeline/` stages and orchestration (`run.ts`); pure functions in `reconcile.ts`, `bbox.ts` (client-safe) and `review.ts` (`resolveReview`); `budget.ts` is the per-scan call cap
- `lib/outbox/` IndexedDB queue and sync: `client.ts` (store and in-flight run), `runner.ts` (send oldest first), `send.ts` (the shared sender), `policy.ts` (backoff, due times), `types.ts`
- `lib/schemas/` Zod schemas shared by client and server (`review.ts` holds the review decisions)
- `lib/server/` Supabase client, store, `review-store.ts` and storage. Server only: no client file may import it, or `lib/env.ts`
- `lib/client/` browser-only helpers (photo downscale before upload)
- `lib/ui/` pure UI logic (status labels, polling backoff, field formatting, `review-state.ts`, `preview-fixture.ts`), unit tested
- `eval/` fixtures (`eval/fixtures/*.jpg` plus `*.json` ground truth: `smoke-chart-01`, `smoke-chart-02`, `hard-chart-01`), `eval/run.ts`, `eval/results.json`
- `docs/` holds `models-notes.md`, `new-work.md` (what was built, and when), `phone-test.md` (the real-phone smoke test and its result log), `phase-4-plan.md`, `BUILD_PLAN.md`, `eval-results.md`. `PRODUCT.md` (repo root) holds users, purpose, principles and the open product decisions

Data model (Supabase): `scans` (id, status, image_path, created_at), `regions` (id, scan_id, kind: table | handwriting | stamp | printed | header | signature, bbox, mask_path), `readings` (id, region_id, model, structured_json, latency_ms, error), `reviews` (id, region_id, final_json, field_status, edited, reviewed_at), `recognition_event` (id, region_id, readings snapshot, human_final, created_at).

## Shared field keys

The contract between model output, reconcile, the review screen, and the ground-truth files. Change it only when all three of us agree.

| Region | Keys |
|---|---|
| table | `row{n}.test`, `row{n}.value`, `row{n}.unit` |
| handwriting | `line{n}` |
| stamp | `stamp.present`, `stamp.text` |
| signature | `signature.present` |
| header | `header.patient_name`, `header.chart_no`, `header.date` |

`n` counts from 1, top to bottom. Unclear text is `null`, never a guess. A row only one reader found is `flagged` automatically.

## Environment variables

`META_API_KEY`, `META_API_BASE_URL`, `META_SPARK_MODEL`, `META_SAM_MODEL`, `BASETEN_API_KEY`, `BASETEN_MODEL_URL`, `BASETEN_MODEL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (all server only), `MAX_MODEL_CALLS_PER_SCAN` (cost guard; enforce it in code), `MOCK_MODELS` (`true` returns fixtures with no network; `false` in Production).

Format notes: `META_API_BASE_URL` is `https://api.meta.ai/v1` (no trailing slash or period; the adapters append the path). `BASETEN_MODEL_URL` is the full chat-completions endpoint, not just the base. Check shape without printing values: `awk -F= '/_URL=/{print $1, ($2 ~ /^https?:\/\//) ? "ok" : "NOT A URL"}' .env.local`. Smoke-script errors must never echo a value. `.env.local` may have `MOCK_MODELS=true`: a real-model check must run with `MOCK_MODELS=false` (a latency of 0 ms and no model calls counted is the tell that you got the mock).

Vercel: names must match exactly (`SUPABASE_URL`, not `NEXT_SUPABASE_URL`), and each variable needs both Production and Preview ticked. A variable scoped to Production only makes Preview deploys fail with `missing or invalid environment variables`. Changes reach only new deployments, so redeploy after editing them.

## Commands

`pnpm dev`, `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e`, `pnpm eval`. One real model call each, for checking a model: `pnpm smoke:spark`, `pnpm smoke:spark-open`, `pnpm smoke:sam`.

## How to work with me

- Before any feature larger than about an hour, state a short plan and wait for my OK.
- Small commits with conventional messages (`feat:`, `fix:`, `docs:`, `test:`). One branch per person: `tways/...`, `alex/...`, `adrian/...`. `main` must always deploy.
- Before saying a task is done, `pnpm typecheck && pnpm lint && pnpm test` must pass.
- No swallowed errors and no empty catch blocks. Surface failures in the UI with a clear state.
- Add short comments for non-obvious logic, saying why rather than what. When you make a non-trivial architecture choice, explain the tradeoff in your reply. I am learning the engineering underneath, not only shipping.
- Do not add dependencies without telling me why.
- Stay inside the task. Do not refactor unrelated files. From 8 PM PHT on Oct 30 the scope freeze in `docs/BUILD_PLAN.md` and the out-of-scope list below are binding.

## Out of scope

Auth and roles, multi-clinic tenancy, patient management, scheduling, billing, prescribing, e-signing, dosing, any treatment, diagnosis, or drug-safety output, native mobile apps, model training or fine-tuning, real patient data.

## Design direction

Paper-and-ink editorial, built for tired eyes in a bright clinic. Not a generic SaaS dashboard.

- Fonts: Fraunces (display), IBM Plex Sans (body), IBM Plex Mono (extracted values). Never Inter, Roboto, Arial, or system-ui as primary.
- Colors as CSS variables: paper `#F4EFE6`, ink `#1B1A17`, muted line `#D9D2C3`, verified green `#2F6B4F`, flag amber `#B7791F`, stamp red `#C8341F`. Color carries meaning only: green = models agreed, amber = needs a human, red = unreadable or failed.
- The review screen is the hero: source crop and both readings side by side, flagged fields impossible to miss, touch targets of at least 44px, works from 360px wide up to desktop.
- Motion only where it explains something: SAM masks animating in, status badge changes. Respect `prefers-reduced-motion`.
- shadcn: use only the components we need, mapped to the palette variables and Fraunces / IBM Plex. No default shadcn theme, no Inter. Keep the six palette variables in `app/globals.css` when running `shadcn init`.
- Amber `#B7791F` on paper is only about 3.2:1, below AA for text, so use amber as a fill or border with ink text, never as small text. Green (about 5.5:1) and red (about 4.6:1) pass.
- One 6px radius everywhere. Buttons and badges use the variants in `components/ui/`; targets are at least 44px tall (56px for the main capture action).
- Icons come from lucide-react only. Decorative icons get `aria-hidden`; an icon-only control gets an `aria-label`. Pair color with an icon or text (agreed = Check, flagged = TriangleAlert, unreadable = CircleX) so meaning never rests on color alone.
- GSAP is only for the SAM overlay reveal on the review screen (SAM boxes until masks are decodable): a lazy-loaded client component, `useGSAP`, and `gsap.matchMedia()` for reduced motion. Never in capture or the outbox. Status badges use CSS transitions.
- Accessibility: AA contrast, keyboard-operable review, a label on every control.

## Definition of done for a feature

Typed, Zod-validated at boundaries, loading and error states shown, works at 360px, covered by at least one test or eval fixture, and logged with its date in `docs/new-work.md`.

## Build plan

The build order lives in `docs/BUILD_PLAN.md`; this file only holds the rules. At the start of every session:

1. Read `docs/BUILD_PLAN.md` and find the current phase (the first phase whose "Done when" lines are not all true).
2. Work only on that phase. Do not start the next phase, and do not add features the phase does not list.
3. When a phase's "Done when" lines are all true, say so, log it in `docs/new-work.md` with the date, and stop for my confirmation.
4. If a task needs an API detail that is not in `docs/models-notes.md`, stop and ask. Never guess.
5. Deployment steps are in Phase 9 of the build plan. Never put a server secret in a `NEXT_PUBLIC_` variable, and never debug on `main` after Nov 3.

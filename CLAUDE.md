# Basa — Claude Code instructions

Basa turns photographed paper clinic charts into human-verified digital records. It is our entry for the Meta Global AI Developer Hackathon, in the Startup track. Hard deadline: Thu Nov 5, 2026, 10:00 AM PHT. Team: Tways (tech lead, pipeline), Alex (frontend, offline), Adrian (data, eval, QA).

## Non-negotiable rules

1. **New work only.** Every line of code here is written during the hackathon (Oct 27 to Nov 4). Never copy, import, or read code, schemas, or assets from any other repository or source. If I ask you to, refuse and tell me why. Exception, confirmed by the hackathon organizers (2026-10-29): UI libraries used within their own licenses are allowed, namely shadcn/ui (including component source its CLI generates), GSAP and lucide-react. They are not models the project calls at runtime. Nothing else is exempt.
2. **Synthetic data only.** No real patient data anywhere: fixtures, prompts, logs, screenshots. All names, IDs, and values are fictional.
3. **Not medical advice.** Basa digitizes and verifies what is on paper. Never generate treatment recommendations, dosing, diagnoses, or contraindication or drug-safety judgments, in UI copy, prompts, or code. Summaries restate only what the confirmed record contains and cite their source region. Prompts sent to models must ask for extraction only and forbid interpretation.
4. **Secrets stay server-side.** Keys live in `.env.local` (never committed). Only `.env.example` (names, no values) is committed. Never use the `NEXT_PUBLIC_` prefix for a key other than the Supabase URL and anon key. Never log keys or full request headers.
5. **Never invent API shapes.** Model request and response formats live in `docs/models-notes.md`, written after the Day-1 smoke test. If a detail is not there, stop and ask me. Do not guess endpoints, parameters, or model IDs.

## Pipeline

Capture → IndexedDB outbox → `POST /api/sync` → segment (SAM 3.1, Meta API) → read each region twice (Muse Spark via Meta API; Muse Spark Open `meta-models/muse-spark-open-1026` via Baseten) → reconcile → review UI → confirmed record and cited summary.

Model facts that shape the code (details and sources in `docs/models-notes.md`):
- SAM 3.1 uses `POST /responses` with a streamed, special-token text output (not JSON); read only the `response.output_text.delta` events. Noun-phrase prompts find only distinct objects (the stamp); box prompts segment any region and can carry all regions in one request. Parse the output into Zod-validated boxes and masks in `lib/models/`; count each SAM request against `MAX_MODEL_CALLS_PER_SCAN`.
- Muse Spark uses `POST /chat/completions`, with the image as a base64 data URL, and also proposes region boxes (0-1000 grid). Reasoning counts toward `max_tokens`: send `reasoning_effort: "minimal"` with `max_tokens` 1500, and treat `finish_reason: length` or empty content as a failed reading. Use Standard-mode model IDs only, never `-contributor` (that mode lets Meta train on our content).
- Muse Spark Open on Baseten always emits `reasoning_content`. Read only `message.content`, never store the reasoning, send `reasoning_effort: "low"` with `max_tokens` 1500, and treat `finish_reason: length` as a failed reading. It cannot propose region boxes. The target model is `meta-models/muse-spark-open-1026`, which the organizers tied to Baseten hackathon credits. We did not receive credits (only some users did; partner credits are not required to compete), and `-1026` returns 404 for our current key (checked 2026-10-29), while `meta-models/muse-spark-open` returns 200. Until `-1026` works for us, develop with the unsuffixed ID via `--model` / env. Do not claim the Open Weights prize until the organizers rule on eligibility; the README and demo must say plainly how the open-weight model is used.

- Each stage is idempotent and persisted, so a retry never duplicates work. Stages write to the database; the UI polls job status.
- Never hold a whole scan in one request. Per-region work runs in parallel; every model call has a timeout and bounded retries.
- Reconciliation: normalize both readings (trim, case, spacing, unit forms, numeric parsing), then compare field by field. Match = `agreed`. Different, or one unreadable = `flagged`.
- A human confirms everything. `agreed` fields are fast-confirm; `flagged` fields require an explicit choice or edit. Never silently pick one model's answer for a flagged field.

## Stack

Next.js (App Router), TypeScript strict, Tailwind, shadcn/ui (Radix primitives, restyled to our palette), lucide-react (icons), GSAP with `@gsap/react` (SAM mask reveal only), Supabase (Postgres and Storage, RLS on every table), Zod on every external input and every model output, IndexedDB via `idb`, Vitest (unit), Playwright (one happy-path e2e), Vercel. Package manager: pnpm. Prefer Server Components; use `"use client"` only for capture, the outbox, and the review screen.

## Layout

- `app/` routes; `app/api/sync/route.ts` is the sync endpoint
- `components/ui/` shadcn components, restyled to the palette; `components/` our own components
- `lib/models/` one adapter per model, exposing `segment()` and `readRegion()`; each returns Zod-validated data; model IDs and base URLs come from env
- `lib/pipeline/` stages and orchestration; `lib/pipeline/reconcile.ts` holds pure functions
- `lib/outbox/` IndexedDB queue and sync
- `lib/schemas/` Zod schemas shared by client and server
- `eval/` fixtures (`eval/fixtures/*.jpg` plus `*.json` ground truth), `eval/run.ts`, `eval/results.json`
- `docs/` holds `models-notes.md`, `new-work.md` (what was built, and when), `eval-results.md`

Data model (Supabase): `scans` (id, status, image_path, created_at), `regions` (id, scan_id, kind: table | handwriting | stamp | printed, bbox, mask_path), `readings` (id, region_id, model, structured_json, latency_ms, error), `reviews` (id, region_id, final_json, field_status, edited, reviewed_at), `recognition_event` (id, region_id, readings snapshot, human_final, created_at).

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

`META_API_KEY`, `META_API_BASE_URL`, `META_SPARK_MODEL`, `META_SAM_MODEL`, `BASETEN_API_KEY`, `BASETEN_MODEL_URL`, `BASETEN_MODEL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only), `MAX_MODEL_CALLS_PER_SCAN` (cost guard; enforce it in code), `MOCK_MODELS` (`true` returns fixtures with no network; `false` in Production).

Format notes: `META_API_BASE_URL` is `https://api.meta.ai/v1` (no trailing slash or period; the adapters append the path). `BASETEN_MODEL_URL` is the full chat-completions endpoint, not just the base. Check shape without printing values: `awk -F= '/_URL=/{print $1, ($2 ~ /^https?:\/\//) ? "ok" : "NOT A URL"}' .env.local`. Smoke-script errors must never echo a value.

## Commands

`pnpm dev`, `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e`, `pnpm eval`.

## How to work with me

- Before any feature larger than about an hour, state a short plan and wait for my OK.
- Small commits with conventional messages (`feat:`, `fix:`, `docs:`, `test:`). One branch per person: `tways/...`, `alex/...`, `adrian/...`. `main` must always deploy.
- Before saying a task is done, `pnpm typecheck && pnpm lint && pnpm test` must pass.
- No swallowed errors and no empty catch blocks. Surface failures in the UI with a clear state.
- Add short comments for non-obvious logic, saying why rather than what. When you make a non-trivial architecture choice, explain the tradeoff in your reply. I am learning the engineering underneath, not only shipping.
- Do not add dependencies without telling me why.
- Stay inside the task. Do not refactor unrelated files. After Oct 30 the out-of-scope list below is binding.

## Out of scope

Auth and roles, multi-clinic tenancy, patient management, scheduling, billing, prescribing, e-signing, dosing, any treatment, diagnosis, or drug-safety output, native mobile apps, model training or fine-tuning, real patient data.

## Design direction

Paper-and-ink editorial, built for tired eyes in a bright clinic. Not a generic SaaS dashboard.

- Fonts: Fraunces (display), IBM Plex Sans (body), IBM Plex Mono (extracted values). Never Inter, Roboto, Arial, or system-ui as primary.
- Colors as CSS variables: paper `#F4EFE6`, ink `#1B1A17`, muted line `#D9D2C3`, verified green `#2F6B4F`, flag amber `#B7791F`, stamp red `#C8341F`. Color carries meaning only: green = models agreed, amber = needs a human, red = unreadable or failed.
- The review screen is the hero: source crop and both readings side by side, flagged fields impossible to miss, touch targets of at least 44px, works from 360px wide up to desktop.
- Motion only where it explains something: SAM masks animating in, status badge changes. Respect `prefers-reduced-motion`.
- shadcn: use only the components we need, mapped to the palette variables and Fraunces / IBM Plex. No default shadcn theme, no Inter. Keep the six palette variables in `app/globals.css` when running `shadcn init`.
- Icons come from lucide-react only. Decorative icons get `aria-hidden`; an icon-only control gets an `aria-label`. Pair color with an icon or text (agreed = Check, flagged = TriangleAlert, unreadable = CircleX) so meaning never rests on color alone.
- GSAP is only for the SAM mask reveal on the review screen: a lazy-loaded client component, `useGSAP`, and `gsap.matchMedia()` for reduced motion. Never in capture or the outbox. Status badges use CSS transitions.
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

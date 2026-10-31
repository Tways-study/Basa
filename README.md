# Basa

Photograph a paper clinic chart. Two Meta models read it. A person settles every number they disagree on.

Basa turns photographed paper clinic charts into human-verified digital records. It is our entry for the **Meta Global AI Developer Hackathon** (Build for Your World).

## What the name means

**Basa** is Filipino for **"read."**

We are Filipino developers working from the Philippines, and the name is the whole idea in one word. A paper chart has to be read before it can be trusted: two Meta models each read every region, and then a person reads the original ink beside both readings and confirms what it says. Basa does not replace that last reading. It makes it faster and harder to get wrong.

> **New codebase, nothing reused, synthetic data only.**
> Every line of code here was written during the hackathon (Oct 27 to Nov 4, 2026). No code, schemas, or assets come from any other repository. No real patient data exists anywhere in this project: every name, ID, and value in fixtures, prompts, logs, and screenshots is fictional.

**Team:** Tways (tech lead, pipeline) · Alex (frontend, offline) · Adrian (data, eval, QA)
**Track:** Startup (confirmed by the organizers)
**Hard deadline:** Thu Nov 5, 2026, 10:00 AM PHT · **Our submit target:** Wed Nov 4, 8:00 PM PHT

## Not medical advice

Basa digitizes and verifies what is on paper. It never produces treatment recommendations, dosing, diagnoses, or contraindication or drug-safety judgments. Summaries restate only what the confirmed record contains, and every line cites its source region on the scan. Prompts sent to models ask for extraction only and forbid interpretation.

## The problem

Many clinics still run on paper. A patient's whole history can live in ink, a rubber stamp, and handwriting on a creased page, and it is one bad reading away from a wrong number.

Plain OCR does not solve this safely. It reads a messy chart confidently and sometimes wrongly (7.2 read as 1.2), and gives no signal about which values to doubt. In a medical record, a confident wrong number is worse than a blank. Clinic internet is also unreliable, so a tool that needs a connection to capture a chart fails where it is needed most.

## What Basa solves

- **Errors no longer pass silently.** Segmentation splits the page into regions, so no model has to read one messy page all at once. Two independent models read each region, and Basa flags every field where they disagree instead of trusting either one.
- **A person stays in control.** The reviewer sees the original ink beside both readings and decides each flagged field. Every correction is logged, and Basa never silently picks a model's answer.
- **Capture works offline.** Photos are saved on the device first and sync on their own when the connection returns.
- **Every line is traceable.** The record restates only what is on the paper, and each summary line cites its source region on the scan.
- **No clinical judgment is added.** Basa digitizes and verifies. It gives no advice, so it makes the paper trustworthy without replacing the clinician.

## Impact

- **Faster review, focused attention.** Fields where both models agree are fast-confirm, so a person spends time only on the disagreements.
- **Fewer wrong values reach the record.** The headline measure is the error catch rate: the share of wrong fields Basa flags for review. It is reported next to review burden, the share of correct fields flagged by mistake, so the gain is not bought by flagging everything.
- **Claims backed by evidence.** Basa is scored against a single whole-image read on 20 held-out synthetic charts. The real numbers are published in `docs/eval-results.md`, including an honest result if Basa does not win.
- **Built for the clinics paper still runs.** It works on a phone, at 360px wide, with unreliable connectivity, and with readable, high-contrast screens made for tired eyes in a bright clinic.

## How it works

```
Capture → IndexedDB outbox → POST /api/sync → segment → read twice → reconcile → review → record
```

| # | Stage | Where | What it does |
|---|---|---|---|
| 1 | Capture | Device | Saves the photo on the phone first, even with no signal |
| 2 | Outbox | Device (IndexedDB via `idb`) | Queue that sends scans when the connection returns |
| 3 | `POST /api/sync` | Server (Vercel) | Validates and stores the scan, starts processing |
| 4 | Segment | Muse Spark and SAM 3.1 (Meta API) | Muse Spark proposes boxes for the header, table, handwriting, stamp and signature; one SAM request tightens them. Boxes only: SAM masks are not decoded (format undocumented) |
| 5 | Two readers | Muse Spark (Meta API) and Muse Spark Open `meta-models/muse-spark-open` (Baseten) | Each reads every region independently and returns JSON |
| 6 | Reconcile | Server, pure function | Normalizes both readings, then compares field by field |
| 7 | Review | Device | Source crop beside both readings; a person decides every flagged field |
| 8 | Record | Supabase | Confirmed values with provenance, and a summary that cites its source region |

**Reconciliation rules.** Both readings are normalized (trim, case, spacing, unit forms, numeric parsing). A match is `agreed`. A difference, or a field one reader could not read, is `flagged`. `agreed` fields are fast-confirm. `flagged` fields require an explicit choice or edit, and Basa never silently picks one model's answer.

**Reliability.** Each stage is idempotent and persisted, so a retry never duplicates work. A whole scan is never held in one request: per-region work runs in parallel, every model call has a timeout and bounded retries, and `MAX_MODEL_CALLS_PER_SCAN` caps cost per scan. The UI polls job status.

### How and where Muse Spark Open is used

Muse Spark Open (`meta-models/muse-spark-open`, an open-weight model) is the **second, independent reader** in Basa. It runs on Baseten, through our own Baseten account and key (server side only), and the organizers confirmed on 2026-10-31 that this unsuffixed model counts for the Open Weights requirement.

- **What it does:** for every region of every chart (header, table, handwriting, stamp, signature) it reads the cropped region and returns JSON in the shared field keys. It runs in parallel with Muse Spark (Meta API) on the same crop.
- **What it does not do:** it does not propose region boxes (Muse Spark does that, and SAM 3.1 tightens the boxes), and it never writes the record. Its answer is compared with Muse Spark's by the reconcile step. Where the two differ, the field is flagged and a person decides.
- **How it is called:** `POST` to the Baseten chat-completions endpoint with the image as a base64 data URL, `reasoning_effort: "low"`, `max_tokens` 1500. Only `message.content` is read; its reasoning text is never stored or shown.
- **Why it matters to the product:** the error-catch idea depends on two independent readers. Without the open-weight reader there is nothing to disagree with.

**Provenance (to add before submission):** Baseten run logs for our calls, screen captures of the Baseten dashboard and of the review screen showing both readers, and sample outputs (the stored readings for a scan). These are not in the repo yet.

Job states: `queued → segmenting → reading → reconciling → needs_review → done`, with `failed` reachable from any state.

### Shared field keys

The contract between model output, reconcile, the review screen, and the ground-truth files. `n` counts from 1, top to bottom. Unclear text is `null`, never a guess. A row only one reader found is flagged automatically.

| Region | Keys |
|---|---|
| table | `row{n}.test` · `row{n}.value` · `row{n}.unit` |
| handwriting | `line{n}` |
| stamp | `stamp.present` · `stamp.text` |
| signature | `signature.present` |
| header | `header.patient_name` · `header.chart_no` · `header.date` |

## How we prove it works

Thirty synthetic charts (10 dev, 20 held-out test, 10 marked hard), scored against typed ground truth. Prompts are tuned on the dev set only; the held-out set is run once at the end for the final numbers.

| Condition | What runs |
|---|---|
| A. Baseline | One whole-image read |
| B. Segmented | SAM regions, one reader each |
| C. Basa | SAM, two readers, reconcile and flag |

Metrics: field accuracy, table row recall, hallucinated rows, **error catch rate** (the share of wrong fields Basa flags; the headline number), and review burden (the share of correct fields flagged by mistake). Results are written to `eval/results.json` and `docs/eval-results.md`. If condition C does not beat A, the honest result is documented.

## Stack

Next.js (App Router) · TypeScript (strict) · Tailwind · shadcn/ui (Radix) · lucide-react · Supabase (Postgres and Storage, RLS on every table) · Zod on every external input and model output · IndexedDB via `idb` · Vitest · Playwright · Vercel · pnpm

Server Components by default; `"use client"` only for capture, the outbox, and the screens that poll or review (results page, review screen).

## Project layout

```
app/                    routes: capture (/), results and review (/scans/[id]), /review-preview (sample data, 404 in Production), /api/sync, /api/scans/[id], /api/scans/[id]/review
components/             shadcn components in ui/, our own in capture/ (form, outbox list) and scan/ (results, review screen)
lib/models/             one adapter per model (spark, baseten, sam), a shared chat call and read prompt, mock; Zod-validated
lib/pipeline/           stages and orchestration; reconcile.ts and bbox.ts hold pure functions; budget.ts is the call cap
lib/outbox/             IndexedDB queue, backoff and the shared sender
lib/schemas/            Zod schemas shared by client and server
lib/server/             Supabase client, store and storage (server only)
lib/client/             browser-only helpers (photo downscale before upload)
lib/ui/                 pure UI logic: status, polling backoff, field formatting
eval/                   fixtures (*.jpg + *.json ground truth), manifest.json, run.ts, results.json
supabase/migrations/    database migrations
docs/                   models-notes.md, new-work.md, phone-test.md, BUILD_PLAN.md, eval-results.md
PRODUCT.md              users, purpose, principles and open product decisions
```

### Data model (Supabase)

`scans` (id, status, image_path, created_at) · `regions` (id, scan_id, kind: table | handwriting | stamp | printed | header | signature, bbox, mask_path) · `readings` (id, region_id, model, structured_json, latency_ms, error) · `reviews` (id, region_id, final_json, field_status, edited, reviewed_at) · `recognition_event` (id, region_id, readings snapshot, human_final, created_at)

`readings` has a unique constraint on `(region_id, model)` so retries cannot duplicate. RLS is on every table with no anon policies; the server uses the service role key and the browser never reads these tables directly. The storage bucket is private, accessed through server-created signed URLs.

## Getting started

```bash
pnpm install
cp .env.example .env.local   # fill in values; never commit .env.local
pnpm dev
```

To work without credentials, set `MOCK_MODELS=true`: every model adapter returns fixture data with no network call.

### Environment variables

| Variable | Exposed to browser? |
|---|---|
| `META_API_KEY`, `META_API_BASE_URL`, `META_SPARK_MODEL`, `META_SAM_MODEL` | No |
| `BASETEN_API_KEY`, `BASETEN_MODEL_URL`, `BASETEN_MODEL` | No |
| `SUPABASE_SERVICE_ROLE_KEY` | **Never** |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | No |
| `MAX_MODEL_CALLS_PER_SCAN` | No |
| `MOCK_MODELS` | No (`false` in Production) |

Only `.env.example` (names, no values) is committed. Model request and response shapes live in `docs/models-notes.md`, each marked as observed in a smoke test or documented by the provider.

Value formats: `META_API_BASE_URL` is `https://api.meta.ai/v1` (no trailing slash or period). `BASETEN_MODEL_URL` is the full chat-completions endpoint, not just the base URL. `BASETEN_MODEL` is the model name (`meta-models/muse-spark-open`). Meta keys start with `LLM_`.

### Model smoke tests

`pnpm smoke:spark-open`, `pnpm smoke:spark` and `pnpm smoke:sam` call each model once from the server side and print the raw response (never keys or headers). With no image argument they send a text-only call to check the key, URL and model name; add a synthetic chart image as the first argument for the image call. Record what you see in `docs/models-notes.md`.

### Commands

| Command | Purpose |
|---|---|
| `pnpm dev` | Start the dev server |
| `pnpm build` | Production build |
| `pnpm typecheck` | Type check |
| `pnpm lint` | Lint |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm test:e2e` | Happy-path end-to-end test (Playwright, mock mode) |
| `pnpm eval` | Run the eval harness |

Before calling work done: `pnpm typecheck && pnpm lint && pnpm test` must pass.

## Design direction

Paper-and-ink editorial, built for tired eyes in a bright clinic.

- **Fonts:** Fraunces (display), IBM Plex Sans (body), IBM Plex Mono (extracted values)
- **Color carries meaning only:** paper `#F4EFE6`, ink `#1B1A17`, muted line `#D9D2C3`; verified green `#2F6B4F` = models agreed, flag amber `#B7791F` = needs a human, stamp red `#C8341F` = unreadable or failed
- **The review screen is the hero:** source crop and both readings side by side, flagged fields impossible to miss, touch targets of at least 44px, works from 360px wide up to desktop
- **Motion** only where it explains something (the SAM box overlay appearing, status badge changes), and it respects `prefers-reduced-motion`
- **Accessibility:** AA contrast, keyboard-operable review, a label on every control

## Build plan

The sequence lives in [`docs/BUILD_PLAN.md`](./docs/BUILD_PLAN.md); the rules live in [`CLAUDE.md`](./CLAUDE.md). A phase is finished only when every "Done when" line is true and it is logged in `docs/new-work.md`.

**Status (Oct 31):** phases 0, 1, 2 and 4 are done. Phase 3 is open on one line: a real phone photo on mobile data (see `docs/phone-test.md`). Phases 5 (review UI) and 6 (offline outbox) are built and merged (PR #24) but not done: they still need a real-Supabase review run and a real phone, and an automated review found issues to fix first (see `docs/new-work.md`). Phase 7 (eval) is next to start. The audit fixes are merged (PR #26) and 127 tests pass. The first reviews have been saved against the real Supabase (Oct 31, on a computer, not a phone): a reader pick, a Can't be read decision and a typed value all stored with the right source. The steps to close Phases 3, 5 and 6 are in the phone test sheet.

| Phase | Owner | When (PHT) | Done when |
|---|---|---|---|
| 0. Repo, scaffold, accounts | Tways | Oct 27 | A push to `main` deploys a blank page; typecheck, lint, and tests pass on the empty project |
| 1. Smoke test and contracts | Tways | Oct 28, by noon | All three models return parseable output; schemas and reconcile merged; mock mode runs with no credentials |
| 2. Database and storage | Adrian | Oct 28 | Anon-key reads and writes refused on every table; bucket is private |
| 3. Walking skeleton | Tways, Alex | Oct 29 | A phone photo reaches a stored result on the live URL; no secret in browser traffic |
| 4. Full pipeline | Tways | Oct 30 | Two readers disagree and produce flagged fields; a killed scan resumes without duplicates; call cap works. **Scope freeze, 8 PM** |
| 5. Review UI | Alex | Oct 29 to 31 | A scan can be reviewed end to end at 360px and on a real phone |
| 6. Offline outbox | Alex | Oct 30 to Nov 1 | Capture offline, reconnect, it syncs once with no duplicate |
| 7. Eval harness | Adrian, Tways | Oct 28 to Nov 3 | `pnpm eval` writes results; final numbers come from held-out charts only |
| 8. Hardening | Tways, Alex | Nov 1 to 2 | Demo chart runs three times in a row; all checks pass. **Feature freeze Nov 3, noon** |
| 9. Deployment checklist | Tways | Repeat before each milestone | See `docs/BUILD_PLAN.md` |

### If we fall behind

Cut in this order, decided in advance:

1. Service worker caching and motion polish
2. Summary becomes a plain cited list
3. Handwriting regions (keep tables, stamps, headers)
4. Move the open-weights reader from Baseten to Modal if Baseten fails twice
5. Second reader becomes Muse Spark with a different prompt (drop the Open Weights claim)
6. Muse Spark proposes region boxes if SAM output is unusable

## Out of scope

Auth and roles, multi-clinic tenancy, patient management, scheduling, billing, prescribing, e-signing, dosing, any treatment, diagnosis, or drug-safety output, native mobile apps, model training or fine-tuning, real patient data.

## Deployment

Deployed on Vercel; every push to `main` deploys, and `main` must always deploy. The full checklist (migrations, security verification, Preview deploy, `maxDuration`, real-phone smoke test, secret scan) is Phase 9 of [`docs/BUILD_PLAN.md`](./docs/BUILD_PLAN.md). Rollback: promote the last known-good deployment in Vercel first, then debug on a branch. No debugging on `main` after Nov 3.

## Contributing

One branch per person: `tways/...`, `alex/...`, `adrian/...`. Small commits with conventional messages (`feat:`, `fix:`, `docs:`, `test:`). Log every finished feature with its date in `docs/new-work.md`.

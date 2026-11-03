# Basa

**Photograph a paper clinic chart. Two Meta models read it. A person settles every value they disagree on.**

Basa turns photographed paper clinic charts into human-verified digital records. It is our entry for the **Meta Global AI Developer Hackathon** (Startup track, Build for Your World).

**Basa** is Filipino for **"read."** A paper chart has to be read before it can be trusted. Two models each read every region of the chart, then a person reads the original ink beside both readings and confirms what it says. Basa does not replace that last reading. It makes it faster and harder to get wrong.

> **New codebase, nothing reused, synthetic data only.** Every line of code was written during the hackathon (Oct 27 to Nov 4, 2026), with no code, schemas or assets from any other repository. No real patient data exists anywhere in this project: every name, ID and value in fixtures, prompts, logs and screenshots is fictional.
>
> The one exception, confirmed by the hackathon organizers on 2026-10-29: UI libraries used within their own licenses, namely shadcn/ui (including the component source its CLI generates), GSAP and lucide-react. They are not models the project calls at runtime.

> **Not medical advice.** Basa digitizes and verifies what is on paper. It never produces treatment recommendations, dosing, diagnoses, or contraindication or drug-safety judgments. Summaries restate only what the confirmed record contains and cite their source region. Prompts sent to models ask for extraction only and forbid interpretation.

---

## What problem it hopes to solve

Many clinics still run on paper. A patient's history can live in ink, a rubber stamp and handwriting on a creased page, and it is one bad reading away from a wrong number.

Plain OCR does not solve this safely. It reads a messy chart confidently and sometimes wrongly (7.2 read as 1.2), and it gives no signal about which values to doubt. In a medical record, a confident wrong number is worse than a blank. Clinic internet is also unreliable, so a tool that needs a connection to capture a chart fails where it is needed most.

Basa's answer:

- **Errors no longer pass silently.** Two independent models read each region, and every field where they disagree is flagged instead of trusting either one.
- **A person stays in control.** The reviewer sees the original ink beside both readings and decides each flagged field. Basa never silently picks a model's answer.
- **Capture works offline.** Photos are saved on the device first and sync on their own when the connection returns.
- **Every line is traceable.** The record restates only what is on the paper, and each summary line cites its source region on the scan.

## Intended use

Basa is for **mixed clinic staff**, not one job title: whoever is free photographs a paper chart, and a different person may review it. They work in a bright clinic, often on a phone, tired and short of time, and they are not technical. Mobile web is the main surface (it works from 360px wide); the review screen also works on desktop.

The flow: photograph a chart, wait about 15 to 45 seconds while it is read, review the fields (fields both models agreed on are quick to confirm, fields they disagree on need an explicit choice or typed value), and save. Once every field is confirmed, Basa shows a cited summary and offers a printed patient copy, so the confirmed record can travel to people who have no Basa.

Success is a confirmed record in which every value was seen by a person beside the part of the photo it came from. Basa is a digitizing and verification aid. It is not a diagnostic tool, a clinical decision tool, or a replacement for the clinician.

---

## Description of the technology

Basa is a Next.js web app backed by Supabase, calling three models through two providers.

| Layer | Technology | Why |
|---|---|---|
| App | Next.js 16 (App Router), TypeScript strict, Tailwind, shadcn/ui, lucide-react | One codebase for the phone UI and the server routes. Server Components by default, with `"use client"` only for capture, the outbox and the screens that poll or review. Strict types catch shape mistakes before they reach a patient record. |
| Segmentation | Muse Spark (Meta API) proposes region boxes; SAM 3.1 (Meta API) tightens them in one request | A chart is not one block of text. Splitting it into a header, table, handwriting, stamp and signature means no model has to read a whole messy page at once. |
| Reader 1 | Muse Spark (Meta API) | A strong multimodal reader that returns JSON in our shared field keys. |
| Reader 2 | Muse Spark Open, `meta-models/muse-spark-open`, on Baseten | An independent second reader. The disagreement between two readers is the signal that a value needs a person. It is also the open-weight model for the Best Build on Meta Open Weight Models category (see below). |
| Validation | Zod on every external input and every model output | Models return text. Zod turns it into checked data or a visible failed reading, never a silent guess. |
| Storage | Supabase (Postgres and Storage), RLS on every table, private bucket | Every stage is stored, so a retry never duplicates work. The browser never reads or writes the database. |
| Offline | IndexedDB via `idb` | A phone photo must survive a lost connection, a closed tab and a restart. |
| Hosting | Vercel | Every push to `main` deploys. |
| Testing | Vitest (unit), Playwright (one happy-path e2e), an eval harness | See "How we check it" below. |

### How and where Muse Spark Open is used

Muse Spark Open is the **second, independent reader**. It runs on Baseten through our own Baseten account and key (server side only). The organizers confirmed on 2026-10-31 that this unsuffixed model counts for the Open Weights requirement.

- **What it does:** for every region of every chart (header, table, handwriting, stamp, signature) it reads the cropped region and returns JSON in the shared field keys. It runs in parallel with Muse Spark on the same crop.
- **What it does not do:** it does not propose region boxes, and it never writes the record. Its answer is compared with Muse Spark's by the reconcile step, and where the two differ the field is flagged for a person.
- **How it is called:** `POST` to the Baseten chat-completions endpoint with the image as a base64 data URL, `reasoning_effort: "low"`, `max_tokens` 1500. Only `message.content` is read. Its reasoning text is never stored or shown.
- **Why it matters:** the error-catch idea depends on two independent readers. Without the open-weight reader there is nothing to disagree with.

**Provenance.** [`docs/provenance/open-weights-readings.json`](docs/provenance/open-weights-readings.json) holds every reading Muse Spark Open returned in the one held-out eval run (2026-11-02, 13:33 to 13:41 UTC; 12 synthetic charts, 60 region readings, 253 fields, no errors, latency 1.1 to 8.3 s, median 2.1 s): field keys and values, latency and any error, and nothing else.

Captures, all synthetic data, taken 2026-11-03:

- [`baseten-usage-by-day-2026-11-03.png`](docs/provenance/baseten-usage-by-day-2026-11-03.png): the Baseten Model APIs usage page. One model, Muse Spark Open, with spend on 11/01, 11/02 and 11/03 (139.6K uncached input, 42.6K cached input and 57.3K output tokens in total). These are daily totals, not per-request logs; Baseten's dashboard did not give us a per-request log for the hosted Model API.
- [`baseten-budget-2026-11-03.png`](docs/provenance/baseten-budget-2026-11-03.png): the workspace's monthly usage ($0.36) against its $5.00 budget. Billing contact details are cropped out.
- [`review-screen-both-readers.png`](docs/provenance/review-screen-both-readers.png): the review screen on sample data (`/review-preview`), showing Muse Spark and Muse Spark Open side by side on a field where they disagree. It is a design preview, not a stored scan.

---

## Description of the process

```
Capture → IndexedDB outbox → POST /api/sync → segment → read twice → reconcile → review → record
```

| # | Stage | Where | What it does | Why |
|---|---|---|---|---|
| 1 | Capture | Device | Saves the downscaled photo on the phone first, even with no signal | A photo taken offline must not be lost |
| 2 | Outbox | Device (IndexedDB) | Queue that sends scans when the connection returns. The scan id is made at capture | A repeat send is a no-op on the server, so a flaky connection cannot create duplicates |
| 3 | `POST /api/sync` | Server (Vercel) | Validates and stores the scan, starts processing | Nothing unvalidated enters the pipeline |
| 4 | Segment | Muse Spark and SAM 3.1 | Muse Spark proposes boxes; one SAM request tightens them. Boxes only | Reading small regions is more reliable than reading one messy page |
| 5 | Two readers | Muse Spark and Muse Spark Open | Each reads every region independently and returns JSON | Two independent answers make a mistake visible |
| 6 | Reconcile | Server, pure function | Normalizes both readings (trim, case, spacing, unit forms, numbers), then compares field by field | A match is `agreed`; a difference, or a field one reader could not read, is `flagged` |
| 7 | Review | Device | Source crop beside both readings. A person decides every flagged field | "Agreed" means the readers matched, not that the value is right, so the source is always in view |
| 8 | Record | Supabase | Confirmed values with provenance, and a summary that cites its source region | The record is only ever what a person confirmed |

**A person confirms everything.** `agreed` fields are fast-confirm. `flagged` fields require an explicit choice or edit, and a flagged field never has a preselected value. "Can't be read" is a stored decision (`null`), never a guess.

**Reliability.** Each stage is idempotent and persisted. A whole scan is never held in one request: per-region work runs in parallel, each reader has its own lanes, every model call has a 20 s timeout and bounded retries, and the whole run has one 100 s deadline. Past the deadline, unfinished readings are stored as failed ("Ran out of time"), so a slow model ends in review or a clear failure, never a scan stuck on "Reading". A "Read again" action redoes only the failed readings. `MAX_MODEL_CALLS_PER_SCAN` caps cost per scan.

**Cited summary.** After the record is saved, a fixed template restates the person's final answers, one line per field or table row, each citing its region ("Region 2, Table"). It never uses a reader's raw output and has no wording of its own, so it cannot add advice or inference.

Job states: `queued → segmenting → reading → reconciling → needs_review → done`, with `failed` reachable from any state.

### Shared field keys

The contract between model output, reconcile, the review screen and the ground-truth files. `n` counts from 1, top to bottom. Unclear text is `null`, never a guess. A row only one reader found is flagged automatically.

| Region | Keys |
|---|---|
| table | `row{n}.test` · `row{n}.value` · `row{n}.unit` |
| handwriting | `line{n}` |
| stamp | `stamp.present` · `stamp.text` |
| signature | `signature.present` |
| header | `header.patient_name` · `header.chart_no` · `header.date` |

---

## How the project came about

We are Filipino developers working from the Philippines, and paper charts are an everyday fact of clinic life here. The Meta Global AI Developer Hackathon gave us a reason to ask a narrow question: with strong vision models now available, can a clinic photograph a chart and get a record it can trust?

Our first instinct was "have a model read the chart." The idea that shaped the project came from what is wrong with that: a single reader that is confidently wrong is dangerous in a medical record. So Basa is built around disagreement. Two readers, a reconcile step that flags where they differ, and a person who confirms everything. The name says it: the last reading is a human one.

## The motivation

- A wrong number in a medical record costs more than a blank one, so the goal is a reader whose doubt is visible, not a reader that is merely accurate on average.
- Clinics where paper still runs have unreliable internet, shared phones and tired staff. A tool for them has to capture offline, work on a small screen and ask for few decisions at a time.
- We wanted the safety to come from the design (two readers, source beside every value, a human in the loop, no clinical output), not from a promise that the model is good enough.

---

## How we check it

Twenty synthetic charts (8 dev, 12 held-out, 8 marked hard) with typed ground truth. Prompts were tuned on the dev set only and frozen at commit `cdc18fb`. The held-out set was run **once**, on 2026-11-02, for the final numbers.

| Condition | What runs |
|---|---|
| A. Baseline | One whole-image read |
| B. Segmented | SAM regions, one reader each |
| C. Basa | SAM, two readers, reconcile and flag |

**Held-out result (one run, 252 fields):**

| | Fields right with no person involved | Wrong values left after a person settles every flag |
|---|---|---|
| A. Whole-image read | 248 | 4 |
| B. Segmented, one reader | 246 | 6 |
| C. Basa | 239 | 3 |

Basa flagged 3 of its main reader's 6 errors for a person. Three fields were agreed by both readers but wrong, which reconcile cannot catch. **We do not claim Basa is more accurate than a single read:** 3 against 4 wrong fields of 252 is a gap inside run-to-run noise. What Basa adds is the flagging and the visible source. Full counts and definitions are in [`docs/eval-results.md`](docs/eval-results.md), and the tuning log is in [`docs/eval-tuning.md`](docs/eval-tuning.md).

## Limitations

Stated plainly, because a verification tool should be honest about what it has not verified:

- **No clear accuracy win.** See the eval above. The value is flagging and traceability, not higher raw accuracy.
- **Agreed does not mean right.** Both readers can match on a wrong value (3 of 252 fields in the held-out run). Only the person looking at the source catches those, which is why the crop is always shown.
- **Synthetic data only.** No real patient data, no real clinic photos. Three held-out charts are phone photographs of a *screen* showing a generated chart (no printer was available), so they carry moiré and glare, not paper creases and clinic light. We have no user testing, no clinic, no pilot.
- **Small eval.** 12 held-out charts, one run. Read the counts, not only the percentages.
- **Both readers are Meta models.** They may share blind spots that two unrelated readers would not.
- **Boxes, not masks.** SAM 3.1 returns masks in a byte format that is not in any documentation we may use, so we parse but do not decode them. The review overlay draws SAM boxes.
- **Model latency varies.** Calls normally take 1 to 3 s, but a call on either provider sometimes hangs. A scan can take 20 to 45 s, and a failed reading is shown as failed and can be read again.
- **Offline covers capture, not opening the app.** There is no service worker (out of scope), so reopening the address while offline fails by design. The photo is safe in IndexedDB and sends when the app is next opened online.
- **Phone testing used WebKit.** The real-phone runs used an iPhone with Brave (WebKit, the same engine as Safari). The Safari app itself, including its print preview for the patient copy, was not tested.
- **Long review screen.** A 20-field chart is long to scroll on a phone, and we chose not to collapse agreed fields because it would hide values before a bulk confirm.
- **No auth or roles.** The printed copy has a blank handwritten "Reviewed by" line because there is no login.

Out of scope: auth and roles, multi-clinic tenancy, patient management, scheduling, billing, prescribing, e-signing, dosing, any treatment, diagnosis or drug-safety output, native mobile apps, model training or fine-tuning, real patient data.

## Challenges

- **Reasoning ate the answer.** Both models spend tokens on reasoning before they answer. With too small a limit the reading came back empty. We send low reasoning effort with `max_tokens` 1500 and treat `finish_reason: length` as a failed reading.
- **A box that ends too early makes both readers wrong together.** A box clipped a little short of the text made both readers drop the same words and still agree, so reconcile could not flag it. Readers now see the box grown by 20% of its own size, checked on a hard chart and on three screen photos.
- **Prompt wording changed the answer's shape.** A one-key schema plus one common word in the preamble made Muse Spark answer under the wrong key about two runs in three. Read prompts now give an exact JSON shape per region kind, and a reading that breaks the shared keys is a failed reading, never silently repaired. Further wording changes had no measurable effect, so prompts are frozen.
- **Undocumented formats.** SAM's streamed special-token output and its mask encoding are not JSON and not fully documented. We read only the streamed text events, parse into Zod-validated records, and did not guess the mask format.
- **Scans stuck on "Reading".** On 2026-11-03 production scans never finished because model calls hung and the platform killed the function mid-read. We first blamed one provider, then found both hang now and then. The fix: one run deadline, per-call timeouts, a lane pool per reader, unfinished work stored as failed, and a "Try reading again" action.
- **WebKit refuses a Blob in a private tab.** Saving a photo offline failed on a real iPhone. We now store the photo as raw bytes plus its type and rebuild the Blob on read.
- **Showing doubt without overwhelming a tired person.** Flagged-first ordering, a source crop beside every value, and meaning carried by icon and text as well as color (green = agreed, amber = needs a human, red = unreadable or failed).

---

## Developer reference

### Getting started

```bash
pnpm install
cp .env.example .env.local   # fill in values; never commit .env.local
pnpm dev
```

To work without credentials, set `MOCK_MODELS=true` (exactly that text): every model adapter returns fixture data with no network call.

### Environment variables

| Variable | Exposed to browser? |
|---|---|
| `META_API_KEY`, `META_API_BASE_URL`, `META_SPARK_MODEL`, `META_SAM_MODEL` | No |
| `BASETEN_API_KEY`, `BASETEN_MODEL_URL`, `BASETEN_MODEL` | No |
| `SUPABASE_SERVICE_ROLE_KEY` | **Never** |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | No |
| `MAX_MODEL_CALLS_PER_SCAN` | No |
| `MOCK_MODELS` | No (`false` in Production) |

Only `.env.example` (names, no values) is committed. Model request and response shapes live in `docs/models-notes.md`. `META_API_BASE_URL` is `https://api.meta.ai/v1` (no trailing slash). `BASETEN_MODEL_URL` is the full chat-completions endpoint. `BASETEN_MODEL` is `meta-models/muse-spark-open`.

### Commands

| Command | Purpose |
|---|---|
| `pnpm dev` | Start the dev server |
| `pnpm build` | Production build |
| `pnpm typecheck` | Type check |
| `pnpm lint` | Lint |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm test:e2e` | Happy-path end-to-end test (Playwright, sample-data review screen) |
| `pnpm eval` | Run the eval harness (`MOCK_MODELS=false pnpm eval --split=dev`; the held-out run was already made once) |
| `pnpm smoke:spark`, `smoke:spark-open`, `smoke:sam` | One real call to each model, printing the raw response (never keys or headers) |

Before calling work done: `pnpm typecheck && pnpm lint && pnpm test` must pass.

### Project layout

```
app/                    routes: capture (/), results and review (/scans/[id]), /review-preview (sample data, 404 in Production), /api/sync, /api/scans/[id], .../review, .../resume
components/             shadcn components in ui/, our own in capture/ and scan/
lib/models/             one adapter per model (spark, baseten, sam), shared chat call and read prompt, mock; Zod-validated
lib/pipeline/           stages and orchestration; reconcile.ts, bbox.ts and review.ts hold pure functions; budget.ts is the call cap
lib/outbox/             IndexedDB queue, backoff and the shared sender
lib/schemas/            Zod schemas shared by client and server
lib/server/             Supabase client, store and storage (server only)
lib/client/             browser-only helpers (photo downscale before upload)
lib/ui/                 pure UI logic: status, polling backoff, field formatting, review ordering, summary, printable record
eval/                   fixtures (*.jpg + *.json ground truth), manifest.json, run.ts, results.json
supabase/migrations/    database migrations
docs/                   models-notes.md, new-work.md, phone-test.md, BUILD_PLAN.md, eval-results.md, eval-tuning.md, provenance/
PRODUCT.md              users, purpose, principles and open product decisions
```

### Data model (Supabase)

`scans` (id, status, image_path, created_at) · `regions` (id, scan_id, kind, bbox, mask_path) · `readings` (id, region_id, model, structured_json, latency_ms, error) · `reviews` (id, region_id, final_json, field_status, edited, reviewed_at) · `recognition_event` (id, region_id, readings snapshot, human_final, created_at)

`readings` is unique on `(region_id, model)` so retries cannot duplicate. RLS is on every table with no anon policies; the server uses the service role key and the browser never reads these tables directly. The storage bucket is private, accessed through server-created signed URLs.

### Design direction

Paper-and-ink editorial, built for tired eyes in a bright clinic. Fraunces (display), IBM Plex Sans (body), IBM Plex Mono (extracted values). Color carries meaning only: verified green `#2F6B4F` = models agreed, flag amber `#B7791F` = needs a human, stamp red `#C8341F` = unreadable or failed, on paper `#F4EFE6` and ink `#1B1A17`. Touch targets are at least 44px, contrast is AA, the review is keyboard-operable, and motion respects `prefers-reduced-motion`.

### Deployment

Deployed on Vercel; every push to `main` deploys, and `main` must always deploy. The checklist (migrations, security verification, Preview deploy, `maxDuration`, real-phone smoke test, secret scan) is Phase 9 of [`docs/BUILD_PLAN.md`](./docs/BUILD_PLAN.md). Rollback: promote the last known-good deployment in Vercel first, then debug on a branch.

### Contributing

One branch per person (`tways/...`, `alex/...`, `adrian/...`). Small commits with conventional messages (`feat:`, `fix:`, `docs:`, `test:`). Log every finished feature with its date in `docs/new-work.md`. The build sequence is in [`docs/BUILD_PLAN.md`](./docs/BUILD_PLAN.md) and the working rules in [`CLAUDE.md`](./CLAUDE.md).

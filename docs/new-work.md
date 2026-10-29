# New work log

Everything in this repo is new work written during the hackathon (Oct 27 to Nov 4, 2026). One entry per finished step, with its date.

## 2026-10-28

- Phase 0 remainder: Next.js scaffold (App Router, TypeScript strict, Tailwind, ESLint), `zod`, `idb`, `@supabase/supabase-js`, `vitest`, `@playwright/test`, `tsx`; scripts from CLAUDE.md; `.env.example`; moved `BUILD_PLAN.md` to `docs/`.
- Phase 1 (code part): `lib/schemas/` Zod schemas (field keys, reading, region, reconciled field, job status); `lib/pipeline/reconcile.ts` pure functions with unit tests; `lib/models/` adapter interfaces and `MOCK_MODELS=true` fixtures with a test that runs segment, two readers and reconcile with no credentials; `scripts/smoke-*.ts` and `docs/models-notes.md` template. Real adapters wait for the smoke test (no API shapes guessed).
- Added "Shared field keys" to `CLAUDE.md`.

## 2026-10-29

- Decision: shadcn/ui, GSAP and lucide-react approved for the front end. The hackathon organizers confirmed they are UI libraries, not models called at runtime, and may be used within their own licenses. Updated `CLAUDE.md` (rule 1 exception, Stack, Layout, Design direction) and `docs/BUILD_PLAN.md` (Phase 3 UI foundation, Phase 5 mask reveal, Phase 8 accessibility, cut order). No packages installed yet; Alex adds them in Phase 3.

- Model research (Phase 1, docs only): confirmed Muse Spark Open on Baseten with a real text-only call (`meta-models/muse-spark-open`; target model is `-1026` (organizers tied it to Baseten hackathon credits we did not receive); it returns 404 for our key, so development uses the unsuffixed model on our own key (Open Weights prize claim pending their ruling); endpoint is the full `/v1/chat/completions` path; `reasoning_content` must be ignored). Read Meta's official docs for Muse Spark (`muse-spark-1.3`, chat completions, image input) and SAM 3.1 (`sam-3.1`, `/responses`, streamed special-token output, one noun phrase per request). Rewrote `docs/models-notes.md` with observed vs documented tags; updated `CLAUDE.md`, `README.md`, `docs/BUILD_PLAN.md` and `.env.example`. Meta calls are not yet run.

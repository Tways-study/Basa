# New work log

Everything in this repo is new work written during the hackathon (Oct 27 to Nov 4, 2026). One entry per finished step, with its date.

## 2026-10-28

- Phase 0 remainder: Next.js scaffold (App Router, TypeScript strict, Tailwind, ESLint), `zod`, `idb`, `@supabase/supabase-js`, `vitest`, `@playwright/test`, `tsx`; scripts from CLAUDE.md; `.env.example`; moved `BUILD_PLAN.md` to `docs/`.
- Phase 1 (code part): `lib/schemas/` Zod schemas (field keys, reading, region, reconciled field, job status); `lib/pipeline/reconcile.ts` pure functions with unit tests; `lib/models/` adapter interfaces and `MOCK_MODELS=true` fixtures with a test that runs segment, two readers and reconcile with no credentials; `scripts/smoke-*.ts` and `docs/models-notes.md` template. Real adapters wait for the smoke test (no API shapes guessed).
- Added "Shared field keys" to `CLAUDE.md`.

## 2026-10-29

- Decision: shadcn/ui, GSAP and lucide-react approved for the front end. The hackathon organizers confirmed they are UI libraries, not models called at runtime, and may be used within their own licenses. Updated `CLAUDE.md` (rule 1 exception, Stack, Layout, Design direction) and `docs/BUILD_PLAN.md` (Phase 3 UI foundation, Phase 5 mask reveal, Phase 8 accessibility, cut order). No packages installed yet; Alex adds them in Phase 3.

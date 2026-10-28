# New work log

Everything in this repo is new work written during the hackathon (Oct 27 to Nov 4, 2026). One entry per finished step, with its date.

## 2026-10-28

- Phase 0 remainder: Next.js scaffold (App Router, TypeScript strict, Tailwind, ESLint), `zod`, `idb`, `@supabase/supabase-js`, `vitest`, `@playwright/test`, `tsx`; scripts from CLAUDE.md; `.env.example`; moved `BUILD_PLAN.md` to `docs/`.
- Phase 1 (code part): `lib/schemas/` Zod schemas (field keys, reading, region, reconciled field, job status); `lib/pipeline/reconcile.ts` pure functions with unit tests; `lib/models/` adapter interfaces and `MOCK_MODELS=true` fixtures with a test that runs segment, two readers and reconcile with no credentials; `scripts/smoke-*.ts` and `docs/models-notes.md` template. Real adapters wait for the smoke test (no API shapes guessed).
- Added "Shared field keys" to `CLAUDE.md`.

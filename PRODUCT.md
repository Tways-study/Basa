# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Clinic staff with no fixed role: whoever is free photographs a paper chart, and a different person may review it. They work in a bright clinic, often on a phone, tired and short of time, and they are not technical. Mobile web is the main surface; the review screen must also work on desktop. Confirmed with the team (2026-10-30): the user is "mixed clinic staff", not one job title.

## Product Purpose

Basa turns photographed paper clinic charts into human-verified digital records. A person photographs a chart, the system reads each region of it, and a person confirms every value before it is stored. Basa digitizes and verifies what is on paper. It does not interpret it: no treatment, dosing, diagnosis, or drug-safety output, anywhere. Summaries restate only what the confirmed record contains and cite their source region.

Success for the product is a confirmed record where every value was seen by a person beside the part of the photo it came from.

## Positioning

**Open decision.** The mechanism is fixed (two independent readers per region, a reconcile step that flags disagreements, and a human who confirms everything), but the team has not tested whether this beats a plain OCR or scanner app, and has not settled which claim to lead with (two readers, source beside every value, offline capture, or the combination). Do not write copy that claims Basa is more accurate, safer, or faster than anything until the eval and a real-phone test support it.

## Operating Context

- A chart is photographed on a phone; the photo is downscaled below 4 MB and sent with a client-made scan id, so a repeated upload cannot create a second scan.
- Capture is meant to work offline (IndexedDB outbox, synced when the network returns). Not built yet.
- Pipeline: segment the page into regions (Muse Spark proposes boxes, SAM 3.1 tightens them), read each region twice (Muse Spark; Muse Spark Open on Baseten), reconcile field by field, then human review. Each stage is stored, so a retry never duplicates work. A scan takes about 14 s in a Production run.
- Review: fields the readers agreed on are quick to confirm; fields they differ on, or that one reader could not read, need an explicit choice or typed value. A flagged field never has a preselected value. "Agreed" means the readers matched, not that the value is right, so the source crop must always be visible.
- Region kinds: table, handwriting, stamp, printed, header, signature.
- Print (2026-10-31): once every field is confirmed and saved, the review screen offers a printed patient copy. It restates only confirmed values, prints an unreadable field as "[not legible on source]", shows the confirmed date and a blank handwritten "Reviewed by" line (there is no login, so no staff name), and says it is not medical advice. It is a copy of a record, never a prescription or report authored by Basa. The reason to print: the confirmed record can travel to people with no Basa. The need is stated by the team from the usual clinic workflow, not observed with a named clinic: test it with one real staff member before relying on it.

## Capabilities and Constraints

- Hackathon entry (Meta Global AI Developer Hackathon, Startup track), deadline Thu Nov 5, 2026, 10:00 AM PHT. Scope freeze since 8 PM PHT Oct 30: only the Phase 5 to 8 tasks in `docs/BUILD_PLAN.md`, bug fixes and cuts. Feature freeze Nov 3, 12:00 PM.
- New work only, written Oct 27 to Nov 4. Synthetic data only: no real patient data in fixtures, prompts, logs or screenshots.
- Secrets stay server-side. Supabase (Postgres and Storage, RLS on every table), Next.js 16, Vercel.
- SAM masks are not decoded, so the review overlay draws boxes only.
- The open-weight reader is Muse Spark Open on Baseten. The unsuffixed `meta-models/muse-spark-open` is the model of record: the organizers confirmed on 2026-10-31 that it counts for the Open Weights requirement through our own Baseten account. The README and demo must explain how and where it is used, with provenance (Baseten run logs, screen captures, outputs).
- Out of scope: auth and roles, multi-clinic tenancy, patient management, scheduling, billing, prescribing, e-signing, native apps, model training, real patient data.
- **Open decision:** where Basa must run for the demo (live on a phone and judges' own devices, a recorded video only, or both with a pilot story) is not settled. The Phase 3 real phone run on mobile data has not happened.

## Brand Commitments

The name is Basa. The team has committed to a paper-and-ink editorial direction, Fraunces, IBM Plex Sans and IBM Plex Mono, and a fixed six-colour palette where colour carries meaning only (green: readers agreed; amber: needs a human; red: unreadable or failed). Those are recorded in `CLAUDE.md`, which stays the authority for visual rules.

## Evidence on Hand

- Three synthetic fixtures with ground truth in `eval/fixtures/`: `smoke-chart-01`, `smoke-chart-02` (photo-like variant) and `hard-chart-01`.
- Small real-model runs logged in `docs/new-work.md`: on `smoke-chart-02` both readers got 20 of 20 fields; on `hard-chart-01` the readers disagreed once in seven runs; a clipped box once made both readers agree on wrong text, which led to the 20% read margin.
- One Production run (Mac, webcam) reached `needs_review` in about 14 s.
- Absent, and not to be invented: a real phone photo, any held-out eval result, any user testing, any clinic, customer, pilot, testimonial or benchmark. The held-out eval (Phase 7) has not been run.

## Product Principles

1. A person confirms everything. Models propose; they never decide, and a flagged field is never silently resolved.
2. Show the source beside every value. Agreement between readers is not proof, so the evidence stays in view.
3. Say plainly what is unreliable. A failed or unreadable reading is shown as failed or unreadable, never blank or guessed.
4. Digitize, never advise. Nothing in the product interprets clinical content.
5. Work for a tired person on a phone: few decisions per screen, one obvious next step, and no state that leaves them wondering whether it is stuck.

## Accessibility & Inclusion

AA contrast, keyboard-operable review, a label on every control, and touch targets of at least 44 px (56 px for the main capture action). Meaning never rests on colour alone: pair it with an icon or text. Layouts work from 360 px wide to desktop. Respect `prefers-reduced-motion`.

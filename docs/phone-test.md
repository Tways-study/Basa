# Phone test plan (Phase 3)

A step-by-step version that also covers the Phase 5 review screen and the Phase 6 offline outbox, with a live tally per Done when line, is the phone test sheet (artifact `RXnzr3KLyETQAWQwKKSmXF`). Closes the first two "Done when" lines of Phase 3 in `docs/BUILD_PLAN.md`: a real photo taken on a phone reaches a stored result on the public URL, and no secret appears in browser network traffic. Repeat before each milestone (see Phase 9 step 7).

## What you need

- The stable Production alias. In Vercel: project `basa`, then Domains, and copy the `.vercel.app` alias. Do not use a per-deployment URL such as `basa-<hash>-…`.
- Vercel Authentication off for the test, or a protection bypass. The team plan was recorded as protecting Production with Vercel Authentication, which blocks a logged-out phone. Check Settings, Deployment Protection, and put it back afterwards if it was on.
- A synthetic chart. Synthetic data only (CLAUDE.md rule 2): never photograph a real patient chart. Print `eval/fixtures/smoke-chart-02.jpg`, or show it full-screen on a laptop. Paper tests a real camera better.

## Steps

1. Put the phone on mobile data and turn Wi-Fi off. The test runs logged out, on the public internet.
2. Open the Production URL. If the phone is signed in to Vercel, use a private tab.
3. Tap **Take photo**, photograph the chart, then tap **Send**.
4. You land on `/scans/<id>`. Wait for the status to reach `needs_review`.
5. Check that all five regions appear (header, table, handwriting, stamp, signature) with readable values and no red failure alert.
6. Tap the photo: the dialog opens, Escape or the close button closes it.

Pass: the phone photo reached a stored result on the public URL.

**Use a normal tab for the offline steps (Part C of the sheet).** A private tab can open the app but WebKit will not store a photo there as a Blob, so offline capture looked broken on a phone. Photos are now stored as bytes (2026-11-01), which works in a private tab too, but test in a normal tab first. Also: with the phone offline you cannot open the address in a closed tab (no app shell is cached, and a service worker is out of scope); to check that the photo outlives the tab, close the tab offline, reconnect, then open the app.

## Checking that no secret leaves the server

A phone makes network inspection awkward. Use one of:

- **Laptop (easiest):** open the same Production URL in Chrome with DevTools, Network tab. Upload the same photo with "Choose a photo from this device".
- **Android Chrome:** plug into a laptop and use `chrome://inspect`.
- **iPhone:** Safari Web Inspector on a Mac (Settings, Safari, Advanced, Web Inspector, then the Develop menu).

Expected traffic: one `POST /api/sync`, then repeated `GET /api/scans/<id>`. Check that:

- No request header or body contains `META_API_KEY`, `BASETEN_API_KEY` or `SUPABASE_SERVICE_ROLE_KEY`.
- The only Supabase URL is the signed image URL in the scan response (a temporary link, not a key).
- No request goes to `api.meta.ai` or Baseten directly. Model calls are server-side only.

## If it fails

- Stuck or failed scan: note the scan id, then read the scan row and the Vercel runtime logs to find the stage that broke.
- Upload rejected: the app shows an inline error; note which one.

## Result log

| Date | Device and browser | Network | Scan id | Reached `needs_review` | Secrets in traffic | Notes |
|---|---|---|---|---|---|---|
| 2026-10-30 | MacBook webcam (rehearsal, not a phone; browser not recorded) | Mac, not mobile data | `1703a77d-916a-457f-8e27-ef94b4830a7c` | Yes, in about 14 s: 5 regions, 10 readings (both readers), 0 errors, checked in the database | None seen. Tways saw only `POST /api/sync` and repeated `GET /api/scans/<id>` in the Network tab (self-reported; no key-string search recorded) | Production alias `basa-chi.vercel.app` on the Phase 4 build. Results page contents not reported. Does not close the phone line: still needs a real phone photo on mobile data of the printed chart. |
| 2026-11-01 | Real phone (model not recorded), mobile data, tester Ilowise | Mobile data | not recorded | Yes: all 5 regions, readable values, no red alert (A1 to A5 passed) | None: the laptop Network search found nothing (A6 passed) | Phase 3 and Phase 5 (steps B1 to B22) passed on the phone. Part C failed from C2: "This browser cannot keep the photo" in a private tab; closed-tab reopen offline said "Site cannot be reached". Cause and fix in `docs/new-work.md` (photo stored as bytes). Part C to be re-run in a normal tab. |

After a pass, log it in `docs/new-work.md` with the date, and clear the synthetic test scans from the database and storage before the demo.

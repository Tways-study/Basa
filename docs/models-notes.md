# Model notes

Written from what we actually observed in the Phase 1 smoke test, never from guesses. If a field below is blank, nobody has run the test yet. Adapters in `lib/models/` must follow this file; if a detail is missing, stop and ask.

How to fill it in: put keys in `.env.local`, then run `pnpm smoke:sam <chart.jpg>`, `pnpm smoke:spark <chart.jpg>` and `pnpm smoke:spark-open <chart.jpg>` with a synthetic chart. Each script has a marked spot to copy the request shape from the provider docs. Paste the real response here (remove anything that identifies an account).

Status key: `ok` returned something parseable · `fail` see notes · `untested`

## SAM 3.1 (Meta API)

| Item | Observed |
|---|---|
| Status | untested |
| Endpoint | |
| Auth header name | |
| Request shape | |
| Response shape | |
| Image size limit | |
| Latency | |
| Error format | |
| Fallback if it fails | |

## Muse Spark (Meta API)

| Item | Observed |
|---|---|
| Status | untested |
| Endpoint | |
| Auth header name | |
| Request shape | |
| Response shape | |
| Image size limit | |
| Latency | |
| Error format | |
| Fallback if it fails | |

## Muse Spark Open, `meta-models/muse-spark-open-1026` (Baseten)

| Item | Observed |
|---|---|
| Status | untested |
| Endpoint | |
| Auth header name | |
| Request shape | |
| Response shape | |
| Image size limit | |
| Latency | |
| Error format | |
| Fallback if it fails | |

## Go or no-go (post at the 8 PM check-in, Oct 28)

| Model | Decision | Reason |
|---|---|---|
| SAM 3.1 | | |
| Muse Spark | | |
| Muse Spark Open | | |

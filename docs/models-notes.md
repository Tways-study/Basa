# Model notes

The source of truth for how we call each model. Adapters in `lib/models/` must follow this file; if a detail is missing, stop and ask.

Every row says where it came from:
- **observed**: we made the call and saw this response (smoke test, with the date).
- **documented**: read from the provider's official docs, not yet confirmed by a call. Treat as a strong lead, then confirm with `pnpm smoke:<name>` and change the tag to **observed**.

Never paste a key, a full header, or an account-identifying value here.

Status key: `ok` returned something parseable · `fail` see notes · `untested`

Last updated: 2026-10-29

## Muse Spark (Meta API), `muse-spark-1.3`

| Item | Detail |
|---|---|
| Status | untested (shape documented; no call made yet) |
| Model ID | `muse-spark-1.3`, the latest version and Meta's recommendation for new work (documented). Do **not** use `muse-spark-1.3-contributor`: it lets Meta train on request content. Older: `muse-spark-1.2`, `muse-spark-1.1` |
| Endpoint | `POST {META_API_BASE_URL}/chat/completions`, with the base URL `https://api.meta.ai/v1` (documented). Responses API (`/responses`) and Messages API also work for this model |
| Auth header | `Authorization: Bearer <key>`. Keys start with `LLM_` (documented). Docs call the env var `MODEL_API_KEY`; ours is `META_API_KEY` |
| Request shape | OpenAI chat completions: `{"model": "...", "messages": [{"role": "user", "content": [{"type": "text", "text": "..."}, {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,<bytes>"}}]}]}` (documented). Images in user-role messages only. A public URL also works |
| Response shape | OpenAI chat completion: answer in `choices[0].message.content`, token counts in `usage` (documented) |
| Image limits | Up to 50 images per request, otherwise HTTP 400. Also bounded by payload size and context (1,048,576 tokens). Exact byte limit not yet found |
| Coordinates | When asked for locations, the model uses a normalized 0-1000 grid, `(0,0)` top-left, not pixels. Convert using the dimensions of the exact image sent (documented) |
| Latency | not measured |
| Error format | see Meta "Error handling" doc (not read yet); record the real format from a failed call |
| Fallback if it fails | Muse Spark proposes the same fields from the whole image (condition A in the eval) |

## SAM 3.1 (Meta API), `sam-3.1`

| Item | Detail |
|---|---|
| Status | untested (shape documented; no call made yet) |
| Model ID | `sam-3.1` (documented) |
| Endpoint | `POST {META_API_BASE_URL}/responses`, **not** chat completions (documented) |
| Auth header | `Authorization: Bearer <key>` (documented) |
| Request shape | `{"model": "sam-3.1", "stream": true, "input": [{"type": "message", "role": "user", "content": [{"type": "input_text", "text": "<short noun phrase>"}, {"type": "input_image", "image_url": "data:image/jpeg;base64,<bytes>"}]}]}` with header `Accept: text/event-stream` (documented) |
| One object type per request | The prompt is one concrete noun phrase (for example "table"). To find several kinds of region, send several requests. This drives the per-scan call count and `MAX_MODEL_CALLS_PER_SCAN` |
| Response shape | **Not JSON.** A server-sent event stream. Each `response.output_text.delta` event holds one line of special-token text; `response.completed` ends the stream. A single image is one line, frame `<0f>`. Zero matches is valid: the stream completes with no delta events (documented) |
| Line grammar | `<0f>` then comma-separated records: `id<|box;x1=..;y1=..;x2=..;y2=..;w=<imgW>;h=<imgH>|><|mask;x=0;y=0;data=<H>,<W>,<enc>payload|>`. Box corners are source pixels. Mask payload is base85, not base64; `enc` is `~` (lossless) or `!` (one-bit). Object ids are stable but can be sparse (0, 2). Confidence `c=` appears only when `include_confidence` is requested (documented, from "Reading segmentation output") |
| Adapter implication | `lib/models/` needs a small parser for this grammar and a base85 mask decoder, with a Zod schema for the parsed result. Store boxes as fractions of `w` and `h` |
| Image limits | not found yet |
| Latency | not measured |
| Error format | see Meta "Error handling" doc (not read yet) |
| Fallback if it fails | Muse Spark proposes region boxes (0-1000 grid), per the cut order in `BUILD_PLAN.md` |

## Muse Spark Open (Baseten)

| Item | Detail |
|---|---|
| Status | ok for a text-only call (2026-10-29); image input untested |
| Model ID | **Target: `meta-models/muse-spark-open-1026`**, the model the organizers tied to Baseten hackathon credits. We did not receive those credits (only some users did; partner credits are not required to compete). **Observed 2026-10-29 with our current key:** `-1026` returns 404 `{"error":"please check the model you provided"}` (checked three times, the last on the correct endpoint), while `meta-models/muse-spark-open` returns 200 and is listed in Baseten's public docs. Until `-1026` works for us, use the unsuffixed ID for development |
| Endpoint | `POST https://inference.baseten.co/v1/chat/completions`. `BASETEN_MODEL_URL` must hold this **full endpoint**. With only `/v1` the call returned 404 (observed; documented) |
| Auth header | `Authorization: Bearer <key>` worked (observed) |
| Request shape | OpenAI chat completions, same as Muse Spark above. The script sends a text-only prompt; the image form (`image_url` with a base64 data URL) is the OpenAI-compatible form and is untested here |
| Response shape | OpenAI chat completion. The answer is in `choices[0].message.content`. The message also carries `reasoning_content` (the model's thinking, always on). **Read only `content`; never store or show `reasoning_content` as a reading** (observed) |
| Token budget | Reasoning tokens count toward `max_tokens` (67 of 78 completion tokens on a one-word reply). A low cap can cut off the real answer, so the adapter needs generous headroom (observed) |
| Usage | `usage` returns prompt, completion and reasoning token counts (observed) |
| Image support | Baseten's docs mark the model as supporting vision. Not yet confirmed by a call |
| Latency | about 1.3 s for a one-word text reply (observed, one run) |
| Error format | HTTP 404 with a JSON body `{"error": "<message>"}`; the message was empty for a wrong path and `please check the model you provided` for an unknown model name (observed) |
| Fallback if it fails | Move the open-weights reader to Modal; if that fails too, the second reader becomes Muse Spark with a different prompt and the Open Weights claim is dropped |

## Open questions

- **Decision (2026-10-29):** target model is `meta-models/muse-spark-open-1026`. No hackathon credits were issued to us and `-1026` fails (404) with our key, so development uses the unsuffixed ID on our own Baseten account. Set a spend alert on the Baseten account. Fallbacks if Baseten fails twice: Modal, then Muse Spark twice (see the cut order in `BUILD_PLAN.md`).
- Organizers answered that the Best Build on Meta Open Weight Models prize needs a project built on Muse Glimmer or Muse Spark Open, served on our own hardware or through partner inference, and that mixing in hosted Muse models is fine. The demo and README must explain how and where the open-weight model is used. Whether the unsuffixed Baseten ID on our own account qualifies for the bonus is a pending ruling from the organizers; do not claim the prize until they answer.
- Image runs for all three models need a synthetic chart (fictional data only).
- Real image-size limits, rate limits and error bodies for the two Meta models.

## Go or no-go (post at the 8 PM check-in, Oct 28)

| Model | Decision | Reason |
|---|---|---|
| SAM 3.1 | | shape documented, no call yet |
| Muse Spark | | shape documented, no call yet |
| Muse Spark Open | | text call ok; image call pending |

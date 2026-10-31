# Model notes

The source of truth for how we call each model. Adapters in `lib/models/` must follow this file; if a detail is missing, stop and ask.

Every row says where it came from:
- **observed**: we made the call and saw this response (smoke test, with the date).
- **documented**: read from the provider's official docs, not yet confirmed by a call. Treat as a strong lead, then confirm with `pnpm smoke:<name>` and change the tag to **observed**.

Never paste a key, a full header, or an account-identifying value here.

Status key: `ok` returned something parseable · `fail` see notes · `untested`

Last updated: 2026-10-29 (reasoning controls, region experiments)

## Muse Spark (Meta API), `muse-spark-1.3`

| Item | Detail |
|---|---|
| Status | ok, text and image (2026-10-29) |
| Observed with the synthetic chart (2026-10-29) | Image input works (HTTP 200, 4.6 s, 980 completion tokens of which 842 were reasoning) and the transcription of `eval/fixtures/smoke-chart-01.jpg` matched the ground truth on every field. **With `max_tokens: 200` the whole budget went to reasoning: `content` was `null` and `finish_reason` was `length`.** Always check `finish_reason`; treat `length` or empty `content` as a failed reading, never as an answer (`scripts/smoke-lib.ts` now exits non-zero on both) |
| Reasoning control (documented, then observed 2026-10-29) | Top-level `reasoning_effort` on Chat Completions: `minimal`, `low`, `medium`, `high`, `xhigh`, `max` (`max` not on the `-contributor` ID). `none` is rejected with HTTP 400. Omitted = model decides. On the synthetic chart, every setting read the sheet equally well: `minimal` used 308 completion tokens (157 reasoning) in 2.7 s, `low` 428 in 2.7 s, `medium` 1091 in 4.7 s, default 860-1039 in 4.7-5.3 s. **Use `reasoning_effort: "minimal"` with `max_tokens: 1500` for extraction** (about 5x headroom over the 308 tokens used). A `max_tokens` of 50 returns `finish_reason: length` |
| Observed (text-only) | `POST {base}/chat/completions` with `Bearer` auth returned HTTP 200 in about 2.3 s for a one-word text prompt. Answer in `choices[0].message.content` (`ready`). The response also has `usage` with `completion_tokens_details.reasoning_tokens` (102 of 112 completion tokens on that reply), so reasoning tokens count toward `max_tokens` here too: leave headroom. `GET /v1/models` with our key returned 200 and lists `muse-spark-1.3` and `sam-3.1` |
| Model ID | `muse-spark-1.3`, the latest version and Meta's recommendation for new work (documented). Do **not** use `muse-spark-1.3-contributor`: it lets Meta train on request content. Older: `muse-spark-1.2`, `muse-spark-1.1` |
| Endpoint | `POST {META_API_BASE_URL}/chat/completions`, with the base URL `https://api.meta.ai/v1` (documented). Responses API (`/responses`) and Messages API also work for this model |
| Auth header | `Authorization: Bearer <key>`. Keys start with `LLM_` (documented). Docs call the env var `MODEL_API_KEY`; ours is `META_API_KEY` |
| Request shape | OpenAI chat completions: `{"model": "...", "messages": [{"role": "user", "content": [{"type": "text", "text": "..."}, {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,<bytes>"}}]}]}` (documented). Images in user-role messages only. A public URL also works |
| Response shape | OpenAI chat completion: answer in `choices[0].message.content`, token counts in `usage` (documented) |
| Image limits | Up to 50 images per request, otherwise HTTP 400. Also bounded by payload size and context (1,048,576 tokens). Exact byte limit not yet found |
| Coordinates | When asked for locations, the model uses a normalized 0-1000 grid, `(0,0)` top-left, not pixels. Convert using the dimensions of the exact image sent (documented) |
| Region proposals (observed 2026-10-29) | Asked for boxes of five region kinds on the 0-1000 grid, it returned all five kinds in 3 of 3 runs on `eval/fixtures/smoke-chart-02.jpg` (tilted, shadowed, noisy), about 2.5 s each. Overlap with ground truth (IoU, 1.0 = exact): printed 0.73-0.75, table 0.67-0.71, handwriting 0.42-0.89, stamp 0.64-0.71, signature 0.19-0.64. **Boxes vary run to run**, so pad them and refine them (see the region strategy below). Ground truth for tilted regions is the axis-aligned bound, which caps IoU below 1 |
| Latency | 2.3-5 s per call depending on reasoning effort (observed) |
| Error format | `{"error":{"code","message","param","type"}}`, for example HTTP 400 `reasoning_effort 'none' is not supported for model 'muse-spark-1.3'` (observed) |
| Fallback if it fails | Muse Spark proposes the same fields from the whole image (condition A in the eval) |

## SAM 3.1 (Meta API), `sam-3.1`

| Item | Detail |
|---|---|
| Status | ok: noun prompts find stamps only; **box prompts segment every region** (2026-10-29) |
| Observed with the synthetic chart (2026-10-29) | Image call returns HTTP 200, `text/event-stream`, about 2 s. Prompt `stamp` (and `red stamp`) returned one object whose box `(626,746)-(832,844)` of a 900x1180 image sits exactly on the stamp, with a lossless (`~`) 99x207 mask. Prompts `table`, `grid of rows and columns`, `text`, `printed text`, `handwriting`, `handwritten text`, `cursive writing`, `line of text` and `signature` returned **zero matches** (a valid empty stream, not an error). The stream repeats the same payload in `response.output_text.delta` and again in the `*.done` and `response.completed` events: **read only the delta events** or every object is counted five times. On the photo-like `smoke-chart-02.jpg` the same pattern held: `stamp` found it (box within 2 px of the stamp), `document` found the whole sheet, and `table`, `handwritten text`, `signature` and `printed text` returned zero matches. Noun prompts only work on distinct visual objects |
| Box and point prompts (documented, then observed 2026-10-29) | The `input_text` is either a noun phrase or box/point tokens, never both: `<0f>1<|box;x1=..;y1=..;x2=..;y2=..;w=<imgW>;h=<imgH>|>,2<|box;...|>`. Each object gets an id you choose; **several objects go in one request**. Coordinates are source pixels, `w` and `h` are the image size (a mismatched aspect ratio returns 400). Fed Muse Spark's five proposed boxes in one request, SAM returned five objects with masks and snapped to the real shapes: stamp IoU 0.99 (from a 0.64 proposal), handwriting 0.93, table 0.81, signature 0.65, printed 0.73 (ground truth for printed and table is a loose axis-aligned bound). Masks are lossless (`~`) rasters sized to each box |
| Observed 2026-10-29 | `POST {base}/responses` with `Bearer` auth and a text-only prompt returned HTTP 400 in about 1 s with `{"error":{"code":null,"message":"SAM 3 requires an input_image or input_video content part in a user message","param":null,"type":"invalid_request_error"}}`. That confirms the key, URL and model name are accepted and that an image is mandatory. Error shape: `{"error":{"code","message","param","type"}}`; an unauthenticated call returned 401 with `type: authentication_error`, `code: invalid_api_key` |
| Model ID | `sam-3.1` (documented) |
| Endpoint | `POST {META_API_BASE_URL}/responses`, **not** chat completions (documented) |
| Auth header | `Authorization: Bearer <key>` (documented) |
| Request shape | `{"model": "sam-3.1", "stream": true, "input": [{"type": "message", "role": "user", "content": [{"type": "input_text", "text": "<short noun phrase>"}, {"type": "input_image", "image_url": "data:image/jpeg;base64,<bytes>"}]}]}` with header `Accept: text/event-stream` (documented) |
| One concept per noun request | A noun-phrase prompt names one concept, so several kinds need several requests. Box prompts avoid this: one request can carry all regions. Count each SAM request against `MAX_MODEL_CALLS_PER_SCAN` |
| Response shape | **Not JSON.** A server-sent event stream. Each `response.output_text.delta` event holds one line of special-token text; `response.completed` ends the stream. A single image is one line, frame `<0f>`. Zero matches is valid: the stream completes with no delta events (documented) |
| Line grammar | `<0f>` then comma-separated records: `id<|box;x1=..;y1=..;x2=..;y2=..;w=<imgW>;h=<imgH>|><|mask;x=0;y=0;data=<H>,<W>,<enc>payload|>`. Box corners are source pixels. Mask payload is base85, not base64; `enc` is `~` (lossless) or `!` (one-bit). Object ids are stable but can be sparse (0, 2). Confidence `c=` appears only when `include_confidence` is requested (documented, from "Reading segmentation output") |
| Adapter implication | `lib/models/` needs a small parser for this grammar and a base85 mask decoder, with a Zod schema for the parsed result. Store boxes as fractions of `w` and `h` |
| Box prompt, live call (observed 2026-10-30) | Image 1100x1400, five boxes in one request, ids `1` to `5`: HTTP 200, `text/event-stream`, about 2 s, five records back. **Object id `0` is rejected** (HTTP 400 `invalid prompt: malformed or unknown token after object 0 on frame 0`): start ids at 1, as the docs' example does. Box prompts are limited to 16 objects. The stream carries the line in one `response.output_text.delta` event (`data: {"content_index":0,"delta":"<0f>1<|box;...","item_id":...}`) and again in the `output_text.done`, `content_part.done`, `output_item.done` and `completed` events; the stream ends with `data: [DONE]`. **The delta line ends with a newline**, so a parser that anchors on end-of-string drops the last record (this bit our first parser) |
| Mask encoding for box prompts (observed 2026-10-30) | All five masks came back with the lossless `~` marker, although the docs say box and point prompts always return one-bit (`!`) masks. Read the marker on each mask. Payload characters seen: `! # $ % ( ) + - { } ~` and letters and digits (not plain ASCII85, which stops at `u`); a payload may contain `,` and `|`, so a record is closed by `|>` only when the next record or the end of the line follows. Payload size is about 0.06 to 0.35 characters per mask pixel, far below a packed bit raster, so there is further compression |
| **Mask decoding: not specified** | The docs (`dev.meta.ai/docs/sam/reading-segmentation`, `client-libraries`, `segmenting`) say "decode with a base85 alphabet" and point to `decodeMaskToRaster` in the vendor's `@meta-sam/parser` package, but never state the alphabet, the byte layout or the compression. CLAUDE.md rule 1 forbids importing that package, and rule 5 forbids guessing. **Open: ask the organizers for the mask byte format, or approve an experiment to infer it.** **Decision (2026-10-30, Tways): boxes only.** `lib/models/sam.ts` parses masks and discards them, `regions.mask_path` stays null, and the review overlay draws SAM boxes. Revisit only if the organizers or a doc give the format |
| Image limits | not found yet |
| Latency | about 1.7 to 2 s for five boxes on a 1100x1400 JPEG (observed 2026-10-30) |
| Error format | `{"error":{"code","message","param","type"}}`, for example HTTP 400 `invalid_request_error` with the message above (observed). Meta's "Error handling" doc not read yet |
| Smoke script limit | `scripts/smoke-lib.ts` splits `--flag=value` on every `=`, so a box prompt (which contains `=`) is cut off at the first one and SAM answers 400. Send box prompts from a throwaway script, or fix the flag parser |
| Fallback if it fails | Use Muse Spark's proposed boxes directly (padded) as the regions, without masks |

## Muse Spark Open (Baseten)

| Item | Detail |
|---|---|
| Status | ok, text and image (2026-10-29) |
| Observed with the synthetic chart (2026-10-29) | Image input works: HTTP 200, 9.5 s, 805 completion tokens of which 666 were reasoning; transcription matched the ground truth except `Lab B` for `lab B` (a case difference that reconcile's normalization should treat as agreed). **With `max_tokens: 200`, `content` was `null` and `finish_reason` was `length`**; its reasoning also spent time debating whether to transcribe a clinic sheet as personal data, so the prompt should state that the sheet is a fictional sample. Check `finish_reason`. See the reasoning control row |
| Reasoning control (documented, then observed 2026-10-29) | Baseten's Model APIs take a top-level `reasoning_effort`. For this model the supported values are `low`, `medium`, `high`, `xhigh` (the default when omitted); `none` and `minimal` run as `low`. Reasoning is always on. Observed on the synthetic chart: default (xhigh) 1254 completion tokens (1115 reasoning) in 6.6 s; `low` 434 (295) in 4.1 s; `medium` 415 (276) in 3.8 s; `low` with `max_tokens: 300` still finished (268 tokens). All read the sheet equally well. **Use `reasoning_effort: "low"` with `max_tokens: 1500`.** A separate `reasoning.max_tokens` cap exists in Baseten's reference but is documented as enforced on another model only |
| Model ID | **Use `meta-models/muse-spark-open` (no suffix).** The organizers confirmed on 2026-10-31 (reply relayed from Josh at Meta) that it counts for the Open Weights requirement and that using it through our own Baseten account is fine. The `-1026` ID, which the organizers had tied to Baseten hackathon credits, is not needed. We did not receive those credits (only some users did; partner credits are not required to compete). **Observed 2026-10-29 with our current key:** `-1026` returns 404 `{"error":"please check the model you provided"}` (checked three times, the last on the correct endpoint), while `meta-models/muse-spark-open` returns 200 and is listed in Baseten's public docs. The unsuffixed ID is the model of record |
| Endpoint | `POST https://inference.baseten.co/v1/chat/completions`. `BASETEN_MODEL_URL` must hold this **full endpoint**. With only `/v1` the call returned 404 (observed; documented) |
| Auth header | `Authorization: Bearer <key>` worked (observed) |
| Request shape | OpenAI chat completions, same as Muse Spark above. The script sends a text-only prompt; the image form (`image_url` with a base64 data URL) is the OpenAI-compatible form and is untested here |
| Response shape | OpenAI chat completion. The answer is in `choices[0].message.content`. The message also carries `reasoning_content` (the model's thinking, always on). **Read only `content`; never store or show `reasoning_content` as a reading** (observed) |
| Token budget | Reasoning tokens count toward `max_tokens` (observed); `max_tokens` caps the whole completion (documented) |
| Usage | `usage` returns prompt, completion and reasoning token counts (observed) |
| Image support | Confirmed by a call with the synthetic chart (observed) |
| Region proposals | **Not usable.** With the same 0-1000-grid prompt it found printed and table roughly (IoU 0.5-0.8) but missed handwriting, stamp and signature (IoU about 0), likely because it does not use Meta's 0-1000 convention (observed 2 runs). Do not use it for region proposals |
| Access to `-1026` | Baseten documents no endpoint that lists the models a key can call, so access cannot be checked by API; the 404 on `-1026` is the only evidence. Moot since 2026-10-31: the unsuffixed ID is confirmed eligible |
| Latency | 3.4-6.6 s per image call depending on reasoning effort (observed) |
| Error format | HTTP 404 with a JSON body `{"error": "<message>"}`; the message was empty for a wrong path and `please check the model you provided` for an unknown model name (observed) |
| Fallback if it fails | Move the open-weights reader to Modal; if that fails too, the second reader becomes Muse Spark with a different prompt and the Open Weights claim is dropped |

## Muse Spark Open habits found by the eval (observed 2026-10-31)

- **Repeats letters or syllables** on some words (`Alccantara`, `Creatininine`, `Platelelets`, `Bautitista`, `Hemeglobin`, `Potakassium`), steadily on the same charts, about 4 to 5 fields in 169. Muse Spark was right every time. Asking for "each word once" changed nothing measurable (`docs/eval-tuning.md`).
- **Sometimes answers in words, not JSON,** for a whole table or header: 6 observed in about a dozen dev runs, before the one retry was added. After it, 3 retries fired and all recovered.

## Read prompts: what we learned (observed 2026-10-30)

- **Signature readings failed at random.** The shared read prompt said "Your job is transcription only" and the signature schema has one key (`signature.present`). Muse Spark answered under a key named `transcription` in 2 of 3 local scans and once on Production, and the field-key check rejected it. After removing the word, giving each region kind an exact example JSON and saying any other key is wrong, 9 of 9 scans (6 local, 3 on Production) read all five regions with no reading errors.
- **Table regions include the chart's own header row.** The reader returns `TEST`, `VALUE`, `UNIT` as `row1` (seen in the live UI run). Open: tell the table prompt to skip the header row (Phase 4).
- **Per-region read time** in the live UI run was 0.7 to 2.1 s with `reasoning_effort: minimal`.

## Open questions

- **Decision (2026-10-31):** the model of record is `meta-models/muse-spark-open` on our own Baseten account. (On 2026-10-29 the target was `-1026`; no hackathon credits were issued to us and it fails with a 404 on our key.) Set a spend alert on the Baseten account. Fallbacks if Baseten fails twice: Modal, then Muse Spark twice (see the cut order in `BUILD_PLAN.md`).
- Organizers answered that the Best Build on Meta Open Weight Models prize needs a project built on Muse Glimmer or Muse Spark Open, served on our own hardware or through partner inference, and that mixing in hosted Muse models is fine. The demo and README must explain how and where the open-weight model is used. **Ruling (2026-10-31):** the organizers confirmed the unsuffixed `meta-models/muse-spark-open` on Baseten counts for the Open Weights requirement, using it through our own account is fine, partner credits are not needed to compete, and Best Build on Meta Open Weight Models checks that the project runs on an eligible open-weight model. They ask us to explain how and where it is used and to add provenance: Baseten run logs, screen captures and outputs.
- **Region strategy (proposed for Phase 4, needs the team's OK):** (1) one Muse Spark call proposes boxes for printed, table, handwriting, stamp and signature; (2) pad each box by about 4% and clamp to the image, because proposals vary run to run; (3) one SAM request with those boxes as prompts returns refined boxes and masks for all five (the masks feed the review screen's overlay); (4) the readers read the crops. About 2 setup calls per scan plus 2 reads per region, so about 12 calls, within the cap of 30. Open: results come from one synthetic photo-like chart and 3 Spark runs. Before relying on it, print a synthetic chart, photograph it with a phone, and re-run the experiments listed at the bottom of this file. Padding and a whole-image fallback read cover a bad box.
- Real image-size limits, rate limits and error bodies for the two Meta models.

## Go or no-go (Oct 28)

| Model | Decision | Reason |
|---|---|---|
| SAM 3.1 | Go, **with box prompts, not noun prompts** (proposed) | Noun prompts found only the stamp. Box prompts from Muse Spark gave masks for all five regions in one request |
| Muse Spark | Go | Reads the sheet correctly; use `reasoning_effort: minimal`, `max_tokens: 1500`; also the region proposer |
| Muse Spark Open | Go as second reader (unsuffixed model), no-go as region proposer | Reads the sheet with `reasoning_effort: low`; `-1026` unavailable to our key; Open Weights eligibility confirmed 2026-10-31 |

## Reproducing the region experiments

Fixtures: `eval/fixtures/smoke-chart-02.jpg` (photo-like variant of chart 1) and `smoke-chart-02.json` (field ground truth plus `_regions`, boxes in source pixels read from the rendered page; handwriting and signature are ink extent, the rest are element bounds).
- Noun prompts: `pnpm smoke:sam eval/fixtures/smoke-chart-02.jpg --prompt="stamp"`.
- Reasoning: `pnpm smoke:spark eval/fixtures/smoke-chart-02.jpg --effort=minimal --max-tokens=1500` and `pnpm smoke:spark-open eval/fixtures/smoke-chart-02.jpg --effort=low --max-tokens=1500`.
- Region proposals and box prompts: a throwaway script (not committed) sent the prompt "Locate these regions and return only a JSON array ... on a normalized 0-1000 grid" with `reasoning_effort: minimal`, converted to pixels (`x * width / 1000`), scored IoU against `_regions`, then sent the five boxes as one SAM box-prompt request. If the team keeps this approach, Phase 4 should turn it into `eval/` code.

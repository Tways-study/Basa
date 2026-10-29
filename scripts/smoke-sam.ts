import { requireEnv, runSmoke } from "./smoke-lib";

// SAM 3.1 through the Meta API, Responses format with a streamed reply.
// The reply is special-token text, not JSON (docs: "Reading segmentation output"); this script prints it raw.
// Request shape comes from Meta's official docs (see docs/models-notes.md, tagged "documented").
//   pnpm smoke:sam                        text-only: SAM needs an image, so expect a validation error. Still
//                                         checks the key, URL and model name, and records the error format.
//   pnpm smoke:sam chart.jpg              segments "table"
//   pnpm smoke:sam chart.jpg --prompt="handwritten note" --mime=image/png
runSmoke("sam", (image, flags) => {
  const base = requireEnv("META_API_BASE_URL");
  const key = requireEnv("META_API_KEY");
  const model = requireEnv("META_SAM_MODEL");

  // One short noun phrase per request; other region types need their own request.
  const content: unknown[] = [{ type: "input_text", text: flags.prompt ?? "table" }];
  if (image) {
    const mime = flags.mime ?? "image/jpeg";
    content.push({ type: "input_image", image_url: `data:${mime};base64,${image.toString("base64")}` });
  }

  return {
    url: `${base}/responses`,
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ model, stream: true, input: [{ type: "message", role: "user", content }] }),
  };
});

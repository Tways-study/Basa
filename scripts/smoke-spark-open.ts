import { requireEnv, runSmoke } from "./smoke-lib";

// Muse Spark Open through the Baseten Model API (option A, no dedicated deployment).
// Request shape: OpenAI-compatible chat completions, as shown on Baseten's Muse Spark Open pages.
// Not yet confirmed by a real call: whether this model accepts images, whether the
// "-1026" model name works, and whether auth wants "Bearer" or "Api-Key". The flags below
// let us test each one and then write the result in docs/models-notes.md.
//   pnpm smoke:spark-open                              text-only, checks key + URL + model name
//   pnpm smoke:spark-open chart.jpg                    adds the image as an OpenAI-style image_url part
//   pnpm smoke:spark-open --model=meta-models/muse-spark-open-1026
//   pnpm smoke:spark-open --auth=api-key
const DEFAULT_MODEL = "meta-models/muse-spark-open";

runSmoke("spark-open", (image, flags) => {
  const url = requireEnv("BASETEN_MODEL_URL");
  const key = requireEnv("BASETEN_API_KEY");
  const scheme = flags.auth === "api-key" ? "Api-Key" : "Bearer";

  const content: unknown[] = [{ type: "text", text: "Reply with the single word: ready." }];
  if (image) {
    content[0] = {
      type: "text",
      text: "Transcribe the text you can see in this image. Extraction only: do not interpret it.",
    };
    content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${image.toString("base64")}` } });
  }

  return {
    url,
    headers: { "Content-Type": "application/json", Authorization: `${scheme} ${key}` },
    body: JSON.stringify({
      model: flags.model ?? DEFAULT_MODEL,
      // Reasoning tokens count toward max_tokens; 200 was fully spent on reasoning for an image (content came back null).
      max_tokens: Number(flags["max-tokens"] ?? 3000),
      messages: [{ role: "user", content }],
    }),
  };
});

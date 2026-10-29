import { requireEnv, runSmoke } from "./smoke-lib";

// Muse Spark through the Meta API, Chat Completions format.
// Request shape comes from Meta's official docs (see docs/models-notes.md, tagged "documented"); this script
// is how we turn it into "observed".
//   pnpm smoke:spark                      text-only, checks key + URL + model name
//   pnpm smoke:spark chart.jpg            adds the image as an image_url data URL
//   pnpm smoke:spark chart.jpg --mime=image/png
runSmoke("spark", (image, flags) => {
  const base = requireEnv("META_API_BASE_URL");
  const key = requireEnv("META_API_KEY");
  const model = requireEnv("META_SPARK_MODEL");

  const content: unknown[] = [{ type: "text", text: "Reply with the single word: ready." }];
  if (image) {
    content[0] = {
      type: "text",
      text: "Transcribe the text you can see in this image. Extraction only: do not interpret it.",
    };
    const mime = flags.mime ?? "image/jpeg";
    content.push({ type: "image_url", image_url: { url: `data:${mime};base64,${image.toString("base64")}` } });
  }

  return {
    url: `${base}/chat/completions`,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    // Reasoning tokens count toward max_tokens; 200 was fully spent on reasoning for an image (content came back null).
    body: JSON.stringify({ model, max_tokens: Number(flags["max-tokens"] ?? 3000), messages: [{ role: "user", content }] }),
  };
});

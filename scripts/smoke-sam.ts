import { RequestShapeUnknown, requireEnv, runSmoke } from "./smoke-lib";

runSmoke("sam", () => {
  // SAM 3.1 through the Meta API.
  requireEnv("META_API_KEY");
  requireEnv("META_API_BASE_URL");
  requireEnv("META_SAM_MODEL");
  throw new RequestShapeUnknown(
    "Request shape not filled in. Copy the endpoint path, auth header name and body format from the provider docs, then record them in docs/models-notes.md. Do not guess.",
  );
  // Fill in: return { url: `${base}/<path from docs>`, headers: { <auth header from docs> }, body: <body from docs> };
});

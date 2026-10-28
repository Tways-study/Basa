import { RequestShapeUnknown, requireEnv, runSmoke } from "./smoke-lib";

runSmoke("spark-open", () => {
  // Muse Spark Open (meta-models/muse-spark-open-1026) on Baseten.
  requireEnv("BASETEN_API_KEY");
  requireEnv("BASETEN_MODEL_URL");
  throw new RequestShapeUnknown(
    "Request shape not filled in. Copy the endpoint path, auth header name and body format from the provider docs, then record them in docs/models-notes.md. Do not guess.",
  );
  // Fill in: return { url: `${base}/<path from docs>`, headers: { <auth header from docs> }, body: <body from docs> };
});

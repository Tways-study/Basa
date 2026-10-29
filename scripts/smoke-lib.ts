import { readFile } from "node:fs/promises";

// Server-side only. Run with `pnpm smoke:<name> [path/to/synthetic-chart.jpg] [--flag=value]`.
// With no image path the script sends a text-only call, which checks the key, URL and model name first.
// Prints the raw response so we write down what the API really returns (docs/models-notes.md).
// Never prints keys or request headers.

export interface SmokeRequest {
  url: string;
  headers: Record<string, string>;
  body: BodyInit;
}

/** Thrown by each script's buildRequest until the real shape is copied from the provider's docs. */
export class RequestShapeUnknown extends Error {}

export async function runSmoke(
  name: string,
  buildRequest: (image: Buffer | null, flags: Record<string, string>) => SmokeRequest,
): Promise<void> {
  const args = process.argv.slice(2);
  const flags = Object.fromEntries(
    args.filter((a) => a.startsWith("--")).map((a) => a.slice(2).split("=") as [string, string]),
  );
  const imagePath = args.find((a) => !a.startsWith("--"));
  // Synthetic charts only: never point this at a real patient image.
  const image = imagePath ? await readFile(imagePath) : null;

  let req: SmokeRequest;
  try {
    req = buildRequest(image, flags);
  } catch (err) {
    if (err instanceof RequestShapeUnknown) {
      console.error(`[${name}] ${err.message}`);
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  const started = performance.now();
  try {
    const res = await fetch(req.url, {
      method: "POST",
      headers: req.headers,
      body: req.body,
      signal: AbortSignal.timeout(60_000),
    });
    const latencyMs = Math.round(performance.now() - started);
    const text = await res.text();
    console.log(`[${name}] status=${res.status} latency=${latencyMs}ms content-type=${res.headers.get("content-type")}`);
    console.log(`[${name}] image bytes sent: ${image ? image.length : 0}`);
    console.log(text.length > 20_000 ? `${text.slice(0, 20_000)}\n... (truncated)` : text);
    if (!res.ok) process.exitCode = 1;
  } catch (err) {
    // A timeout or network error is a smoke-test result too: record it in models-notes.md.
    // Print only the error kind, never the error object: Node's fetch errors echo the input, which can be a secret.
    const kind = err instanceof Error ? `${err.name}: ${err.message}` : "unknown error";
    const code = err instanceof Error && err.cause instanceof Error ? ` (${err.cause.name})` : "";
    console.error(`[${name}] request failed after ${Math.round(performance.now() - started)}ms: ${kind}${code}`);
    process.exitCode = 1;
  }
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new RequestShapeUnknown(`Missing env var ${name}. Set it in .env.local (see .env.example).`);
  return value;
}

import { readFile } from "node:fs/promises";

// Server-side only. Run with `pnpm smoke:<name> path/to/synthetic-chart.jpg`.
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
  buildRequest: (image: Buffer) => SmokeRequest,
): Promise<void> {
  const imagePath = process.argv[2];
  if (!imagePath) {
    console.error(`Usage: pnpm smoke:${name} path/to/synthetic-chart.jpg (synthetic charts only)`);
    process.exitCode = 1;
    return;
  }

  const image = await readFile(imagePath);
  let req: SmokeRequest;
  try {
    req = buildRequest(image);
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
    console.log(`[${name}] image bytes sent: ${image.length}`);
    console.log(text.length > 20_000 ? `${text.slice(0, 20_000)}\n... (truncated)` : text);
    if (!res.ok) process.exitCode = 1;
  } catch (err) {
    // A timeout or network error is a smoke-test result too: record it in models-notes.md.
    console.error(`[${name}] request failed after ${Math.round(performance.now() - started)}ms:`, err);
    process.exitCode = 1;
  }
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new RequestShapeUnknown(`Missing env var ${name}. Set it in .env.local (see .env.example).`);
  return value;
}

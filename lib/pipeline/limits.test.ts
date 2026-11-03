import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { REQUEST_TIMEOUT_MS } from "@/lib/models/chat";
import { STALL_AFTER_MS } from "@/lib/ui/scan-status";
import { RUN_BUDGET_MS, STALE_AFTER_MS } from "./run";

// Next reads `maxDuration` statically, so each route holds a literal number. These tests keep those numbers
// in the order that stops a run being killed mid-read (the 2026-11-03 stuck scans).
const routes = ["app/api/sync/route.ts", "app/api/scans/[id]/resume/route.ts"];

function maxDurationMs(file: string): number {
  const source = readFileSync(path.join(process.cwd(), file), "utf8");
  const match = /export const maxDuration = (\d+);/.exec(source);
  if (!match) throw new Error(`${file} has no literal maxDuration`);
  return Number(match[1]) * 1000;
}

describe("time limits", () => {
  it.each(routes)("%s: the run gives up before the platform would kill it, with room to wrap up", (file) => {
    const limit = maxDurationMs(file);
    expect(RUN_BUDGET_MS).toBeLessThan(limit);
    // After the deadline the run still has to store failed readings, reconcile and set the final status.
    expect(limit - RUN_BUDGET_MS).toBeGreaterThanOrEqual(10_000);
  });

  it.each(routes)("%s: a scan is only called stale after the function that owned it is gone", (file) => {
    expect(STALE_AFTER_MS).toBeGreaterThan(maxDurationMs(file));
  });

  it("the page waits longer than the server before offering a retry the server will accept", () => {
    expect(STALL_AFTER_MS).toBeGreaterThan(STALE_AFTER_MS);
  });

  it("the sync and resume routes use the same limit", () => {
    expect(maxDurationMs(routes[0])).toBe(maxDurationMs(routes[1]));
  });

  it("one model call, even when every attempt hangs, fits inside the run budget", () => {
    // Three attempts (two retries) plus the short pauses between them, about 2.4 s. At 40 s per attempt this was
    // about 122 s, longer than the whole 60 s function, which is how scans got stuck on 2026-11-03.
    const worstCaseMs = 3 * REQUEST_TIMEOUT_MS + 3_000;
    expect(worstCaseMs).toBeLessThan(RUN_BUDGET_MS);
  });

  it("keeps the request timeout well above how long healthy calls take", () => {
    // Healthy calls took 1 to 8 s (31 s once) in the held-out run; a timeout under 10 s would cut off real answers.
    expect(REQUEST_TIMEOUT_MS).toBeGreaterThanOrEqual(10_000);
  });
});

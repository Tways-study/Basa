import { describe, expect, it } from "vitest";
import { JobStatusSchema } from "@/lib/schemas";
import {
  describeStatus,
  headingFor,
  isStalled,
  isTerminal,
  nextPollDelay,
  PIPELINE_STEPS,
  POLL_INTERVAL_MS,
  progressKey,
  STALL_AFTER_MS,
} from "./scan-status";

describe("describeStatus", () => {
  it("has a view for every job status", () => {
    for (const status of JobStatusSchema.options) {
      const view = describeStatus(status);
      expect(view.label.length).toBeGreaterThan(0);
      expect(view.detail.length).toBeGreaterThan(0);
    }
  });

  it("maps tones to meaning: amber for needs a person, green for done, red for failed", () => {
    expect(describeStatus("needs_review").tone).toBe("flag");
    expect(describeStatus("done").tone).toBe("verified");
    expect(describeStatus("failed").tone).toBe("stamp");
    expect(describeStatus("reading").tone).toBe("progress");
  });

  it("never uses an em-dash in copy", () => {
    for (const status of JobStatusSchema.options) {
      const { label, detail } = describeStatus(status);
      expect(`${label} ${detail}`).not.toMatch(/[–—]/);
    }
  });
});

describe("headingFor", () => {
  it("names the state: one heading while the machine works, then review, confirmed, failed", () => {
    expect(headingFor("queued")).toBe(headingFor("reconciling"));
    expect(headingFor("needs_review")).toBe("Review the scan");
    expect(headingFor("done")).toBe("Record confirmed");
    expect(headingFor("failed")).toBe("Scan failed");
  });

  it("has a heading for every status, with no em-dash", () => {
    for (const status of JobStatusSchema.options) {
      expect(headingFor(status)).toMatch(/\S/);
      expect(headingFor(status)).not.toMatch(/[–—]/);
    }
  });
});

describe("step", () => {
  it("counts the four machine stages in order, from 1 to PIPELINE_STEPS", () => {
    const running = JobStatusSchema.options.filter((s) => !isTerminal(s));
    expect(running.map((s) => describeStatus(s).step)).toEqual([1, 2, 3, 4]);
    expect(PIPELINE_STEPS).toBe(running.length);
  });

  it("has no step once a person or a failure takes over", () => {
    for (const status of JobStatusSchema.options.filter(isTerminal)) {
      expect(describeStatus(status).step).toBeNull();
    }
  });
});

describe("isTerminal", () => {
  it("stops polling only on needs_review, done and failed", () => {
    const terminal = JobStatusSchema.options.filter(isTerminal);
    expect(terminal).toEqual(["needs_review", "done", "failed"]);
  });
});

describe("nextPollDelay", () => {
  it("polls at the normal interval while healthy", () => {
    expect(nextPollDelay(0)).toBe(POLL_INTERVAL_MS);
  });

  it("backs off after failures and caps at 10 seconds", () => {
    expect(nextPollDelay(1)).toBe(4000);
    expect(nextPollDelay(2)).toBe(8000);
    expect(nextPollDelay(3)).toBe(10_000);
    expect(nextPollDelay(20)).toBe(10_000);
  });
});

describe("stalled scans", () => {
  it("only a scan that is still being worked on can stall, and only after the delay", () => {
    for (const status of ["queued", "segmenting", "reading", "reconciling"] as const) {
      expect(isStalled(status, 0, STALL_AFTER_MS - 1)).toBe(false);
      expect(isStalled(status, 0, STALL_AFTER_MS)).toBe(true);
    }
  });

  it("a finished, reviewed or failed scan never counts as stalled", () => {
    for (const status of ["needs_review", "done", "failed"] as const) {
      expect(isStalled(status, 0, STALL_AFTER_MS * 10)).toBe(false);
    }
  });

  it("waits long enough that a healthy slow run is not called stalled", () => {
    // The run itself may take up to 100 s (RUN_BUDGET_MS in lib/pipeline/run.ts).
    expect(STALL_AFTER_MS).toBeGreaterThan(100_000);
  });

  it("shows progress when the status, the regions or the stored readings change", () => {
    const scan = (status: "reading" | "needs_review", readingsPerRegion: number[]) =>
      progressKey({ status, regions: readingsPerRegion.map((n) => ({ readings: Array.from({ length: n }) })) } as unknown as Parameters<typeof progressKey>[0]);
    const base = scan("reading", [1, 0]);
    expect(scan("reading", [1, 0])).toBe(base);
    expect(scan("reading", [1, 1])).not.toBe(base);
    expect(scan("reading", [1, 0, 0])).not.toBe(base);
    expect(scan("needs_review", [1, 0])).not.toBe(base);
  });
});

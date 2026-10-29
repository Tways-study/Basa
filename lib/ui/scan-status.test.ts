import { describe, expect, it } from "vitest";
import { JobStatusSchema } from "@/lib/schemas";
import { describeStatus, isTerminal, nextPollDelay, POLL_INTERVAL_MS } from "./scan-status";

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

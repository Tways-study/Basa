import { describe, expect, it } from "vitest";
import { clearDraft, loadDraft, saveDraft, type DraftStorage } from "./review-draft";

function memory(): DraftStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const answers = {
  "region-1": {
    "header.date": { key: "header.date", source: "agreed", value: "2026-03-14" },
    "header.chart_no": { key: "header.chart_no", source: "unreadable", value: null },
  },
} as const;

describe("review draft", () => {
  it("comes back as saved, per scan", () => {
    const s = memory();
    saveDraft(s, "scan-a", answers);
    expect(loadDraft(s, "scan-a")).toEqual(answers);
    expect(loadDraft(s, "scan-b")).toBeNull();
  });

  it("drops undecided entries and stores nothing when nothing is decided", () => {
    const s = memory();
    saveDraft(s, "scan-a", { "region-1": { "header.date": undefined } });
    expect(s.data.size).toBe(0);
  });

  it("is removed when cleared, and when everything is undone", () => {
    const s = memory();
    saveDraft(s, "scan-a", answers);
    clearDraft(s, "scan-a");
    expect(loadDraft(s, "scan-a")).toBeNull();
    saveDraft(s, "scan-a", answers);
    saveDraft(s, "scan-a", {});
    expect(s.data.size).toBe(0);
  });

  it("ignores and removes a draft that is not valid answers", () => {
    const s = memory();
    s.setItem("basa-review-draft:scan-a", "not json");
    expect(loadDraft(s, "scan-a")).toBeNull();
    expect(s.data.size).toBe(0);
    s.setItem("basa-review-draft:scan-a", JSON.stringify({ r: { "header.date": { key: "header.date", source: "edited", value: null } } }));
    expect(loadDraft(s, "scan-a")).toBeNull();
    expect(s.data.size).toBe(0);
  });
});

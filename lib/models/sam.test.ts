import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BudgetExceededError, CallBudget } from "@/lib/pipeline/budget";
import {
  applyRefinement,
  buildBoxPrompt,
  createSamRefiner,
  parseSamLine,
  readSamStream,
  toFractionBox,
} from "./sam";
import type { SegmentedRegion } from "./types";

const noSleep = async () => {};

beforeEach(() => {
  vi.stubEnv("META_API_KEY", "sam-key-not-real");
  vi.stubEnv("META_API_BASE_URL", "https://meta.example.test/v1");
  vi.stubEnv("META_SAM_MODEL", "sam-test");
});
afterEach(() => vi.unstubAllEnvs());

// Payloads are made up. They include "," and "|" and a lone "~" because real base85 payloads can.
const LINE =
  "<0f>1<|box;x1=172;y1=193;x2=927;y2=378;w=1100;h=1400|><|mask;x=0;y=0;data=2,3,~!!#z,7|#K~|>," +
  "3<|box;x1=177;y1=649;x2=528;y2=750;w=1100;h=1400;c=0.91|><|mask;x=0;y=0;c=0.91;data=2,2,!ab|>";

const sse = (events: [string, unknown][]) =>
  events.map(([name, data]) => `event: ${name}\ndata: ${typeof data === "string" ? data : JSON.stringify(data)}\n\n`).join("") +
  "data: [DONE]\n\n";

const stream = (lines: string[]) =>
  sse([
    ["response.created", { response: {} }],
    ...lines.map((delta): [string, unknown] => ["response.output_text.delta", { content_index: 0, delta }]),
    // The real stream repeats the payload here; reading it would count every object twice.
    ["response.output_text.done", { text: lines.join("") }],
    ["response.completed", { response: {} }],
  ]);

describe("parseSamLine", () => {
  it("reads ids, pixel boxes and raw masks, even when the payload holds commas and bars", () => {
    const records = parseSamLine(LINE);
    expect(records.map((r) => r.id)).toEqual([1, 3]); // ids are sparse, never positions
    expect(records[0].box).toEqual({ x1: 172, y1: 193, x2: 927, y2: 378, w: 1100, h: 1400 });
    expect(records[0].mask).toEqual({ height: 2, width: 3, encoding: "~", payload: "!!#z,7|#K~" });
    expect(records[1].mask.encoding).toBe("!");
  });

  it("keeps the last record when the line ends with a newline, as the real stream does", () => {
    expect(parseSamLine(`${LINE}\n`).map((r) => r.id)).toEqual([1, 3]);
  });

  it("reads the confidence form too, and an empty line is zero matches", () => {
    expect(parseSamLine(LINE)[1].box.x1).toBe(177);
    expect(parseSamLine("")).toEqual([]);
  });
});

describe("readSamStream", () => {
  it("returns each delta line once, ignoring the repeats in the done events", () => {
    expect(readSamStream(stream([LINE]))).toEqual([LINE]);
  });
  it("treats a completed stream with no deltas as zero matches", () => {
    expect(readSamStream(stream([]))).toEqual([]);
  });
  it("rejects a stream that never completed", () => {
    const cut = sse([["response.output_text.delta", { delta: LINE }]]);
    expect(() => readSamStream(cut)).toThrow(/before it completed/);
  });
});

describe("buildBoxPrompt", () => {
  it("numbers objects from 1 and keeps corners inside the image, inclusive", () => {
    const text = buildBoxPrompt([{ x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, { x: 0.9, y: 0.9, w: 0.1, h: 0.1 }], 1000, 2000);
    expect(text).toBe(
      "<0f>1<|box;x1=100;y1=200;x2=599;y2=1199;w=1000;h=2000|>,2<|box;x1=900;y1=1800;x2=999;y2=1999;w=1000;h=2000|>",
    );
  });
});

describe("refinement", () => {
  const region = (x: number, y: number, w: number, h: number): SegmentedRegion => ({
    kind: "table",
    bbox: { x, y, w, h },
    maskPath: null,
  });
  const record = (id: number, x1: number, y1: number, x2: number, y2: number) => parseSamLine(
    `<0f>${id}<|box;x1=${x1};y1=${y1};x2=${x2};y2=${y2};w=100;h=100|><|mask;x=0;y=0;data=1,1,~a|>`,
  )[0];

  it("turns inclusive pixel corners into a fractional box", () => {
    expect(toFractionBox(record(1, 10, 20, 59, 69).box)).toEqual({ x: 0.1, y: 0.2, w: 0.5, h: 0.5 });
  });

  it("swaps in SAM's box by id, keeps the proposal when SAM missed it or went somewhere else", () => {
    const regions = [region(0.1, 0.1, 0.5, 0.5), region(0.1, 0.7, 0.2, 0.2), region(0.6, 0.6, 0.3, 0.3)];
    const out = applyRefinement(regions, [record(1, 12, 12, 58, 58), record(3, 0, 0, 5, 5)]);
    expect(out[0].bbox.x).toBeCloseTo(0.11); // refined, with the 1% margin
    expect(out[1]).toBe(regions[1]); // no record for id 2
    expect(out[2]).toBe(regions[2]); // id 3 overlaps the proposal by less than 30%
  });
});

describe("createSamRefiner", () => {
  let image: Uint8Array;
  beforeEach(async () => {
    image = new Uint8Array(await sharp({ create: { width: 100, height: 100, channels: 3, background: "#fff" } }).jpeg().toBuffer());
  });
  const regions: SegmentedRegion[] = [{ kind: "table", bbox: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, maskPath: null }];
  const ok = (line: string) => new Response(stream([line]), { headers: { "Content-Type": "text/event-stream" } });
  const lineFor = "<0f>1<|box;x1=12;y1=12;x2=58;y2=58;w=100;h=100|><|mask;x=0;y=0;data=1,1,~a|>";

  it("sends the documented request and returns the refined box", async () => {
    const fetchImpl = vi.fn(async () => ok(lineFor));
    const out = await createSamRefiner({ fetchImpl }).refine(image, regions);
    expect(out[0].bbox.x).toBeCloseTo(0.11);
    expect(out[0].maskPath).toBeNull();

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://meta.example.test/v1/responses");
    expect((init.headers as Record<string, string>).Accept).toBe("text/event-stream");
    const sent = JSON.parse(init.body as string);
    expect(sent).toMatchObject({ model: "sam-test", stream: true });
    expect(sent.input[0].content[0].text).toMatch(/^<0f>1<\|box;x1=10;y1=10;/);
    expect(sent.input[0].content[1].image_url).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("keeps the proposed boxes when SAM keeps failing, and never leaks the key", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl = vi.fn(async () => Response.json({ error: { message: "overloaded" } }, { status: 503 }));
    const out = await createSamRefiner({ fetchImpl, sleep: noSleep }).refine(image, regions);
    expect(out).toEqual(regions);
    expect(fetchImpl).toHaveBeenCalledTimes(3); // one try and two bounded retries
    expect(warn.mock.calls.flat().join(" ")).toContain("HTTP 503");
    expect(warn.mock.calls.flat().join(" ")).not.toContain("sam-key-not-real");
    warn.mockRestore();
  });

  it("counts every attempt against the call cap, and lets the cap stop the scan", async () => {
    const budget = new CallBudget(0);
    const fetchImpl = vi.fn(async () => ok(lineFor));
    await expect(
      createSamRefiner({ fetchImpl, onRequest: () => budget.take() }).refine(image, regions),
    ).rejects.toBeInstanceOf(BudgetExceededError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

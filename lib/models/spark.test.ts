import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BudgetExceededError, CallBudget } from "@/lib/pipeline/budget";
import { createSparkReader, createSparkSegmenter, extractJson } from "./spark";

const image = new Uint8Array([1, 2, 3]);
const noSleep = async () => {};

beforeEach(() => {
  vi.stubEnv("META_API_KEY", "test-key-not-real");
  vi.stubEnv("META_API_BASE_URL", "https://meta.example.test/v1");
  vi.stubEnv("META_SPARK_MODEL", "muse-spark-test");
});
afterEach(() => vi.unstubAllEnvs());

const reply = (content: string | null, finish = "stop") =>
  Response.json({ choices: [{ finish_reason: finish, message: { content } }] });

describe("extractJson", () => {
  it("reads JSON wrapped in a code fence or a sentence", () => {
    expect(extractJson('```json\n{"line1":"hi"}\n```')).toEqual({ line1: "hi" });
    expect(extractJson('Here you go: [{"a":1}] done')).toEqual([{ a: 1 }]);
  });
  it("throws when there is no JSON", () => {
    expect(() => extractJson("I cannot help")).toThrow(/no JSON/);
  });
});

describe("reader", () => {
  it("returns validated fields and sends the documented request", async () => {
    const fetchImpl = vi.fn(async () => reply('{"stamp.present": true, "stamp.text": "RECEIVED"}'));
    const reading = await createSparkReader({ fetchImpl }).readRegion({ regionId: "r1", kind: "stamp", image });
    expect(reading).toMatchObject({ regionId: "r1", model: "muse_spark", error: null });
    expect(reading.fields).toEqual({ "stamp.present": true, "stamp.text": "RECEIVED" });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://meta.example.test/v1/chat/completions");
    const sent = JSON.parse(init.body as string);
    expect(sent).toMatchObject({ model: "muse-spark-test", reasoning_effort: "minimal", max_tokens: 1500 });
    expect(sent.messages[0].content[1].image_url.url).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("shows the model the exact key shape, without the word that led it to invent a key", async () => {
    const fetchImpl = vi.fn(async () => reply('{"signature.present": true}'));
    await createSparkReader({ fetchImpl }).readRegion({ regionId: "r1", kind: "signature", image });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const prompt: string = JSON.parse(init.body as string).messages[0].content[0].text;
    expect(prompt).toContain('{"signature.present": true}');
    expect(prompt.toLowerCase()).not.toContain("transcription");
  });

  it("tells the table reader to skip the chart's own header row", async () => {
    const fetchImpl = vi.fn(async () => reply('{"row1.test": "Glucose", "row1.value": "5.1", "row1.unit": "mmol/L"}'));
    await createSparkReader({ fetchImpl }).readRegion({ regionId: "r1", kind: "table", image });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const prompt: string = JSON.parse(init.body as string).messages[0].content[0].text;
    expect(prompt).toContain("Skip the header row");
  });

  it("treats finish_reason length as a failed reading, not an answer", async () => {
    const fetchImpl = vi.fn(async () => reply('{"line1":"cut off', "length"));
    const reading = await createSparkReader({ fetchImpl }).readRegion({ regionId: "r1", kind: "handwriting", image });
    expect(reading.error).toMatch(/ran out of tokens/);
    expect(reading.fields).toEqual({});
  });

  it("treats empty content as a failed reading", async () => {
    const fetchImpl = vi.fn(async () => reply(null));
    const reading = await createSparkReader({ fetchImpl }).readRegion({ regionId: "r1", kind: "stamp", image });
    expect(reading.error).toMatch(/empty/);
  });

  it("fails a reading whose keys break the shared field-key contract", async () => {
    const fetchImpl = vi.fn(async () => reply('{"patient": "x"}'));
    const reading = await createSparkReader({ fetchImpl }).readRegion({ regionId: "r1", kind: "header", image });
    expect(reading.error).toMatch(/expected fields/);
  });

  it("retries a 500 twice, then gives up, and never puts the key in the error", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ error: { message: "overloaded" } }, { status: 500 }));
    const reading = await createSparkReader({ fetchImpl, sleep: noSleep }).readRegion({ regionId: "r1", kind: "stamp", image });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(reading.error).toContain("HTTP 500");
    expect(reading.error).not.toContain("test-key-not-real");
  });

  it("does not retry a 401", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ error: { message: "bad key" } }, { status: 401 }));
    const reading = await createSparkReader({ fetchImpl, sleep: noSleep }).readRegion({ regionId: "r1", kind: "stamp", image });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(reading.error).toContain("HTTP 401");
  });

  it("lets the call cap stop the scan instead of becoming a region error", async () => {
    const budget = new CallBudget(0);
    const fetchImpl = vi.fn(async () => reply("{}"));
    await expect(
      createSparkReader({ fetchImpl, onRequest: () => budget.take() }).readRegion({ regionId: "r1", kind: "stamp", image }),
    ).rejects.toBeInstanceOf(BudgetExceededError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("segmenter", () => {
  it("turns grid boxes into padded fractional regions, one per kind", async () => {
    const fetchImpl = vi.fn(async () =>
      reply(
        JSON.stringify([
          { kind: "table", box: [100, 200, 900, 600] },
          { kind: "table", box: [0, 0, 10, 10] },
          { kind: "stamp", box: [700, 700, 700, 800] },
        ]),
      ),
    );
    const regions = await createSparkSegmenter({ fetchImpl }).segment(image);
    expect(regions).toHaveLength(1); // duplicate table dropped, empty stamp box dropped
    expect(regions[0].kind).toBe("table");
    expect(regions[0].maskPath).toBeNull();
    expect(regions[0].bbox.x).toBeCloseTo(0.06);
    expect(regions[0].bbox.y).toBeCloseTo(0.16);
  });
});

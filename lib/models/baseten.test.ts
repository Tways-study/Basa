import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BudgetExceededError, CallBudget } from "@/lib/pipeline/budget";
import { createBasetenReader } from "./baseten";

const image = new Uint8Array([1, 2, 3]);
const noSleep = async () => {};

beforeEach(() => {
  vi.stubEnv("BASETEN_API_KEY", "baseten-key-not-real");
  vi.stubEnv("BASETEN_MODEL_URL", "https://baseten.example.test/v1/chat/completions");
  vi.stubEnv("BASETEN_MODEL", "meta-models/test-model");
});
afterEach(() => vi.unstubAllEnvs());

// Baseten always adds reasoning_content next to content (observed); it must never be read.
const reply = (content: string | null, finish = "stop") =>
  Response.json({ choices: [{ finish_reason: finish, message: { content, reasoning_content: "the model thinking aloud" } }] });

describe("Baseten reader", () => {
  it("posts to the full endpoint with low reasoning effort and reads only content", async () => {
    const fetchImpl = vi.fn(async () => reply('{"stamp.present": true, "stamp.text": "RECEIVED"}'));
    const reading = await createBasetenReader({ fetchImpl }).readRegion({ regionId: "r1", kind: "stamp", image });
    expect(reading).toMatchObject({ regionId: "r1", model: "muse_spark_open", error: null });
    expect(reading.fields).toEqual({ "stamp.present": true, "stamp.text": "RECEIVED" });
    expect(JSON.stringify(reading)).not.toContain("thinking aloud");

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://baseten.example.test/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer baseten-key-not-real");
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: "meta-models/test-model",
      reasoning_effort: "low",
      max_tokens: 1500,
    });
  });

  it("treats finish_reason length as a failed reading even when reasoning was produced", async () => {
    const fetchImpl = vi.fn(async () => reply(null, "length"));
    const reading = await createBasetenReader({ fetchImpl }).readRegion({ regionId: "r1", kind: "handwriting", image });
    expect(reading.error).toMatch(/Muse Spark Open ran out of tokens/);
    expect(reading.fields).toEqual({});
  });

  it("reads Baseten's string error body and names the model in the message", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ error: "please check the model you provided" }, { status: 404 }));
    const reading = await createBasetenReader({ fetchImpl, sleep: noSleep }).readRegion({ regionId: "r1", kind: "stamp", image });
    expect(fetchImpl).toHaveBeenCalledTimes(1); // a 404 will not change on retry
    expect(reading.error).toBe("Muse Spark Open returned HTTP 404: please check the model you provided");
  });

  it("retries a 503 twice, then fails the reading without leaking the key", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ error: "busy" }, { status: 503 }));
    const reading = await createBasetenReader({ fetchImpl, sleep: noSleep }).readRegion({ regionId: "r1", kind: "stamp", image });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(reading.error).toContain("HTTP 503");
    expect(reading.error).not.toContain("baseten-key-not-real");
  });

  it("names the missing variable, not a value, when the Baseten env is incomplete", async () => {
    vi.stubEnv("BASETEN_MODEL_URL", "");
    const fetchImpl = vi.fn(async () => reply("{}"));
    const reading = await createBasetenReader({ fetchImpl }).readRegion({ regionId: "r1", kind: "stamp", image });
    expect(reading.error).toMatch(/BASETEN_MODEL_URL/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("lets the call cap stop the scan", async () => {
    const budget = new CallBudget(0);
    const fetchImpl = vi.fn(async () => reply("{}"));
    await expect(
      createBasetenReader({ fetchImpl, onRequest: () => budget.take() }).readRegion({ regionId: "r1", kind: "stamp", image }),
    ).rejects.toBeInstanceOf(BudgetExceededError);
  });
});

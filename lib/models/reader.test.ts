import { describe, expect, it, vi } from "vitest";
import { BudgetExceededError } from "@/lib/pipeline/budget";
import { NoJsonError, createChatReader, extractJson, readPrompt } from "./reader";

const input = { regionId: "r1", kind: "header" as const, image: new Uint8Array([1, 2, 3]) };
const good = '{"header.patient_name": "Maria", "header.chart_no": "CH-1", "header.date": "2026-01-01"}';

describe("createChatReader", () => {
  it("reads a good answer with one call", async () => {
    const send = vi.fn().mockResolvedValue(good);
    const reading = await createChatReader("muse_spark", "Muse Spark", send).readRegion(input);
    expect(reading.error).toBeNull();
    expect(reading.fields["header.chart_no"]).toBe("CH-1");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("asks once more when the answer has no JSON, and uses the second answer", async () => {
    const send = vi.fn().mockResolvedValueOnce("I can see a clinic chart.").mockResolvedValueOnce(good);
    const reading = await createChatReader("muse_spark_open", "Muse Spark Open", send).readRegion(input);
    expect(reading.error).toBeNull();
    expect(send).toHaveBeenCalledTimes(2);
    // The second call carries the same prompt and image as the first.
    expect(send.mock.calls[1]).toEqual(send.mock.calls[0]);
  });

  it("fails the reading, and says why, when the second answer has no JSON either", async () => {
    const send = vi.fn().mockResolvedValue("Sorry, no.");
    const reading = await createChatReader("muse_spark_open", "Muse Spark Open", send).readRegion(input);
    expect(send).toHaveBeenCalledTimes(2);
    expect(reading.fields).toEqual({});
    expect(reading.error).toMatch(/no JSON/);
  });

  it("does not retry a wrong answer: bad keys are a failed reading, never repaired", async () => {
    const send = vi.fn().mockResolvedValue('{"transcription": "x"}');
    const reading = await createChatReader("muse_spark", "Muse Spark", send).readRegion(input);
    expect(send).toHaveBeenCalledTimes(1);
    expect(reading.error).toMatch(/did not match the expected fields/);
  });

  it("does not retry a failed call", async () => {
    const send = vi.fn().mockRejectedValue(new Error("Muse Spark returned HTTP 401"));
    const reading = await createChatReader("muse_spark", "Muse Spark", send).readRegion(input);
    expect(send).toHaveBeenCalledTimes(1);
    expect(reading.error).toMatch(/HTTP 401/);
  });

  it("lets the call cap stop the scan, including on the retry", async () => {
    const send = vi.fn().mockResolvedValueOnce("words only").mockRejectedValueOnce(new BudgetExceededError(30));
    await expect(createChatReader("muse_spark", "Muse Spark", send).readRegion(input)).rejects.toBeInstanceOf(BudgetExceededError);
  });
});

describe("extractJson", () => {
  it("throws a NoJsonError that keeps the old message", () => {
    expect(() => extractJson("nothing here")).toThrow(NoJsonError);
    expect(() => extractJson("nothing here")).toThrow(/no JSON/);
  });
});

describe("readPrompt", () => {
  it("still asks for extraction only, with an exact shape and no banned word", () => {
    for (const kind of ["header", "table", "handwriting", "stamp", "signature"] as const) {
      const prompt = readPrompt(kind);
      expect(prompt).toContain("Do not interpret");
      expect(prompt).toContain("Use only the keys named above");
      expect(prompt.toLowerCase()).not.toContain("transcription");
    }
  });
});

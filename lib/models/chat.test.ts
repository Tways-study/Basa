import { describe, expect, it, vi } from "vitest";
import { DeadlineError, chatCompletion, requestSignal, type ChatTarget } from "./chat";

const target: ChatTarget = {
  label: "Test Model",
  endpoint: "https://example.test/v1/chat/completions",
  key: "test-key",
  model: "test-model",
  reasoningEffort: "minimal",
};
const image = new Uint8Array([1, 2, 3]);
const ok = () => Response.json({ choices: [{ finish_reason: "stop", message: { content: "hello" } }] });
const asFetch = (fn: unknown) => fn as typeof fetch;

describe("the run deadline in model calls", () => {
  it("does not start an attempt, or count a call, once the deadline has passed", async () => {
    const run = new AbortController();
    run.abort();
    const fetchImpl = vi.fn();
    const onRequest = vi.fn();
    await expect(
      chatCompletion(target, "p", image, { signal: run.signal, fetchImpl: asFetch(fetchImpl), onRequest, sleep: async () => {} }),
    ).rejects.toBeInstanceOf(DeadlineError);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(onRequest).not.toHaveBeenCalled();
  });

  it("cuts an in-flight request off when the deadline fires, and does not retry it", async () => {
    // A request that never answers, like a hung model, and gives up only when its signal fires.
    const fetchImpl = vi.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true })),
    );
    const sleep = vi.fn(async () => {});
    const run = new AbortController();
    setTimeout(() => run.abort(), 10);
    await expect(chatCompletion(target, "p", image, { signal: run.signal, fetchImpl: asFetch(fetchImpl), sleep })).rejects.toBeInstanceOf(
      DeadlineError,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("stops retrying when the deadline passes while waiting between attempts", async () => {
    const run = new AbortController();
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });
    // The deadline fires during the pause before the second attempt.
    const sleep = vi.fn(async () => run.abort());
    await expect(chatCompletion(target, "p", image, { signal: run.signal, fetchImpl: asFetch(fetchImpl), sleep })).rejects.toBeInstanceOf(
      DeadlineError,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("still retries a network failure when there is no deadline", async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(new Error("network down")).mockResolvedValueOnce(ok());
    const sleep = vi.fn(async () => {});
    await expect(chatCompletion(target, "p", image, { fetchImpl: asFetch(fetchImpl), sleep })).resolves.toBe("hello");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("gives a request signal that follows the run deadline", () => {
    expect(requestSignal({}).aborted).toBe(false);
    const run = new AbortController();
    const signal = requestSignal({ signal: run.signal });
    expect(signal.aborted).toBe(false);
    run.abort();
    expect(signal.aborted).toBe(true);
  });

  it("says in plain words that it ran out of time, with no key or URL", () => {
    const message = new DeadlineError().message;
    expect(message).toMatch(/ran out of time/i);
    expect(message).not.toMatch(/https?:|key|bearer/i);
  });
});

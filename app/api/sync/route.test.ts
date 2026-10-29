import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES } from "@/lib/schemas";
import { POST } from "./route";

const post = (form: FormData) => POST(new Request("http://localhost/api/sync", { method: "POST", body: form }));
const id = "6f1f2c1e-8d5b-4c4e-9a53-2f4a1e0b7c11";

describe("POST /api/sync validation", () => {
  it("rejects a missing or malformed scanId", async () => {
    const form = new FormData();
    form.set("image", new File([new Uint8Array([1])], "a.jpg", { type: "image/jpeg" }));
    expect((await post(form)).status).toBe(400);
    form.set("scanId", "not-a-uuid");
    expect((await post(form)).status).toBe(400);
  });

  it("rejects a request with no image", async () => {
    const form = new FormData();
    form.set("scanId", id);
    expect((await post(form)).status).toBe(400);
  });

  it("answers 413 for an image over the upload limit", async () => {
    const form = new FormData();
    form.set("scanId", id);
    form.set("image", new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], "big.jpg", { type: "image/jpeg" }));
    expect((await post(form)).status).toBe(413);
  });

  it("rejects a body that is not form data", async () => {
    const res = await POST(new Request("http://localhost/api/sync", { method: "POST", body: "nope" }));
    expect(res.status).toBe(400);
  });
});

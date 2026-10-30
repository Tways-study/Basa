import { afterEach, describe, expect, it, vi } from "vitest";
import { reconcile } from "@/lib/pipeline/reconcile";
import { getModelAdapters } from "./index";

afterEach(() => vi.unstubAllEnvs());

describe("mock mode", () => {
  it("returns the two real readers, Muse Spark then Muse Spark Open, when mock mode is off", () => {
    vi.stubEnv("MOCK_MODELS", "false");
    const { readers } = getModelAdapters();
    expect(readers.map((r) => r.id)).toEqual(["muse_spark", "muse_spark_open"]);
  });

  it("runs segment, two readers and reconcile with no credentials", async () => {
    vi.stubEnv("MOCK_MODELS", "true");
    const { segmenter, readers } = getModelAdapters();
    const image = new Uint8Array();

    const regions = await segmenter.segment(image);
    expect(regions.map((r) => r.kind)).toEqual(["header", "table", "handwriting", "stamp"]);

    const fields = [];
    for (const [i, region] of regions.entries()) {
      const input = { regionId: `r${i}`, kind: region.kind, image };
      const [a, b] = await Promise.all(readers.map((r) => r.readRegion(input)));
      fields.push(...reconcile(a.fields, b.fields));
    }

    const flagged = fields.filter((f) => f.status === "flagged");
    expect(flagged.map((f) => f.key).sort()).toEqual(["line2", "row2.value", "row4.value"]);
    expect(fields.filter((f) => f.status === "agreed").length).toBeGreaterThan(10);
  });
});

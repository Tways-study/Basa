import { describe, expect, it } from "vitest";
import type { ReconciledField } from "@/lib/schemas";
import { attentionFirst, confirmAgreed, labelForKey, optionsFor, orderFields, progressOf } from "./review-state";

const agreed: ReconciledField = {
  key: "row1.test",
  status: "agreed",
  value: "Hemoglobin",
  readings: { muse_spark: "Hemoglobin", muse_spark_open: "hemoglobin" },
};
const mismatch: ReconciledField = {
  key: "row1.value",
  status: "flagged",
  reason: "mismatch",
  readings: { muse_spark: "7.2", muse_spark_open: "1.2" },
};
const oneFailed: ReconciledField = {
  key: "row1.unit",
  status: "flagged",
  reason: "one_unreadable",
  readings: { muse_spark: "g/dL", muse_spark_open: null },
};

describe("optionsFor", () => {
  it("offers both readers on a mismatch and never an agreed option", () => {
    expect(optionsFor(mismatch).map((o) => o.source)).toEqual(["muse_spark", "muse_spark_open", "edited", "unreadable"]);
  });

  it("leaves out a reader that found nothing", () => {
    expect(optionsFor(oneFailed).map((o) => o.source)).toEqual(["muse_spark", "edited", "unreadable"]);
  });

  it("offers Confirm for an agreed field", () => {
    expect(optionsFor(agreed)[0]).toMatchObject({ source: "agreed", value: "Hemoglobin" });
  });
});

describe("confirmAgreed", () => {
  it("settles agreed fields only and keeps an earlier choice", () => {
    const earlier = { key: "row1.test", source: "edited" as const, value: "Hb" };
    expect(confirmAgreed([agreed, mismatch], {})).toEqual({
      "row1.test": { key: "row1.test", source: "agreed", value: "Hemoglobin" },
    });
    expect(confirmAgreed([agreed], { "row1.test": earlier })["row1.test"]).toBe(earlier);
  });
});

describe("progressOf", () => {
  it("counts what is left and is complete only when everything is decided", () => {
    const fields = [agreed, mismatch, oneFailed];
    expect(progressOf(fields, {})).toEqual({ total: 3, decided: 0, flaggedLeft: 2, agreedLeft: 1, complete: false });
    const confirmed = confirmAgreed(fields, {});
    expect(progressOf(fields, confirmed)).toMatchObject({ decided: 1, flaggedLeft: 2, agreedLeft: 0, complete: false });
    const all = {
      ...confirmed,
      "row1.value": { key: "row1.value", source: "muse_spark" as const, value: "7.2" },
      "row1.unit": { key: "row1.unit", source: "unreadable" as const, value: null },
    };
    expect(progressOf(fields, all).complete).toBe(true);
  });

  it("is not complete with no fields", () => {
    expect(progressOf([], {}).complete).toBe(false);
  });
});

describe("labelForKey", () => {
  it("reads like a person would say it", () => {
    expect(labelForKey("row2.value")).toBe("Row 2, value");
    expect(labelForKey("line3")).toBe("Line 3");
    expect(labelForKey("header.patient_name")).toBe("Header, patient name");
    expect(labelForKey("stamp.text")).toBe("Stamp, text");
  });
});

describe("orderFields", () => {
  it("puts flagged fields first and keeps the order inside each group", () => {
    expect(orderFields([agreed, mismatch, oneFailed]).map((x) => x.key)).toEqual(["row1.value", "row1.unit", "row1.test"]);
  });
  it("does not depend on any answer, so a field never jumps while it is answered", () => {
    expect(orderFields([agreed, mismatch]).map((x) => x.key)).toEqual(orderFields([agreed, mismatch]).map((x) => x.key));
  });
});

describe("attentionFirst", () => {
  const calm = { id: "a", fields: [agreed], readings: [{ error: null }] };
  const flagged = { id: "b", fields: [mismatch], readings: [{ error: null }] };
  const failed = { id: "c", fields: [], readings: [{ error: "timeout" }] };
  it("moves regions that need a person ahead, keeping order inside each group", () => {
    expect(attentionFirst([calm, flagged, failed], (x) => x).map((x) => x.id)).toEqual(["b", "c", "a"]);
  });
});

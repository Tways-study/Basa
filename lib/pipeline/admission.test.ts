import { describe, expect, it } from "vitest";
import { decideAdmission } from "./admission";

const limits = { perHour: 3, perDay: 5 };

describe("decideAdmission", () => {
  it("admits below both limits", () => {
    expect(decideAdmission({ lastHour: 2, lastDay: 4 }, limits)).toEqual({ ok: true });
  });
  it("refuses at the hourly limit", () => {
    expect(decideAdmission({ lastHour: 3, lastDay: 3 }, limits)).toMatchObject({ ok: false, reason: "hour" });
  });
  it("refuses at the daily limit, and says day first when both are hit", () => {
    expect(decideAdmission({ lastHour: 3, lastDay: 5 }, limits)).toMatchObject({ ok: false, reason: "day" });
  });
});

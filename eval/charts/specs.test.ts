import { describe, expect, it } from "vitest";
import { truthFrom } from "../score";
import { SPECS, buildManifest, lineText, truthOf } from "./specs";

describe("chart specs", () => {
  it("have unique ids and the planned split: 20 charts, 8 dev, 12 held-out, 8 hard", () => {
    const manifest = buildManifest();
    expect(new Set(manifest.map((m) => m.id)).size).toBe(manifest.length);
    expect(manifest).toHaveLength(20);
    expect(manifest.filter((m) => m.split === "dev")).toHaveLength(8);
    expect(manifest.filter((m) => m.split === "test")).toHaveLength(12);
    expect(manifest.filter((m) => m.hard)).toHaveLength(8);
  });

  it("spread hard charts across both splits", () => {
    const hard = buildManifest().filter((m) => m.hard);
    expect(hard.filter((m) => m.split === "dev").length).toBeGreaterThanOrEqual(2);
    expect(hard.filter((m) => m.split === "test").length).toBeGreaterThanOrEqual(4);
  });

  it.each(SPECS.map((s) => [s.id, s] as const))("%s gives ground truth that uses only shared field keys", (_id, spec) => {
    const truth = truthFrom(truthOf(spec));
    expect(truth["stamp.present"]).toBe(true);
    expect(truth["stamp.text"]).toBe(`RECEIVED ${spec.stampLine}`);
    // Rows are numbered from 1 with no gaps, and every row has all three keys.
    spec.rows.forEach((_r, i) => {
      for (const k of ["test", "value", "unit"]) expect(truth).toHaveProperty([`row${i + 1}.${k}`]);
    });
    expect(Object.keys(truth).some((k) => k.startsWith(`row${spec.rows.length + 1}.`))).toBe(false);
  });

  it("keep struck words out of the truth and plan 2 charts with crossed-out words", () => {
    const struck = SPECS.filter((s) => s.features.includes("crossed-out"));
    expect(struck).toHaveLength(2);
    for (const spec of struck) {
      const drawn = spec.lines.flat().filter((s) => s.struck).map((s) => s.t);
      expect(drawn.length).toBeGreaterThan(0);
      const truthLines = [lineText(spec.lines[0]), lineText(spec.lines[1])].join(" ");
      for (const word of drawn) expect(truthLines).not.toContain(word);
    }
  });

  it("need a crease row exactly when they have a crease", () => {
    for (const spec of SPECS) {
      expect(Boolean(spec.creaseRow)).toBe(spec.features.includes("crease"));
      if (spec.creaseRow) expect(spec.creaseRow).toBeLessThanOrEqual(spec.rows.length);
    }
  });

  it("use fictional, neutral office remarks: no advice, dosing or treatment words", () => {
    const banned = /\b(dose|dosage|mg|prescri\w*|diagnos\w*|treat\w*|medicat\w*|should|recommend\w*|repeat the test)\b/i;
    for (const spec of SPECS) {
      const text = [...spec.lines.flat().map((s) => s.t), spec.note, spec.clinic].join(" ");
      expect(text).not.toMatch(banned);
      expect(spec.clinic).toMatch(/\(Sample\)$/);
    }
  });
});

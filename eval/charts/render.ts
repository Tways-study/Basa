import sharp, { type OverlayOptions } from "sharp";
import type { ChartSpec, Feature, Segment } from "./specs";

// Draws one chart as an SVG, then degrades it the way a phone photo would. Everything random comes
// from a seeded generator, so the same spec always gives the same image.

export const PAGE_W = 1100;
export const PAGE_H = 1400;

const PAPER = "#efeadf";
const DESK = "#4b4237";
const INK = "#1b1a17";
const FADED = "#97927f";
const HAND_INK = "#1d3a8a";
const HAND_FADED = "#7f8fb5";
const STAMP_INK = "#a82a1c";

/** Small seeded PRNG (mulberry32), so a chart renders identically every time. */
export function seeded(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const has = (spec: ChartSpec, f: Feature) => spec.features.includes(f);

interface Geometry {
  tableTop: number;
  tableBottom: number;
  tableLeft: number;
  tableRight: number;
  rowBase: (i: number) => number;
  notesY: number;
  line1Y: number;
  line2Y: number;
  stamp: { x: number; y: number };
  noteX: number;
}

const ROW_H = 50;

function geometry(spec: ChartSpec): Geometry {
  const tableTop = 400;
  const tableBottom = tableTop + 56 + spec.rows.length * ROW_H + 10;
  const notesY = tableBottom + 56;
  const line1Y = notesY + 64;
  const line2Y = line1Y + 66;
  const overStamp = has(spec, "ink-over-stamp");
  return {
    tableTop,
    tableBottom,
    tableLeft: 150,
    tableRight: 950,
    rowBase: (i) => tableTop + 56 + 36 + i * ROW_H,
    notesY,
    line1Y,
    line2Y,
    // Normally the stamp sits below the notes; for ink-over-stamp it sits where the second line runs.
    stamp: overStamp ? { x: 400, y: line2Y - 78 } : { x: 650, y: line2Y + 70 },
    noteX: has(spec, "edge-text") ? 34 : 150,
  };
}

function handLine(segments: Segment[], x: number, y: number, font: string, size: number, fill: string): string {
  const parts = segments
    .map((s, i) => {
      const text = esc(s.t) + (i < segments.length - 1 ? " " : "");
      return s.struck
        ? `<tspan text-decoration="line-through" fill="${fill}" stroke="${fill}" stroke-width="0.4">${text}</tspan>`
        : `<tspan>${text}</tspan>`;
    })
    .join("");
  return `<text x="${x}" y="${y}" xml:space="preserve" font-family="${font}" font-size="${size}" fill="${fill}">${parts}</text>`;
}

export function pageSvg(spec: ChartSpec): string {
  const g = geometry(spec);
  const faded = has(spec, "low-contrast");
  const print = faded ? FADED : INK;
  const hand = faded ? HAND_FADED : HAND_INK;
  const edge = has(spec, "edge-text");
  const handValues = has(spec, "hand-values");
  const pf = spec.printFont;
  const out: string[] = [];

  out.push(`<rect width="${PAGE_W}" height="${PAGE_H}" fill="${PAPER}"/>`);
  out.push(
    `<text x="${PAGE_W / 2}" y="150" text-anchor="middle" font-family="Times New Roman" font-weight="bold" font-size="40" fill="${print}">${esc(spec.clinic.toUpperCase())}</text>`,
    `<text x="${PAGE_W / 2}" y="184" text-anchor="middle" font-family="${pf}" font-size="17" fill="${print}">LABORATORY RESULTS SHEET</text>`,
    `<line x1="150" x2="950" y1="204" y2="204" stroke="${print}" stroke-width="2"/>`,
  );

  // Header: label on the left, value on the right.
  const head: [string, string][] = [
    ["Patient name:", spec.patientName],
    ["Chart no.:", spec.chartNo],
    ["Date:", spec.date],
  ];
  head.forEach(([label, value], i) => {
    const y = 262 + i * 48;
    out.push(
      `<text x="150" y="${y}" font-family="${pf}" font-size="22" fill="${print}">${label}</text>`,
      `<text x="400" y="${y}" font-family="${pf}" font-size="${value.length > 24 ? 24 : 30}" fill="${print}">${esc(value)}</text>`,
    );
  });

  // Table with its own column titles. The readers are told to skip this row.
  const { tableLeft: L, tableRight: R, tableTop: T, tableBottom: B } = g;
  out.push(`<rect x="${L}" y="${T}" width="${R - L}" height="${B - T}" fill="none" stroke="${print}" stroke-width="2"/>`);
  const testX = edge ? L + 6 : L + 24;
  const valueX = 590;
  const unitX = 770;
  out.push(
    `<text x="${testX}" y="${T + 38}" font-family="${pf}" font-weight="bold" font-size="22" fill="${print}">TEST</text>`,
    `<text x="${valueX}" y="${T + 38}" font-family="${pf}" font-weight="bold" font-size="22" fill="${print}">VALUE</text>`,
    `<text x="${unitX}" y="${T + 38}" font-family="${pf}" font-weight="bold" font-size="22" fill="${print}">UNIT</text>`,
    `<line x1="${L}" x2="${R}" y1="${T + 56}" y2="${T + 56}" stroke="${print}" stroke-width="1.5"/>`,
  );
  spec.rows.forEach((r, i) => {
    const y = g.rowBase(i);
    out.push(`<text x="${testX}" y="${y}" font-family="${pf}" font-size="28" fill="${print}">${esc(r.test)}</text>`);
    out.push(
      handValues
        ? `<text x="${valueX}" y="${y + 2}" font-family="${spec.handFont}" font-size="40" fill="${hand}">${esc(r.value)}</text>`
        : `<text x="${valueX}" y="${y}" font-family="${pf}" font-size="28" fill="${print}">${esc(r.value)}</text>`,
    );
    out.push(
      edge
        ? `<text x="${R - 6}" y="${y}" text-anchor="end" font-family="${pf}" font-size="28" fill="${print}">${esc(r.unit)}</text>`
        : `<text x="${unitX}" y="${y}" font-family="${pf}" font-size="28" fill="${print}">${esc(r.unit)}</text>`,
    );
    out.push(`<line x1="${L}" x2="${R}" y1="${y + 14}" y2="${y + 14}" stroke="${print}" stroke-opacity="0.35" stroke-width="1"/>`);
  });

  // Handwritten notes.
  out.push(`<text x="${g.noteX}" y="${g.notesY}" font-family="${pf}" font-size="17" fill="${print}">NOTES</text>`);
  out.push(handLine(spec.lines[0], g.noteX, g.line1Y, spec.handFont, 38, hand));
  out.push(handLine(spec.lines[1], g.noteX, g.line2Y, spec.handFont, 38, hand));

  // Rubber stamp, rotated a little, drawn under the handwriting only for ink-over-stamp.
  const stamp = `<g transform="translate(${g.stamp.x} ${g.stamp.y}) rotate(-5)" opacity="0.88">
    <rect x="0" y="0" width="310" height="126" fill="none" stroke="${STAMP_INK}" stroke-width="5"/>
    <text x="22" y="52" font-family="${pf}" font-weight="bold" font-size="34" fill="${STAMP_INK}">RECEIVED</text>
    <text x="22" y="98" font-family="${pf}" font-size="26" fill="${STAMP_INK}">${esc(spec.stampLine)}</text>
  </g>`;
  if (has(spec, "ink-over-stamp")) {
    out.splice(out.findIndex((s) => s.includes(">NOTES<")), 0, stamp);
  } else {
    out.push(stamp);
  }

  // Signature: a handwritten name above a line.
  out.push(
    `<text x="190" y="1236" font-family="${spec.handFont}" font-size="56" fill="${hand}">${esc(spec.signer)}</text>`,
    `<line x1="150" x2="520" y1="1254" y2="1254" stroke="${print}" stroke-width="1.5"/>`,
    `<text x="150" y="1290" font-family="${pf}" font-size="17" fill="${print}">Technician signature</text>`,
  );

  // A fold across one row: a faint dark line with a light one beside it, slightly blurred.
  if (has(spec, "crease") && spec.creaseRow) {
    const y = g.rowBase(spec.creaseRow - 1) - 10;
    out.push(
      `<g filter="url(#soft)">`,
      `<line x1="60" x2="1040" y1="${y}" y2="${y + 4}" stroke="#000" stroke-opacity="0.32" stroke-width="2"/>`,
      `<line x1="60" x2="1040" y1="${y + 3}" y2="${y + 7}" stroke="#fff" stroke-opacity="0.5" stroke-width="3"/>`,
      `</g>`,
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}" height="${PAGE_H}">
  <defs><filter id="soft"><feGaussianBlur stdDeviation="0.8"/></filter></defs>
  ${out.join("\n  ")}
</svg>`;
}

/** Fonts a spec needs, so make.ts can stop early and name a missing one. */
export function fontsOf(spec: ChartSpec): string[] {
  return [spec.printFont, spec.handFont, "Times New Roman"];
}

const GRADIENT = (strength: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}" height="${PAGE_H}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity="0.10"/>
    <stop offset="0.45" stop-color="#000" stop-opacity="0"/>
    <stop offset="1" stop-color="#000" stop-opacity="${strength}"/>
  </linearGradient></defs>
  <rect width="${PAGE_W}" height="${PAGE_H}" fill="url(#g)"/>
</svg>`;

/** Mid-grey grain: overlaid, it leaves the picture's brightness alone and adds texture. */
function noiseBuffer(rand: () => number): Buffer {
  const buf = Buffer.alloc(PAGE_W * PAGE_H * 3);
  for (let i = 0; i < buf.length; i++) buf[i] = 128 + Math.round((rand() - 0.5) * 70);
  return buf;
}

export async function renderChart(spec: ChartSpec): Promise<Buffer> {
  const rand = seeded(spec.id);
  let page = await sharp(Buffer.from(pageSvg(spec))).png().toBuffer();

  if (has(spec, "blur-table")) {
    const g = geometry(spec);
    const region = { left: g.tableLeft, top: g.tableTop, width: g.tableRight - g.tableLeft, height: g.tableBottom - g.tableTop };
    const blurred = await sharp(page).extract(region).blur(1.8).toBuffer();
    page = await sharp(page).composite([{ input: blurred, left: region.left, top: region.top }]).png().toBuffer();
  }

  let image: Buffer;
  if (has(spec, "tilt")) {
    // Shrink the page, turn it, and lay it on a desk with a soft shadow.
    const scaled = await sharp(page).resize(Math.round(PAGE_W * 0.86)).png().toBuffer();
    const angle = (rand() < 0.5 ? -1 : 1) * (2.5 + rand() * 2.5);
    const rotated = await sharp(scaled).rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    const { width: rw = 0, height: rh = 0 } = await sharp(rotated).metadata();
    const left = Math.round((PAGE_W - rw) / 2);
    const top = Math.round((PAGE_H - rh) / 2);
    const shadow = await sharp({ create: { width: rw, height: rh, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.5 } } })
      .composite([{ input: rotated, blend: "dest-in" }])
      .blur(14)
      .png()
      .toBuffer();
    image = await sharp({ create: { width: PAGE_W, height: PAGE_H, channels: 3, background: DESK } })
      .composite([
        { input: shadow, left: left + 12, top: top + 16 },
        { input: rotated, left, top },
      ])
      .png()
      .toBuffer();
  } else {
    image = page;
  }

  const layers: OverlayOptions[] = [];
  if (has(spec, "shadow")) layers.push({ input: Buffer.from(GRADIENT(0.34)) });
  if (has(spec, "noise")) {
    layers.push({ input: noiseBuffer(rand), raw: { width: PAGE_W, height: PAGE_H, channels: 3 }, blend: "overlay" });
  }
  const final = layers.length ? sharp(image).composite(layers) : sharp(image);
  return final.jpeg({ quality: 86 }).toBuffer();
}

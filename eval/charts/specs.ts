import type { RawValue } from "@/lib/schemas";
import type { Split } from "../types";

// One spec per generated chart. The spec IS the ground truth: render.ts draws it and make.ts writes
// the truth JSON from it, so the two cannot disagree. Every name, number and note is fictional, and
// the handwritten notes are plain office remarks, never advice.

export type Feature =
  | "tilt" //           the page is photographed at an angle on a desk
  | "shadow" //         uneven light across the page
  | "noise" //          sensor grain
  | "blur-table" //     the table is out of focus
  | "crease" //         a fold line runs through one table row
  | "low-contrast" //   faded ink
  | "ink-over-stamp" // a handwritten line runs across the stamp
  | "edge-text" //      text sits a few pixels from cell and page edges
  | "hand-values" //    table values are handwritten, with look-alike digits
  | "crossed-out"; //   a word in the notes is struck through

export type PrintFont = "Courier New" | "American Typewriter" | "Menlo";
export type HandFont = "Bradley Hand" | "Noteworthy" | "Snell Roundhand" | "Marker Felt" | "Chalkboard SE";

/** A piece of a handwritten line. A struck piece is drawn but is not part of the ground truth. */
export interface Segment {
  t: string;
  struck?: boolean;
}

export interface ChartSpec {
  id: string;
  split: Split;
  hard: boolean;
  clinic: string;
  printFont: PrintFont;
  handFont: HandFont;
  patientName: string;
  chartNo: string;
  date: string;
  rows: { test: string; value: string; unit: string }[];
  lines: [Segment[], Segment[]];
  /** Second line of the stamp; the first is always RECEIVED. */
  stampLine: string;
  signer: string;
  features: Feature[];
  /** Which table row (1-based) a crease runs through. */
  creaseRow?: number;
  note: string;
}

const seg = (t: string, struck = false): Segment => ({ t, struck });
const plain = (t: string): Segment[] => [seg(t)];
const row = (test: string, value: string, unit: string) => ({ test, value, unit });

export const lineText = (segments: Segment[]): string =>
  segments
    .filter((s) => !s.struck)
    .map((s) => s.t)
    .join(" ");

/** The shared field keys for one chart. Keys starting with "_" are added by make.ts and ignored by scoring. */
export function truthOf(spec: ChartSpec): Record<string, RawValue> {
  const truth: Record<string, RawValue> = {
    "header.patient_name": spec.patientName,
    "header.chart_no": spec.chartNo,
    "header.date": spec.date,
  };
  spec.rows.forEach((r, i) => {
    truth[`row${i + 1}.test`] = r.test;
    truth[`row${i + 1}.value`] = r.value;
    truth[`row${i + 1}.unit`] = r.unit;
  });
  truth.line1 = lineText(spec.lines[0]);
  truth.line2 = lineText(spec.lines[1]);
  truth["stamp.present"] = true;
  truth["stamp.text"] = `RECEIVED ${spec.stampLine}`;
  truth["signature.present"] = true;
  return truth;
}

const STRIKE_NOTE =
  "A struck-through word is drawn but is not part of the truth: the truth is the text a person reads after ignoring it.";

export const SPECS: ChartSpec[] = [
  // ---- dev: 3 easy ----
  {
    id: "gen-d01", split: "dev", hard: false,
    clinic: "Riverside Health Post (Sample)", printFont: "Courier New", handFont: "Noteworthy",
    patientName: "Elena P. Marquez", chartNo: "CH-002784", date: "2026-05-02",
    rows: [row("Hemoglobin", "12.9", "g/dL"), row("Potassium", "4.3", "mmol/L"), row("Sodium", "139", "mmol/L"), row("Glucose, fasting", "5.1", "mmol/L")],
    lines: [plain("Sample taken 07:30, fasting."), plain("Result sent to lab C.")],
    stampLine: "LAB DEPT 02 MAY", signer: "R. Dizon", features: [],
    note: "Clean flat scan. Easy.",
  },
  {
    id: "gen-d02", split: "dev", hard: false,
    clinic: "Lakeview Rural Clinic (Sample)", printFont: "American Typewriter", handFont: "Marker Felt",
    patientName: "Joseph T. Alcantara", chartNo: "CH-005531", date: "2026-05-09",
    rows: [row("Creatinine", "84", "umol/L"), row("Urea", "5.6", "mmol/L"), row("Potassium", "4.0", "mmol/L"), row("Platelets", "245", "x10^9/L"), row("Hematocrit", "41", "%")],
    lines: [plain("Patient waited 20 min."), plain("Form filed at front desk.")],
    stampLine: "LAB DEPT 09 MAY", signer: "L. Ramos", features: ["tilt", "shadow"],
    note: "Tilted with uneven light. Easy.",
  },
  {
    id: "gen-d03", split: "dev", hard: false,
    clinic: "Hillside Family Clinic (Sample)", printFont: "Menlo", handFont: "Snell Roundhand",
    patientName: "Carla S. Dizon", chartNo: "CH-006102", date: "2026-05-12",
    rows: [row("Hemoglobin", "13.8", "g/dL"), row("White blood cells", "7.4", "x10^9/L"), row("Glucose, random", "6.2", "mmol/L"), row("Cholesterol, total", "4.9", "mmol/L")],
    lines: [plain("Sample taken 09:20."), plain("Chart checked by nurse.")],
    stampLine: "LAB DEPT 12 MAY", signer: "M. Uy", features: ["tilt", "noise"],
    note: "Tilted with grain, cursive notes. Easy.",
  },
  // ---- dev: 2 hard ----
  {
    id: "gen-d04", split: "dev", hard: true,
    clinic: "Harbor Street Clinic (Sample)", printFont: "Courier New", handFont: "Bradley Hand",
    patientName: "Luis M. Bautista", chartNo: "CH-071171", date: "2026-06-17",
    rows: [row("Hemoglobin", "11.7", "g/dL"), row("Potassium", "4.1", "mmol/L"), row("Sodium", "137", "mmol/L"), row("Creatinine", "106", "umol/L"), row("Glucose, random", "6.8", "mmol/L")],
    lines: [plain("Sample taken 10:17, fasting."), plain("Lab B ext. 1771.")],
    stampLine: "LAB DEPT 17 JUN", signer: "P. Cruz", features: ["hand-values", "tilt", "shadow"],
    note: "Handwritten values and times with look-alike digits (1 and 7, 6 and 8, 3 and 8). Hard.",
  },
  {
    id: "gen-d05", split: "dev", hard: true,
    clinic: "Greenfield Barangay Clinic (Sample)", printFont: "American Typewriter", handFont: "Noteworthy",
    patientName: "Rosa A. Camacho", chartNo: "CH-009860", date: "2026-06-03",
    rows: [row("Hemoglobin", "10.9", "g/dL"), row("Potassium", "3.9", "mmol/L"), row("Glucose, fasting", "5.6", "mmol/L"), row("Creatinine", "97", "umol/L")],
    lines: [plain("Sample taken 06:50."), plain("Form copied for records.")],
    stampLine: "LAB DEPT 03 JUN", signer: "T. Gomez", features: ["crease", "low-contrast", "tilt"], creaseRow: 3,
    note: "A fold runs through the Glucose row and the printed ink is faded. Hard.",
  },
  // ---- test: 7 easy ----
  {
    id: "gen-t01", split: "test", hard: false,
    clinic: "Mountain View Health Post (Sample)", printFont: "Courier New", handFont: "Noteworthy",
    patientName: "Andres F. Soriano", chartNo: "CH-011203", date: "2026-07-01",
    rows: [row("Hemoglobin", "14.2", "g/dL"), row("Potassium", "4.5", "mmol/L"), row("Sodium", "141", "mmol/L"), row("Creatinine", "88", "umol/L")],
    lines: [plain("Sample taken 08:05, fasting."), plain("Result filed same day.")],
    stampLine: "LAB DEPT 01 JUL", signer: "E. Tan", features: [],
    note: "Clean flat scan. Easy.",
  },
  {
    id: "gen-t02", split: "test", hard: false,
    clinic: "Bayside Clinic (Sample)", printFont: "American Typewriter", handFont: "Bradley Hand",
    patientName: "Teresita G. Pineda", chartNo: "CH-011920", date: "2026-07-03",
    rows: [row("White blood cells", "6.1", "x10^9/L"), row("Platelets", "288", "x10^9/L"), row("Hemoglobin", "12.4", "g/dL"), row("Glucose, fasting", "4.9", "mmol/L")],
    lines: [plain("Sample taken 07:15."), plain("Copy sent to records.")],
    stampLine: "LAB DEPT 03 JUL", signer: "C. Lim", features: ["tilt", "shadow"],
    note: "Tilted with uneven light. Easy. Planned as a phone photo of a printed copy.",
  },
  {
    id: "gen-t03", split: "test", hard: false,
    clinic: "Pioneer Avenue Clinic (Sample)", printFont: "Menlo", handFont: "Noteworthy",
    patientName: "Benjamin R. Ocampo", chartNo: "CH-012377", date: "2026-07-06",
    rows: [row("Hemoglobin", "13.1", "g/dL"), row("Potassium", "4.2", "mmol/L"), row("Sodium", "138", "mmol/L"), row("Urea", "4.9", "mmol/L"), row("Creatinine", "79", "umol/L")],
    lines: [plain("Seen by assistant."), plain("Chart updated at front desk.")],
    stampLine: "LAB DEPT 06 JUL", signer: "A. Reyes", features: ["noise", "tilt"],
    note: "Grain and a slight tilt. Easy.",
  },
  {
    id: "gen-t04", split: "test", hard: false,
    clinic: "Sunrise Community Clinic (Sample)", printFont: "Courier New", handFont: "Marker Felt",
    patientName: "Imelda V. Navarro", chartNo: "CH-013045", date: "2026-07-08",
    rows: [row("Hemoglobin", "11.9", "g/dL"), row("Hematocrit", "36", "%"), row("White blood cells", "8.2", "x10^9/L"), row("Platelets", "301", "x10^9/L"), row("Glucose, random", "7.0", "mmol/L"), row("Creatinine", "71", "umol/L")],
    lines: [plain("Sample taken 11:40."), plain("Repeat form kept on file.")],
    stampLine: "LAB DEPT 08 JUL", signer: "S. Villar", features: ["shadow"],
    note: "Six table rows. Easy.",
  },
  {
    id: "gen-t05", split: "test", hard: false,
    clinic: "North Gate Clinic (Sample)", printFont: "American Typewriter", handFont: "Chalkboard SE",
    patientName: "Gregorio L. Tan", chartNo: "CH-013488", date: "2026-07-10",
    rows: [row("Potassium", "4.4", "mmol/L"), row("Sodium", "140", "mmol/L"), row("Urea", "6.1", "mmol/L"), row("Calcium", "2.3", "mmol/L")],
    lines: [plain("Walk-in, no appointment."), plain("Sample taken 09:45.")],
    stampLine: "FRONT DESK 10 JUL", signer: "J. Mercado", features: ["tilt"],
    note: "A different stamp wording. Easy.",
  },
  {
    id: "gen-t06", split: "test", hard: false,
    clinic: "Seaview Health Post (Sample)", printFont: "Courier New", handFont: "Bradley Hand",
    patientName: "Maria Cristina de los Santos-Villanueva", chartNo: "CH-013901", date: "2026-07-13",
    rows: [row("Hemoglobin", "12.6", "g/dL"), row("Glucose, fasting", "5.3", "mmol/L"), row("Creatinine", "68", "umol/L"), row("Cholesterol, total", "5.0", "mmol/L")],
    lines: [plain("Sample taken 07:55."), plain("Forms signed by nurse.")],
    stampLine: "LAB DEPT 13 JUL", signer: "D. Aquino", features: ["shadow"],
    note: "A long patient name. Easy.",
  },
  {
    id: "gen-t07", split: "test", hard: false,
    clinic: "Palm Grove Clinic (Sample)", printFont: "Menlo", handFont: "Noteworthy",
    patientName: "Victor H. Lim", chartNo: "CH-014266", date: "2026-07-15",
    rows: [row("Hemoglobin", "13.9", "g/dL"), row("Potassium", "4.0", "mmol/L"), row("Sodium", "142", "mmol/L")],
    lines: [plain("Filed today."), plain("No other notes.")],
    stampLine: "LAB DEPT 15 JUL", signer: "K. Bello", features: ["tilt"],
    note: "Three rows and short notes. Easy.",
  },
  // ---- test: 5 hard ----
  {
    id: "gen-t08", split: "test", hard: true,
    clinic: "Central Plaza Clinic (Sample)", printFont: "Courier New", handFont: "Bradley Hand",
    patientName: "Lorna D. Evangelista", chartNo: "CH-017117", date: "2026-07-17",
    rows: [row("Hemoglobin", "11.7", "g/dL"), row("Potassium", "4.7", "mmol/L"), row("Sodium", "136", "mmol/L"), row("Glucose, random", "6.5", "mmol/L"), row("Creatinine", "71", "umol/L")],
    lines: [plain("Sample taken 10:17."), plain("Lab B ext. 7611.")],
    stampLine: "LAB DEPT 17 JUL", signer: "N. Pascual", features: ["hand-values", "tilt", "noise"],
    note: "Handwritten values with look-alike digits. Hard. Planned as a phone photo of a printed copy.",
  },
  {
    id: "gen-t09", split: "test", hard: true,
    clinic: "Old Town Clinic (Sample)", printFont: "American Typewriter", handFont: "Marker Felt",
    patientName: "Ramon B. Castillo", chartNo: "CH-014790", date: "2026-07-20",
    rows: [row("Hemoglobin", "13.3", "g/dL"), row("Potassium", "4.2", "mmol/L"), row("Glucose, fasting", "5.8", "mmol/L"), row("Creatinine", "90", "umol/L")],
    lines: [plain("Sample taken 08:30, fasting."), plain("Checked by front desk.")],
    stampLine: "LAB DEPT 20 JUL", signer: "H. Salazar", features: ["ink-over-stamp", "tilt"],
    note: "The second handwritten line runs across the stamp. Hard.",
  },
  {
    id: "gen-t10", split: "test", hard: true,
    clinic: "East Wharf Clinic (Sample)", printFont: "Courier New", handFont: "Noteworthy",
    patientName: "Josefina M. Cruz", chartNo: "CH-015233", date: "2026-07-22",
    rows: [row("Sodium", "139", "mmol/L"), row("Potassium", "3.8", "mmol/L"), row("Urea", "5.2", "mmol/L"), row("Hematocrit", "39", "%"), row("Platelets", "262", "x10^9/L")],
    lines: [plain("Specimen label checked and signed at desk."), plain("Sample taken 07:20.")],
    stampLine: "LAB DEPT 22 JUL", signer: "B. Flores", features: ["edge-text", "tilt"],
    note: "Text a few pixels from the cell and page edges. Hard. Planned as a phone photo of a printed copy.",
  },
  {
    id: "gen-t11", split: "test", hard: true,
    clinic: "Hillcrest Clinic (Sample)", printFont: "Menlo", handFont: "Snell Roundhand",
    patientName: "Pablo N. Reyes", chartNo: "CH-015690", date: "2026-07-24",
    rows: [row("Hemoglobin", "14.0", "g/dL"), row("Glucose, fasting", "5.5", "mmol/L"), row("Creatinine", "85", "umol/L"), row("Sodium", "140", "mmol/L")],
    lines: [[seg("Sample taken"), seg("08:10", true), seg("07:40, fasting.")], plain("Sent to lab C.")],
    stampLine: "LAB DEPT 24 JUL", signer: "G. Ramos", features: ["crossed-out", "shadow"],
    note: `Cursive notes with a corrected time. ${STRIKE_NOTE} Hard.`,
  },
  {
    id: "gen-t12", split: "test", hard: true,
    clinic: "Harvest Road Clinic (Sample)", printFont: "Courier New", handFont: "Chalkboard SE",
    patientName: "Ana Beatriz Lopez", chartNo: "CH-016128", date: "2026-07-27",
    rows: [row("Potassium", "4.6", "mmol/L"), row("Sodium", "143", "mmol/L"), row("Creatinine", "99", "umol/L"), row("Hemoglobin", "12.8", "g/dL")],
    lines: [[seg("Form"), seg("copied", true), seg("filed at front desk.")], plain("Sample taken 06:40.")],
    stampLine: "LAB DEPT 27 JUL", signer: "F. Medina", features: ["crease", "low-contrast", "crossed-out", "noise"], creaseRow: 2,
    note: `A fold through the Sodium row, faded ink, grain and a struck word. ${STRIKE_NOTE} Hard.`,
  },
];

export interface ManifestEntry {
  id: string;
  file: string;
  split: Split;
  hard: boolean;
  truth?: string;
}

/** The three fixtures made before the generator existed come first, then the generated charts. */
export const EXISTING_ENTRIES: ManifestEntry[] = [
  { id: "smoke-chart-01", file: "eval/fixtures/smoke-chart-01.jpg", split: "dev", hard: false },
  { id: "smoke-chart-02", file: "eval/fixtures/smoke-chart-02.jpg", split: "dev", hard: false },
  { id: "hard-chart-01", file: "eval/fixtures/hard-chart-01.jpg", split: "dev", hard: true },
];

export function buildManifest(specs: ChartSpec[] = SPECS): ManifestEntry[] {
  return [
    ...EXISTING_ENTRIES,
    ...specs.map((s) => ({ id: s.id, file: `eval/fixtures/${s.id}.jpg`, split: s.split, hard: s.hard })),
  ];
}

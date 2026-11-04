// Ready-made scans on the live site, made by sending eval/fixtures/smoke-chart-01.jpg and hard-chart-01.jpg
// through POST /api/sync with these ids (synthetic charts, made-up values). The ids are fixed so the links
// survive a database clean-up: re-send the same file with the same id to bring one back. See docs/new-work.md.
export const SAMPLE_CHARTS = [
  {
    id: "5a3e0001-0000-4000-8000-000000000001",
    title: "Sample chart 1",
    note: "A clean printed chart: header, table, handwriting, stamp and signature.",
  },
  {
    id: "5a3e0001-0000-4000-8000-000000000002",
    title: "Sample chart 2",
    note: "A harder chart with a degraded photo, where the readers are more likely to differ.",
  },
] as const;

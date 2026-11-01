import { defineConfig, devices } from "@playwright/test";

// One happy-path test on the review screen's sample data (/review-preview): no database, no keys and no
// model calls, so it runs the same on any machine. It does not cover capture or sync.
const PORT = 3200;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm dev --port ${PORT}`,
    url: `http://localhost:${PORT}/review-preview`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});

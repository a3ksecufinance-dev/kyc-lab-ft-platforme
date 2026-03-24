import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir:    "./e2e/tests",
  timeout:    30_000,
  retries:    process.env["CI"] ? 2 : 0,
  workers:    process.env["CI"] ? 1 : 2,
  reporter:   [["html", { outputFolder: "e2e/report" }], ["list"]],

  use: {
    baseURL:          process.env["E2E_BASE_URL"] ?? "http://localhost:5173",
    headless:         true,
    screenshot:       "only-on-failure",
    video:            "retain-on-failure",
    actionTimeout:    10_000,
    navigationTimeout: 15_000,
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],

  webServer: process.env["CI"] ? undefined : {
    command: "pnpm dev:all",
    url:     "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});

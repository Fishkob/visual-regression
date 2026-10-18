import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/quality",
  testMatch: ["**/*.spec.ts"],
  forbidOnly: !!process.env.CI,
  snapshotPathTemplate: "{testDir}/__screenshots__/{arg}{ext}",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://localhost:5173/playwright/gallery/index.html",
    viewport: { width: 1440, height: 900 },
    serviceWorkers: "block",
    reuseContext: true,
    reducedMotion: "reduce",
    locale: "en-US",
    timezoneId: "UTC",
    trace: "retain-on-failure",
  },
  projects: [{ name: "quality" }],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:5173/playwright/gallery/index.html",
    reuseExistingServer: !process.env.CI,
  },
});

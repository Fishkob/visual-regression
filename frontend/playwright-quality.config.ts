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
  expect: {
    toHaveScreenshot: {
      // Anti-aliasing noise is not a regression. The same baseline rendered by a
      // rebuilt image differed by 10-33 pixels on glyph and border edges (of
      // 1.3M), which failed the run with "0 pixels allowed". 0.01% leaves room
      // for that and stays orders of magnitude below any layout change — a
      // shifted row, a missing badge or a colour swap still fails.
      maxDiffPixelRatio: 0.0001,
    },
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:5173/playwright/gallery/index.html",
    reuseExistingServer: !process.env.CI,
  },
});

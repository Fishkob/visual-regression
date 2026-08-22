import { defineConfig, devices } from "@playwright/test";

/**
 * E2E specs create unique, self-cleaned projects per test, so repeated runs
 * do not collide. CI enforces --workers=1; run locally with the same flag to
 * keep the single shared worker free of competing upload+compare load.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: ["**/*.spec.ts"],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: process.env.FRONTEND_URL || "http://localhost:80",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});

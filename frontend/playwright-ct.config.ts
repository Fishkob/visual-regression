import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/ct",
  testMatch: ["**/*.spec.ts"],
  use: {
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "components",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://localhost:5173/playwright/gallery/index.html",
        serviceWorkers: "block",
        reuseContext: true,
      },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:5173/playwright/gallery/index.html",
    reuseExistingServer: !process.env.CI,
  },
});

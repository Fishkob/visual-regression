import { test, expect } from "@playwright/test";
import { mockApi } from "./routes/api.routes";
import { PROJECT_CHECKOUT_UI_RESPONSE } from "./mocks/projects.mocks";
import type { Routed } from "../../src/views/ProjectSettingsView.story";
import { TEST_ID } from "@/lib/test-ids";

// The settings page is the home of the per-project admin surfaces: the review
// policy and the storage/quota settings. The mock answers both reads the view
// makes (the project for `requiredApprovals`, the storage aggregate).
const STORAGE_GLOB = "**/api/v1/projects/checkout-ui/storage";
const STORAGE_RESPONSE = {
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({
    usageBytes: "5242880",
    quotaBytes: "10485760",
    percent: 50,
    softPercent: 80,
    warning: false,
    fileCount: 12,
    diffCount: 3,
    baselineRevisionLimit: 5,
    runHistoryDays: 30,
    orphanGraceHours: 24,
  }),
};

const SETTINGS_ROUTE = "/projects/checkout-ui/settings";

test.describe("ProjectSettings", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, [
      [STORAGE_GLOB, STORAGE_RESPONSE],
      ["**/api/v1/projects/checkout-ui*", PROJECT_CHECKOUT_UI_RESPONSE],
    ]);
  });

  test("shows the review policy and the storage limits", async ({ mount }) => {
    const component = await mount<typeof Routed>(
      "views/ProjectSettingsView/Routed",
      { initialRoute: SETTINGS_ROUTE },
    );

    await expect(component.getByTestId(TEST_ID.projectSettingsName)).toHaveText(
      "checkout-ui",
    );
    await expect(
      component.getByTestId(TEST_ID.reviewRequiredApprovalsValue),
    ).toContainText("1 approval required");

    await expect(component.getByTestId(TEST_ID.storageUsage)).toContainText(
      "5.0 MB",
    );
    await expect(component.getByTestId(TEST_ID.storageQuota)).toContainText(
      "10.0 MB",
    );
    await expect(component.getByTestId(TEST_ID.storageRetention)).toContainText(
      "5 revisions",
    );
    await expect(component.getByTestId(TEST_ID.storageRetention)).toContainText(
      "30 days",
    );
    await expect(component.getByTestId(TEST_ID.storageRetention)).toContainText(
      "24 hours",
    );
  });

  test("opens the review policy editor with the current value", async ({
    mount,
    page,
  }) => {
    const component = await mount<typeof Routed>(
      "views/ProjectSettingsView/Routed",
      { initialRoute: SETTINGS_ROUTE },
    );

    await component.getByTestId(TEST_ID.reviewSettingsAction).click();

    await expect(page.getByTestId(TEST_ID.reviewSettingsDialog)).toBeVisible();
    await expect(
      page.getByTestId(TEST_ID.reviewRequiredApprovals),
    ).toHaveValue("1");
  });

  test("links back to the project table", async ({ mount }) => {
    const component = await mount<typeof Routed>(
      "views/ProjectSettingsView/Routed",
      { initialRoute: SETTINGS_ROUTE },
    );

    await expect(
      component.getByTestId(TEST_ID.projectSettingsBack),
    ).toHaveAttribute("href", "/projects/checkout-ui");
  });
});

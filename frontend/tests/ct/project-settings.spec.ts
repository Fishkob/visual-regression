import { test, expect } from "@playwright/test";
import { mockApi } from "./routes/api.routes";
import { PROJECT_CHECKOUT_UI_RESPONSE } from "./mocks/projects.mocks";
import { WEBHOOKS_RESPONSE } from "./mocks/webhooks.mocks";
import type { Routed } from "../../src/views/ProjectSettingsView.story";
import { TEST_ID } from "@/lib/test-ids";

// The settings page is the home of the per-project admin surfaces: the storage
// quota, the pixel threshold and the webhook endpoints. The mock answers every
// read the view makes (the project for its threshold, the storage aggregate,
// the endpoint list).
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

const WEBHOOKS_GLOB = "**/api/v1/projects/checkout-ui/webhooks";

const SETTINGS_ROUTE = "/projects/checkout-ui/settings";

test.describe("ProjectSettings", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, [
      [STORAGE_GLOB, STORAGE_RESPONSE],
      [WEBHOOKS_GLOB, WEBHOOKS_RESPONSE],
      ["**/api/v1/projects/checkout-ui*", PROJECT_CHECKOUT_UI_RESPONSE],
    ]);
  });

  test("shows the pixel threshold and the storage limits", async ({
    mount,
  }) => {
    const component = await mount<typeof Routed>(
      "views/ProjectSettingsView/Routed",
      { initialRoute: SETTINGS_ROUTE },
    );

    await expect(component.getByTestId(TEST_ID.projectSettingsName)).toHaveText(
      "checkout-ui",
    );
    await expect(
      component.getByTestId(TEST_ID.projectThresholdValue),
    ).toContainText("No project default");

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

  test("shows the project's webhook endpoints and opens the editor", async ({
    mount,
    page,
  }) => {
    const component = await mount<typeof Routed>(
      "views/ProjectSettingsView/Routed",
      { initialRoute: SETTINGS_ROUTE },
    );

    const section = component.getByTestId(TEST_ID.projectSettingsWebhooks);
    await expect(section).toBeVisible();
    await expect(section.getByTestId(TEST_ID.webhookRow)).toHaveCount(2);

    const active = section
      .getByTestId(TEST_ID.webhookRow)
      .filter({ hasText: "hooks.slack.com" });
    await expect(active.getByTestId(TEST_ID.webhookActiveToggle)).toBeChecked();

    const disabled = section
      .getByTestId(TEST_ID.webhookRow)
      .filter({ hasText: "vrt-disabled" });
    await expect(disabled.getByTestId(TEST_ID.webhookActiveToggle)).toBeChecked(
      { checked: false },
    );

    await section.getByTestId(TEST_ID.webhookAdd).click();
    await expect(page.getByTestId(TEST_ID.webhookUrlInput)).toBeVisible();
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

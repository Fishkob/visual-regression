import { expect, test } from "@playwright/test";
import { deleteProject, getStorage, setupReviewableTest } from "./fixtures/api";
import { TEST_ID } from "@/lib/test-ids";

let projectName: string;

const settingsUrl = (name: string) => `/projects/${encodeURIComponent(name)}/settings`;

test.describe("Project storage", () => {
  test.beforeEach(async () => {
    projectName = `e2e-storage-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await setupReviewableTest(projectName, "login-form");
  });

  test.afterEach(async () => {
    await deleteProject(projectName);
  });

  test("shows usage and saves the retention limits", async ({ page }) => {
    // Storage belongs to the project settings page: the project page itself
    // keeps only the entry point.
    await page.goto(`/projects/${encodeURIComponent(projectName)}`);
    await expect(page.getByTestId(TEST_ID.storagePanel)).toHaveCount(0);
    await page.getByTestId(TEST_ID.projectSettingsAction).click();
    await expect(page.getByTestId(TEST_ID.storagePanel)).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId(TEST_ID.storageUsage)).toContainText("used");
    await expect(page.getByTestId(TEST_ID.storageQuota)).toContainText(
      "No quota",
    );

    await page.getByTestId(TEST_ID.storageEditAction).click();
    await expect(page.getByTestId(TEST_ID.storageEditDialog)).toBeVisible();
    await page.getByTestId(TEST_ID.storageQuotaMb).fill("10");
    await page.getByTestId(TEST_ID.storageBaselineLimit).fill("3");
    await page.getByTestId(TEST_ID.storageRunDays).fill("14");
    await page.getByTestId(TEST_ID.storageOrphanHours).fill("12");
    await page.getByTestId(TEST_ID.storageSoftPercent).fill("70");
    await page.getByTestId(TEST_ID.storageSave).click();

    await expect(page.getByTestId(TEST_ID.toaster)).toContainText(
      "Storage settings saved",
      { timeout: 10000 },
    );
    await expect(page.getByTestId(TEST_ID.storageRetention)).toContainText(
      "3 revisions",
    );
    await expect(page.getByTestId(TEST_ID.storageRetention)).toContainText(
      "14 days",
    );
    await expect(page.getByTestId(TEST_ID.storageRetention)).toContainText(
      "12 hours",
    );

    const storage = await getStorage(projectName);
    expect(storage).toEqual(
      expect.objectContaining({
        baselineRevisionLimit: 3,
        runHistoryDays: 14,
        orphanGraceHours: 12,
        softPercent: 70,
      }),
    );
    expect(Number(storage.quotaBytes)).toBe(10 * 1024 * 1024);
  });

  test("previews a dry-run cleanup without deleting anything", async ({
    page,
  }) => {
    await page.goto(settingsUrl(projectName));
    await expect(page.getByTestId(TEST_ID.storagePanel)).toBeVisible({
      timeout: 10000,
    });

    const before = await getStorage(projectName);
    await page.getByTestId(TEST_ID.storagePreviewAction).click();
    await expect(page.getByTestId(TEST_ID.storagePreviewDialog)).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId(TEST_ID.storagePreviewDialog)).toContainText(
      "Dry run",
    );
    await page.getByTestId(TEST_ID.storagePreviewClose).click();
    await expect(page.getByTestId(TEST_ID.storagePreviewDialog)).toHaveCount(0);

    const after = await getStorage(projectName);
    expect(after.fileCount).toBe(before.fileCount);
    expect(after.diffCount).toBe(before.diffCount);
  });
});

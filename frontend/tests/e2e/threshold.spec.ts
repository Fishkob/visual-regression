import { expect, test } from "@playwright/test";
import {
  deleteProject,
  getTestDetails,
  setupReviewableTest,
} from "./fixtures/api";
import { testUrl } from "./fixtures/review";
import { TEST_ID } from "@/lib/test-ids";

let projectName: string;

const TEST_NAME = "login-form";

test.describe("Threshold editing", () => {
  test.beforeEach(async () => {
    projectName = `e2e-threshold-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await setupReviewableTest(projectName, TEST_NAME);
  });

  test.afterEach(async () => {
    await deleteProject(projectName);
  });

  test("raises the threshold, confirms auto-accept and clears the comparison", async ({
    page,
  }) => {
    await page.goto(testUrl(projectName, TEST_NAME));
    await expect(page.getByTestId(TEST_ID.comparisonView)).toBeVisible({
      timeout: 10000,
    });

    const threshold = page.getByTestId(TEST_ID.thresholdInput);
    await expect(threshold).toHaveValue("0");

    // The server owns the auto-accept preview; raising the threshold above the
    // mismatch must ask before silently accepting the pending comparison.
    await threshold.fill("200");
    await threshold.press("Enter");
    await expect(page.getByTestId(TEST_ID.dialogConfirm)).toBeVisible({
      timeout: 10000,
    });
    await page.getByTestId(TEST_ID.dialogConfirm).click();

    await expect(page.getByTestId(TEST_ID.toaster)).toContainText(
      /Threshold updated for .*auto-accepted/,
      { timeout: 10000 },
    );
    await expect(page.getByTestId(TEST_ID.comparisonView)).toHaveCount(0, {
      timeout: 10000,
    });
    await expect(page.getByTestId(TEST_ID.baselineOnlyNote)).toBeVisible();

    const details = await getTestDetails(projectName, TEST_NAME);
    expect(details.comparison).toBeFalsy();
    const baseline = details.baseline as
      { pixelDiffThreshold?: number } | undefined;
    expect(baseline?.pixelDiffThreshold).toBe(200);
  });

  test("rejects an empty threshold and restores the previous value", async ({
    page,
  }) => {
    await page.goto(testUrl(projectName, TEST_NAME));
    await expect(page.getByTestId(TEST_ID.comparisonView)).toBeVisible({
      timeout: 10000,
    });

    const threshold = page.getByTestId(TEST_ID.thresholdInput);
    await threshold.fill("");
    await threshold.press("Enter");

    await expect(page.getByTestId(TEST_ID.toaster)).toContainText(
      "Invalid number",
      { timeout: 10000 },
    );
    await expect(threshold).toHaveValue("0");
    await expect(page.getByTestId(TEST_ID.comparisonView)).toBeVisible();

    const details = await getTestDetails(projectName, TEST_NAME);
    const baseline = details.baseline as
      { pixelDiffThreshold?: number } | undefined;
    expect(baseline?.pixelDiffThreshold).toBe(0);
  });
});

import { expect, test } from "@playwright/test";
import {
  approveComparison,
  deleteProject,
  getBaselineHistory,
  getTestDetails,
  setupReviewableTest,
  uploadScreenshot,
  waitForImageComparison,
} from "./fixtures/api";
import { testUrl } from "./fixtures/review";
import { TEST_ID } from "@/lib/test-ids";
import { confirmDialog, expectToast } from "./fixtures/ui";

let projectName: string;

const TEST_NAME = "login-form";

function baselineUrl(details: Record<string, unknown>): string | undefined {
  return (details.baseline as { imageUrl?: string } | undefined)?.imageUrl;
}

test.describe("Baseline history", () => {
  test.beforeEach(async () => {
    projectName = `e2e-baseline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await setupReviewableTest(projectName, TEST_NAME);

    // Two approvals produce two replaced baselines: the original black
    // baseline, then the blue one that the second approval replaces again.
    await approveComparison(projectName, TEST_NAME);
    await uploadScreenshot(projectName, TEST_NAME, "baseline_black.png");
    await waitForImageComparison(projectName, TEST_NAME);
    await approveComparison(projectName, TEST_NAME);
  });

  test.afterEach(async () => {
    await deleteProject(projectName);
  });

  test("lists replaced baselines and restores a previous one", async ({
    page,
  }) => {
    const historyBefore = await getBaselineHistory(projectName, TEST_NAME);
    expect(historyBefore).toHaveLength(2);

    const before = await getTestDetails(projectName, TEST_NAME);
    const beforeUrl = baselineUrl(before);
    expect(beforeUrl).toBeTruthy();

    await page.goto(testUrl(projectName, TEST_NAME));

    // The history shares the activity rail with the discussion; a test with
    // replaced baselines is what the rail opens on.
    await page.getByTestId(TEST_ID.activityTabHistory).click();
    await expect(
      page.getByTestId(TEST_ID.baselineHistorySection),
    ).toBeVisible();

    const rows = page.getByTestId(TEST_ID.baselineHistoryRow);
    await expect(rows).toHaveCount(2);

    // Newest first: the blue baseline is the first row and the current
    // baseline (the black one) is last, so restoring the first one flips back.
    await rows.first().getByTestId(TEST_ID.baselineHistoryRestore).click();
    await expect(page.getByTestId(TEST_ID.dialogConfirm)).toBeVisible();
    await confirmDialog(page);

    await expectToast(page, "Baseline restored");
    await expect(rows).toHaveCount(3);
    // The restore badge is translated, so the reason is read from its data
    // attribute instead of its text.
    await expect(
      page
        .getByTestId(TEST_ID.baselineHistoryReason)
        .and(page.locator('[data-reason="restore"]')),
    ).toBeVisible();

    const after = await getTestDetails(projectName, TEST_NAME);
    expect(baselineUrl(after)).toBeTruthy();
    expect(baselineUrl(after)).not.toBe(beforeUrl);

    const historyAfter = await getBaselineHistory(projectName, TEST_NAME);
    expect(historyAfter).toHaveLength(3);
  });

  test("hides restore for an inherited baseline", async ({ page }) => {
    // Materialize the branch with a different test only, so login-form stays
    // an inherited shadow there.
    await uploadScreenshot(projectName, "signup-form", "baseline_black.png", {
      branch: "feature/empty",
    });

    await page.goto(
      testUrl(projectName, TEST_NAME, "1920x1080", "Chrome", "staging", {
        branch: "feature/empty",
      }),
    );

    // The empty feature branch inherits login-form from main: the history lives
    // on the owning branch, so the panel is not even offered there.
    await expect(page.getByTestId(TEST_ID.inheritedBadge)).toBeVisible();
    await expect(page.getByTestId(TEST_ID.baselineHistorySection)).toHaveCount(
      0,
    );
  });
});

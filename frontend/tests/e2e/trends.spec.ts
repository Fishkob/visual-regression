import { expect, test } from "@playwright/test";
import {
  approveComparison,
  deleteProject,
  setupReviewableTest,
} from "./fixtures/api";
import { TEST_ID } from "@/lib/test-ids";

let projectName: string;

test.describe("Project trends", () => {
  test.beforeEach(async () => {
    projectName = `e2e-trends-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await setupReviewableTest(projectName, "login-form");
    await approveComparison(projectName, "login-form");
  });

  test.afterEach(async () => {
    await deleteProject(projectName);
  });

  test("shows comparison, approval and flake metrics", async ({ page }) => {
    await page.goto(`/projects/${encodeURIComponent(projectName)}/trends`);
    await expect(page.getByTestId(TEST_ID.trendsView)).toBeVisible({
      timeout: 10000,
    });

    await expect(page.getByTestId(TEST_ID.trendsComparisons)).toContainText(
      "1",
    );
    await expect(page.getByTestId(TEST_ID.trendsComparisons)).toContainText(
      "Changed",
    );
    await expect(page.getByTestId(TEST_ID.trendsApprovalLatency)).toContainText(
      "1",
    );
    await expect(page.getByTestId(TEST_ID.trendsFlakeRate)).toContainText("1");
    await expect(page.getByTestId(TEST_ID.trendsDailyRow)).toHaveCount(1, {
      timeout: 10000,
    });
    await expect(page.getByTestId(TEST_ID.trendsDailyRow)).toContainText("1");
  });

  test("switches the range and keeps the window in the URL-free state", async ({
    page,
  }) => {
    await page.goto(`/projects/${encodeURIComponent(projectName)}/trends`);
    await expect(page.getByTestId(TEST_ID.trendsRange30)).toHaveAttribute(
      "aria-pressed",
      "true",
      { timeout: 10000 },
    );

    await page.getByTestId(TEST_ID.trendsRange90).click();
    await expect(page.getByTestId(TEST_ID.trendsRange90)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId(TEST_ID.trendsRange30)).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(page.getByTestId(TEST_ID.trendsComparisons)).toBeVisible();
  });
});

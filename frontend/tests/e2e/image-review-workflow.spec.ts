import { test, expect } from "@playwright/test";
import {
  createProject,
  deleteProject,
  setupReviewableTest,
  uploadScreenshot,
} from "./fixtures/api";
import { TEST_ID } from "@/lib/test-ids";
import { approveCurrentComparison } from "./fixtures/review";
import { expectToast } from "./fixtures/ui";

let projectName: string;
const DETAIL_QUERY = "?viewport=1920x1080&browser=Chrome&environment=staging";

function projectUrl(project: string, testName: string) {
  return `/projects/${encodeURIComponent(project)}/tests/${encodeURIComponent(testName)}${DETAIL_QUERY}`;
}

test.describe("Image Review Loop", () => {
  test.beforeEach(async () => {
    projectName = `e2e-image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  });

  test.afterEach(async () => {
    await deleteProject(projectName);
  });

  test("approves a comparison and lands on all-caught-up", async ({ page }) => {
    await createProject(projectName);
    await setupReviewableTest(projectName, "login-form");

    await page.goto(projectUrl(projectName, "login-form"));

    await expect(page.getByTestId(TEST_ID.comparisonView)).toBeVisible();
    await expect(page.getByTestId(TEST_ID.badgeMismatch)).toBeVisible();

    await approveCurrentComparison(page);

    await expectToast(page, /Approved .* of "login-form"/);
    await expect(page).toHaveURL(/\/projects\/.*\/done/);
    await expect(page.getByTestId(TEST_ID.doneHeading)).toContainText(
      "All comparisons reviewed",
    );
  });

  test("identical upload produces no comparison", async ({ page }) => {
    await createProject(projectName);
    await uploadScreenshot(projectName, "login-form", "baseline_black.png");
    await uploadScreenshot(projectName, "login-form", "baseline_black.png");

    await page.goto(projectUrl(projectName, "login-form"));

    await expect(page.getByTestId(TEST_ID.baselineOnlyNote)).toContainText(
      "Only baseline available",
    );
    await expect(page.getByTestId(TEST_ID.comparisonView)).not.toBeVisible();
  });

  test("skip navigates to the next pending test", async ({ page }) => {
    await createProject(projectName);
    await setupReviewableTest(projectName, "login-form");
    await setupReviewableTest(projectName, "checkout-flow");

    const pendingResponse = page.waitForResponse(
      (res) => res.url().includes("/meta/pending") && res.ok(),
    );

    await page.goto(projectUrl(projectName, "login-form"));

    await expect(page.getByTestId(TEST_ID.comparisonView)).toBeVisible();
    await pendingResponse;

    await page.getByTestId(TEST_ID.skip).click();

    await expect(page).toHaveURL(/tests\/checkout-flow/);
    await expect(page.getByTestId(TEST_ID.comparisonView)).toBeVisible();
  });

  test("reviews the full loop until all caught up", async ({ page }) => {
    await createProject(projectName);
    await setupReviewableTest(projectName, "login-form");
    await setupReviewableTest(projectName, "checkout-flow");

    const pendingResponse = page.waitForResponse(
      (res) => res.url().includes("/meta/pending") && res.ok(),
    );

    await page.goto(projectUrl(projectName, "login-form"));

    await expect(page.getByTestId(TEST_ID.comparisonView)).toBeVisible();
    await pendingResponse;
    await approveCurrentComparison(page);

    await expectToast(page, /Approved .* of "login-form"/);
    await expect(page).toHaveURL(/tests\/checkout-flow/);
    await expect(page.getByTestId(TEST_ID.comparisonView)).toBeVisible();
    await approveCurrentComparison(page);

    await expectToast(page, /Approved .* of "checkout-flow"/);
    await expect(page).toHaveURL(/\/projects\/.*\/done/);
    await expect(page.getByTestId(TEST_ID.doneHeading)).toContainText(
      "All comparisons reviewed",
    );
  });
});

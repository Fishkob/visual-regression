import { test, expect } from "@playwright/test";
import {
  createProject,
  deleteProject,
  setupReviewableTest,
  uploadScreenshot,
} from "./fixtures/api";

let projectName: string;
const DETAIL_QUERY = "?viewport=1920x1080&browser=Chrome&environment=staging";

function projectUrl(project: string, testName: string) {
  return `/projects/${encodeURIComponent(project)}/tests/${encodeURIComponent(testName)}${DETAIL_QUERY}`;
}

test.describe("Image Review Loop", () => {
  test.beforeEach(() => {
    projectName = `e2e-image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  });

  test.afterEach(async () => {
    await deleteProject(projectName);
  });

  test("approves a comparison and lands on all-caught-up", async ({ page }) => {
    await createProject(projectName);
    await setupReviewableTest(projectName, "login-form");

    await page.goto(projectUrl(projectName, "login-form"));

    await expect(page.getByTestId("comparison-view")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId("badge-mismatch")).toBeVisible();

    await page.getByTestId("approve-changes").click();

    await expect(page.getByText(/Approved .* of "login-form"/)).toBeVisible({
      timeout: 10000,
    });
    await expect(page).toHaveURL(/\/projects\/.*\/done/, { timeout: 10000 });
    await expect(
      page.getByRole("heading", { name: "All comparisons reviewed" }),
    ).toBeVisible();
  });

  test("identical upload produces no comparison", async ({ page }) => {
    await createProject(projectName);
    await uploadScreenshot(projectName, "login-form", "baseline_black.png");
    await uploadScreenshot(projectName, "login-form", "baseline_black.png");

    await page.goto(projectUrl(projectName, "login-form"));

    await expect(page.getByText("Only baseline available")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId("comparison-view")).not.toBeVisible();
  });

  test("skip navigates to the next pending test", async ({ page }) => {
    await createProject(projectName);
    await setupReviewableTest(projectName, "login-form");
    await setupReviewableTest(projectName, "checkout-flow");

    const pendingResponse = page.waitForResponse(
      (res) => res.url().includes("/meta/pending") && res.ok(),
    );

    await page.goto(projectUrl(projectName, "login-form"));

    await expect(page.getByTestId("comparison-view")).toBeVisible({
      timeout: 10000,
    });
    await pendingResponse;

    await page.getByTestId("skip").click();

    await expect(page).toHaveURL(/tests\/checkout-flow/, {
      timeout: 10000,
    });
    await expect(page.getByTestId("comparison-view")).toBeVisible({
      timeout: 10000,
    });
  });

  test("reviews the full loop until all caught up", async ({ page }) => {
    await createProject(projectName);
    await setupReviewableTest(projectName, "login-form");
    await setupReviewableTest(projectName, "checkout-flow");

    const pendingResponse = page.waitForResponse(
      (res) => res.url().includes("/meta/pending") && res.ok(),
    );

    await page.goto(projectUrl(projectName, "login-form"));

    await expect(page.getByTestId("comparison-view")).toBeVisible({
      timeout: 10000,
    });
    await pendingResponse;
    await page.getByTestId("approve-changes").click();

    await expect(page.getByText(/Approved .* of "login-form"/)).toBeVisible({
      timeout: 10000,
    });
    await expect(page).toHaveURL(/tests\/checkout-flow/, {
      timeout: 10000,
    });
    await expect(page.getByTestId("comparison-view")).toBeVisible({
      timeout: 10000,
    });
    await page.getByTestId("approve-changes").click();

    await expect(page.getByText(/Approved .* of "checkout-flow"/)).toBeVisible({
      timeout: 10000,
    });
    await expect(page).toHaveURL(/\/projects\/.*\/done/, { timeout: 10000 });
    await expect(
      page.getByRole("heading", { name: "All comparisons reviewed" }),
    ).toBeVisible();
  });
});

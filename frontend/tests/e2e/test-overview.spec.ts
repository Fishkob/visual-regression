import { expect, test } from "@playwright/test";
import {
  createProject,
  deleteProject,
  setupPdfBaselines,
  uploadScreenshot,
  waitForImageComparison,
} from "./fixtures/api";
import { testUrl } from "./fixtures/review";
import { TEST_ID } from "@/lib/test-ids";

let projectName: string;

const TEST_NAME = "login-form";

test.describe("Variant gallery and test overview", () => {
  test.beforeEach(async () => {
    projectName = `e2e-overview-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await createProject(projectName);
    for (const viewport of ["1920x1080", "1280x720"]) {
      await uploadScreenshot(projectName, TEST_NAME, "baseline_black.png", {
        viewport,
      });
      await uploadScreenshot(projectName, TEST_NAME, "baseline_blue.png", {
        viewport,
      });
      await waitForImageComparison(projectName, TEST_NAME, 30_000, {
        viewport,
      });
    }
  });

  test.afterEach(async () => {
    await deleteProject(projectName);
  });

  test("switches the variant from the overview", async ({ page }) => {
    await page.goto(testUrl(projectName, TEST_NAME, "1920x1080"));
    await expect(page.getByTestId(TEST_ID.comparisonView)).toBeVisible({
      timeout: 10000,
    });

    // The comparison page carries one comparison, not the variant tiles: it
    // hands over to the overview, which is where a variant is picked.
    await page.getByTestId(TEST_ID.testOverviewLink).click();
    await expect(page.getByTestId(TEST_ID.testOverview)).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId(TEST_ID.testOverviewCard)).toHaveCount(2);

    await page
      .getByTestId(TEST_ID.testOverviewCard)
      .and(page.locator('[data-variant-key^="1280x720|"]'))
      .click();
    await expect(page).toHaveURL(
      (url) => url.searchParams.get("viewport") === "1280x720",
      { timeout: 10000 },
    );
    await expect(page.getByTestId(TEST_ID.badgeViewport)).toContainText(
      "1280x720",
    );
    await expect(page.getByTestId(TEST_ID.comparisonView)).toBeVisible();
  });

  test("opens the overview from the row menu and a tile", async ({ page }) => {
    await page.goto(`/projects/${encodeURIComponent(projectName)}`);

    // The card holds one row per variant; the first row's actions menu holds
    // the overview entry (any variant navigates to the same overview).
    await expect(
      page.getByTestId(TEST_ID.testResultCard).filter({ hasText: TEST_NAME }),
    ).toBeVisible({ timeout: 10000 });
    await page.getByTestId(TEST_ID.testActionsButton).first().click();
    await page.getByTestId(TEST_ID.rowActionOverview).click();

    await expect(page.getByTestId(TEST_ID.testOverview)).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId(TEST_ID.testOverviewCard)).toHaveCount(2);
    await expect(page.getByTestId(TEST_ID.testOverviewBack)).toBeVisible();

    await page
      .getByTestId(TEST_ID.testOverviewCard)
      .and(page.locator('[data-variant-key^="1280x720|"]'))
      .click();
    await expect(page).toHaveURL(
      (url) => url.pathname.endsWith("/tests/login-form"),
      { timeout: 10000 },
    );
    await expect(page.getByTestId(TEST_ID.badgeViewport)).toContainText(
      "1280x720",
    );
    await expect(page.getByTestId(TEST_ID.comparisonView)).toBeVisible();
  });

  test("shows the PDF note instead of a variant overview", async ({ page }) => {
    const pdfProject = `${projectName}-pdf`;
    await setupPdfBaselines(pdfProject, "annual");

    try {
      await page.goto(
        `/projects/${encodeURIComponent(pdfProject)}/tests/annual_report/overview`,
      );
      await expect(page.getByTestId(TEST_ID.testOverview)).toBeVisible({
        timeout: 10000,
      });
      await expect(page.getByTestId(TEST_ID.testOverviewPdfNote)).toContainText(
        "PDF",
      );
      await expect(page.getByTestId(TEST_ID.testOverviewCard)).toHaveCount(0);
    } finally {
      await deleteProject(pdfProject);
    }
  });
});

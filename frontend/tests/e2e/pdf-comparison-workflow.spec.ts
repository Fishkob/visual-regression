import { test, expect } from "@playwright/test";
import {
  setupPdfBaselines,
  uploadPdf,
  waitForPdfComparison,
  deleteProject,
} from "./fixtures/api";
import { TEST_ID } from "@/lib/test-ids";

let projectName: string;
const TEST_NAME = "annual-report";
const DETAIL_QUERY = "?viewport=A4&browser=pdf&environment=staging";

function testUrl(project: string, testName: string) {
  return `/projects/${encodeURIComponent(project)}/tests/${encodeURIComponent(testName)}${DETAIL_QUERY}`;
}

test.beforeEach(async () => {
  projectName = `e2e-pdf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await setupPdfBaselines(projectName, TEST_NAME);
});

test.afterEach(async () => {
  await deleteProject(projectName);
});

test.describe("PDF Comparison Workflow", () => {
  test("shows PDF tests in project detail", async ({ page }) => {
    await page.goto(`/projects/${encodeURIComponent(projectName)}`);

    await expect(
      page
        .getByTestId(TEST_ID.testResultCard)
        .filter({ hasText: `${TEST_NAME}_report` }),
    ).toBeVisible({ timeout: 10000 });
  });

  test("displays comparison after uploading different PDF", async ({
    page,
  }) => {
    await page.goto(`/projects/${encodeURIComponent(projectName)}`);

    await uploadPdf(projectName, `${TEST_NAME}_report`, "sample-v2.pdf");

    await waitForPdfComparison(projectName, `${TEST_NAME}_report`);

    await page.goto(testUrl(projectName, `${TEST_NAME}_report`));

    await expect(page.getByTestId(TEST_ID.mismatchInfo)).toBeVisible({
      timeout: 10000,
    });
  });

  test("can download baseline, candidate and diff PDFs", async ({ page }) => {
    await page.goto(`/projects/${encodeURIComponent(projectName)}`);

    await uploadPdf(projectName, `${TEST_NAME}_report`, "sample-v2.pdf");

    await waitForPdfComparison(projectName, `${TEST_NAME}_report`);

    await page.goto(testUrl(projectName, `${TEST_NAME}_report`));

    await expect(page.getByTestId(TEST_ID.mismatchInfo)).toBeVisible({
      timeout: 10000,
    });

    // Switch to side-by-side to expose baseline + candidate download links
    await page.getByTestId(TEST_ID.modeSidebyside).click();

    const [baselineDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId(TEST_ID.downloadBaseline).click(),
    ]);
    expect(baselineDownload.suggestedFilename()).toContain(
      "annual-report_report-baseline.pdf",
    );

    const [candidateDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId(TEST_ID.downloadCandidate).click(),
    ]);
    expect(candidateDownload.suggestedFilename()).toContain(
      "annual-report_report-candidate.pdf",
    );

    const [diffDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId(TEST_ID.downloadDiff).click(),
    ]);
    expect(diffDownload.suggestedFilename()).toContain(
      "annual-report_report-diff.pdf",
    );
  });

  test("can approve a PDF comparison", async ({ page }) => {
    await page.goto(`/projects/${encodeURIComponent(projectName)}`);

    await uploadPdf(projectName, `${TEST_NAME}_report`, "sample-v2.pdf");

    await waitForPdfComparison(projectName, `${TEST_NAME}_report`);

    await page.goto(testUrl(projectName, `${TEST_NAME}_report`));

    await expect(page.getByTestId(TEST_ID.mismatchInfo)).toBeVisible({
      timeout: 10000,
    });

    await page.getByTestId(TEST_ID.approveChanges).click();

    // Approving the last comparison lands on the done page showing "Back to project list"
    await expect(page.getByTestId(TEST_ID.approveChanges)).not.toBeVisible({
      timeout: 10000,
    });

    await expect(page.getByTestId(TEST_ID.backToProjectList)).toBeVisible({
      timeout: 10000,
    });
  });
});

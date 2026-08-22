import { test, expect } from "@playwright/test";
import {
  createProject,
  setupPdfBaselines,
  uploadPdf,
  waitForPdfComparison,
  deleteProject,
} from "./fixtures/api";

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

    await page.getByRole("button", { name: "PDFs" }).click();

    await expect(
      page.getByRole("button", { name: `${TEST_NAME}_report` }),
    ).toBeVisible({ timeout: 10000 });
  });

  test("displays comparison after uploading different PDF", async ({
    page,
  }) => {
    await page.goto(`/projects/${encodeURIComponent(projectName)}`);

    await uploadPdf(projectName, `${TEST_NAME}_report`, "sample-v2.pdf");

    await waitForPdfComparison(projectName, `${TEST_NAME}_report`);

    await page.goto(testUrl(projectName, `${TEST_NAME}_report`));

    await expect(page.locator('[data-testid="mismatch-info"]')).toBeVisible({
      timeout: 10000,
    });
  });

  test("can download baseline, candidate and diff PDFs", async ({ page }) => {
    await page.goto(`/projects/${encodeURIComponent(projectName)}`);

    await uploadPdf(projectName, `${TEST_NAME}_report`, "sample-v2.pdf");

    await waitForPdfComparison(projectName, `${TEST_NAME}_report`);

    await page.goto(testUrl(projectName, `${TEST_NAME}_report`));

    await expect(page.locator('[data-testid="mismatch-info"]')).toBeVisible({
      timeout: 10000,
    });

    // Switch to side-by-side to expose baseline + candidate download links
    await page.getByTestId("mode-sidebyside").click();

    const [baselineDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.getByText("Download Baseline PDF").click(),
    ]);
    expect(baselineDownload.suggestedFilename()).toContain(
      "annual-report_report-baseline.pdf",
    );

    const [candidateDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.getByText("Download Candidate PDF").click(),
    ]);
    expect(candidateDownload.suggestedFilename()).toContain(
      "annual-report_report-candidate.pdf",
    );

    const [diffDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.getByText("Download Diff PDF").click(),
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

    await expect(page.locator('[data-testid="mismatch-info"]')).toBeVisible({
      timeout: 10000,
    });

    await page.getByRole("button", { name: "Approve changes" }).click();

    // After approval the Approve button disappears and the Skip button becomes "Back to project"
    await expect(
      page.getByRole("button", { name: "Approve changes" }),
    ).not.toBeVisible({ timeout: 10000 });

    await expect(
      page.getByRole("button", { name: "Back to project" }),
    ).toBeVisible({ timeout: 10000 });
  });
});

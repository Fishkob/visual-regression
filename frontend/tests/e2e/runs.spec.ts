import { expect, test } from "@playwright/test";
import {
  createProject,
  deleteProject,
  uploadScreenshot,
  waitForImageComparison,
} from "./fixtures/api";
import { TEST_ID } from "@/lib/test-ids";

let projectName: string;
let runKey: string;

test.describe("CI runs", () => {
  test.beforeEach(async () => {
    projectName = `e2e-run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    runKey = `ci-e2e-${Date.now()}`;
    await createProject(projectName);
    await uploadScreenshot(projectName, "login-form", "baseline_black.png");
    await uploadScreenshot(projectName, "login-form", "baseline_blue.png", {
      runKey,
      commitSha: "9fceb02abcdef",
      commitMessage: "feat: run e2e coverage",
      ciUrl: "https://ci.example.com/runs/42",
    });
    await waitForImageComparison(projectName, "login-form");
  });

  test.afterEach(async () => {
    await deleteProject(projectName);
  });

  test("lists a run, opens it, approves all and finishes it", async ({
    page,
  }) => {
    await page.goto(`/projects/${encodeURIComponent(projectName)}/runs`);
    await expect(page.getByTestId(TEST_ID.runsView)).toBeVisible({
      timeout: 10000,
    });

    const row = page.getByTestId(TEST_ID.runRow).filter({ hasText: runKey });
    await expect(row).toBeVisible({ timeout: 10000 });
    await expect(row.getByTestId(TEST_ID.runCommit)).toContainText(
      "feat: run e2e coverage",
    );
    await row.locator("a").first().click();

    await expect(page.getByTestId(TEST_ID.runDetail)).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId(TEST_ID.runStateBadge)).toContainText(
      "Pending",
    );
    await expect(page.getByTestId(TEST_ID.runPendingCount)).toHaveText("1");
    await expect(page.getByTestId(TEST_ID.runPendingRow)).toBeVisible();

    await page.getByTestId(TEST_ID.runApproveAll).click();
    await page.getByTestId(TEST_ID.dialogConfirm).click();
    await expect(page.getByTestId(TEST_ID.toaster)).toContainText(
      /Approved 1 comparison/,
      { timeout: 10000 },
    );
    await expect(page.getByTestId(TEST_ID.runPendingRow)).toHaveCount(0, {
      timeout: 10000,
    });
    await expect(page.getByTestId(TEST_ID.runPendingCount)).toHaveText("0");
    await expect(page.getByTestId(TEST_ID.runApprovalRow)).toBeVisible();

    await page.getByTestId(TEST_ID.runFinish).click();
    await page.getByTestId(TEST_ID.dialogConfirm).click();
    await expect(page.getByTestId(TEST_ID.toaster)).toContainText(
      "Run finished",
      { timeout: 10000 },
    );
    await expect(page.getByTestId(TEST_ID.runStateBadge)).toContainText(
      "Passed",
      { timeout: 10000 },
    );
    await expect(page.getByTestId(TEST_ID.runFinish)).toBeDisabled();
  });

  test("downloads the JUnit, HTML and CSV reports", async ({ page }) => {
    await page.goto(
      `/projects/${encodeURIComponent(projectName)}/runs/${encodeURIComponent(runKey)}`,
    );
    await expect(page.getByTestId(TEST_ID.runDetail)).toBeVisible({
      timeout: 10000,
    });

    const reports = [
      { id: TEST_ID.runReportJunit, extension: "xml", format: "JUnit" },
      { id: TEST_ID.runReportHtml, extension: "html", format: "HTML" },
      { id: TEST_ID.runReportCsv, extension: "csv", format: "CSV" },
    ];
    for (const report of reports) {
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByTestId(report.id).click(),
      ]);
      expect(download.suggestedFilename()).toBe(
        `vrt-${runKey}.${report.extension}`,
      );
    }
  });
});

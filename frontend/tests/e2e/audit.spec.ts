import * as fs from "fs";
import { expect, test } from "@playwright/test";
import {
  approveComparison,
  deleteProject,
  setupReviewableTest,
} from "./fixtures/api";
import { TEST_ID } from "@/lib/test-ids";

let projectName: string;

test.describe("Audit log", () => {
  test.beforeEach(async () => {
    projectName = `e2e-audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await setupReviewableTest(projectName, "login-form");
    // Approval writes one `approval` audit row naming the project.
    await approveComparison(projectName, "login-form");
  });

  test.afterEach(async () => {
    await deleteProject(projectName);
  });

  test("filters approval rows by action and project", async ({ page }) => {
    await page.goto("/audit");
    await expect(page.getByTestId(TEST_ID.auditView)).toBeVisible({
      timeout: 10000,
    });

    await page.getByTestId(TEST_ID.auditActionFilter).click();
    await page.getByRole("option", { name: "Approval" }).click();
    await page.getByTestId(TEST_ID.auditProjectFilter).fill(projectName);
    await page.getByTestId(TEST_ID.auditApply).click();

    const row = page
      .getByTestId(TEST_ID.auditRow)
      .filter({ hasText: projectName });
    await expect(row).toBeVisible({ timeout: 10000 });
    await expect(row).toContainText("Approval");
    await expect(row).toContainText("login-form");
    await expect(row.getByTestId(TEST_ID.auditDetails)).toBeVisible();

    await page.getByTestId(TEST_ID.auditReset).click();
    await page.getByTestId(TEST_ID.auditActorFilter).fill("no-such-actor-e2e");
    await page.getByTestId(TEST_ID.auditApply).click();
    await expect(page.getByTestId(TEST_ID.auditEmpty)).toBeVisible({
      timeout: 10000,
    });
  });

  test("exports the filtered audit rows as CSV", async ({ page }) => {
    await page.goto("/audit");
    await expect(page.getByTestId(TEST_ID.auditView)).toBeVisible({
      timeout: 10000,
    });
    await page.getByTestId(TEST_ID.auditProjectFilter).fill(projectName);
    await page.getByTestId(TEST_ID.auditApply).click();
    await expect(
      page.getByTestId(TEST_ID.auditRow).filter({ hasText: projectName }),
    ).toBeVisible({ timeout: 10000 });

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId(TEST_ID.auditExport).click(),
    ]);
    expect(download.suggestedFilename()).toBe("audit.csv");
    await expect(page.getByTestId(TEST_ID.toaster)).toContainText(
      "Audit log exported",
      { timeout: 10000 },
    );

    const file = await download.path();
    expect(file).toBeTruthy();
    const csv = fs.readFileSync(file!, "utf8");
    expect(csv.split("\n")[0]).toMatch(/createdAt|action|actor/i);
    expect(csv).toContain(projectName);
    expect(csv).toContain("approval");
  });
});

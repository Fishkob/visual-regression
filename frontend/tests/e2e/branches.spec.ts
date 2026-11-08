import { expect, test } from "@playwright/test";
import {
  createProject,
  deleteProject,
  getBranches,
  uploadScreenshot,
} from "./fixtures/api";
import { TEST_ID } from "@/lib/test-ids";
import { confirmDialog, expectToast } from "./fixtures/ui";

let projectName: string;

const TEST_NAME = "login-form";

test.describe("Project branches", () => {
  test.beforeEach(async () => {
    projectName = `e2e-branch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await createProject(projectName);
    await uploadScreenshot(projectName, TEST_NAME, "baseline_black.png");
    await uploadScreenshot(projectName, TEST_NAME, "baseline_black.png", {
      branch: "feature/login",
    });
    await uploadScreenshot(projectName, TEST_NAME, "baseline_black.png", {
      branch: "feature/other",
    });
  });

  test.afterEach(async () => {
    await deleteProject(projectName);
  });

  test("switches to a feature branch and shows where it inherits from", async ({
    page,
  }) => {
    await page.goto(`/projects/${encodeURIComponent(projectName)}`);
    await expect(page.getByTestId(TEST_ID.projectBranchSelect)).toBeVisible();

    await page.getByTestId(TEST_ID.projectBranchSelect).click();
    await page.getByRole("option", { name: "feature/login" }).click();
    await expect(page).toHaveURL(
      (url) => url.searchParams.get("branch") === "feature/login",
    );
    await expect(page.getByTestId(TEST_ID.projectBranchTarget)).toContainText(
      "main",
    );

    const branches = await getBranches(projectName);
    expect(branches.map((branch) => branch.name).sort()).toEqual([
      "feature/login",
      "feature/other",
      "main",
    ]);
    expect(branches.find((branch) => branch.name === "main")?.isDefault).toBe(
      true,
    );
  });

  test("retargets, sets default and deletes a branch", async ({ page }) => {
    await page.goto(`/projects/${encodeURIComponent(projectName)}`);
    await expect(page.getByTestId(TEST_ID.projectBranchSelect)).toBeVisible();
    await page.getByTestId(TEST_ID.projectBranchSelect).click();
    await page.getByRole("option", { name: "feature/login" }).click();

    // Retarget: feature/login inherits from feature/other from now on.
    await page.getByTestId(TEST_ID.branchActionsButton).click();
    await page.getByTestId(TEST_ID.branchChangeTarget).click();
    await expect(page.getByTestId(TEST_ID.branchTargetDialog)).toBeVisible();
    await page.getByTestId(TEST_ID.branchTargetSelect).click();
    await page.getByRole("option", { name: "feature/other" }).click();
    await page.getByTestId(TEST_ID.branchTargetConfirm).click();
    await expectToast(page, "Branch target updated");
    await expect(page.getByTestId(TEST_ID.projectBranchTarget)).toContainText(
      "feature/other",
    );

    // Back to the project default so feature/other has no dependents and can
    // be deleted below.
    await page.getByTestId(TEST_ID.branchActionsButton).click();
    await page.getByTestId(TEST_ID.branchChangeTarget).click();
    await page.getByTestId(TEST_ID.branchTargetSelect).click();
    await page.getByRole("option", { name: "Project default" }).click();
    await page.getByTestId(TEST_ID.branchTargetConfirm).click();
    await expectToast(page, "Branch target updated");

    // Promote the feature branch to default.
    await page.getByTestId(TEST_ID.branchActionsButton).click();
    await page.getByTestId(TEST_ID.branchSetDefault).click();
    await expectToast(page, "Default branch updated");
    await expect(
      (await getBranches(projectName)).find(
        (branch) => branch.name === "feature/login",
      )?.isDefault,
    ).toBe(true);

    // A leaf branch can be deleted.
    await page.getByTestId(TEST_ID.projectBranchSelect).click();
    await page.getByRole("option", { name: "feature/other" }).click();
    await page.getByTestId(TEST_ID.branchActionsButton).click();
    await page.getByTestId(TEST_ID.branchDelete).click();
    await expect(page.getByTestId(TEST_ID.dialogConfirm)).toBeVisible();
    await confirmDialog(page);
    await expectToast(page, "Branch deleted");
    await expect(
      (await getBranches(projectName)).some(
        (branch) => branch.name === "feature/other",
      ),
    ).toBe(false);

    // The default branch cannot be deleted; the menu explains why.
    await page.getByTestId(TEST_ID.projectBranchSelect).click();
    await page.getByRole("option", { name: /^feature\/login/ }).click();
    await page.getByTestId(TEST_ID.branchActionsButton).click();
    await expect(page.getByTestId(TEST_ID.branchDeleteBlocked)).toContainText(
      "default branch",
    );
  });
});

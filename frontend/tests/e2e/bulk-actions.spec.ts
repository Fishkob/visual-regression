import { expect, test } from "@playwright/test";
import {
  createGroup,
  createProject,
  deleteGroup,
  deleteProject,
  getGroups,
  setupReviewableTest,
} from "./fixtures/api";
import { TEST_ID } from "@/lib/test-ids";
import { byText, confirmDialog, expectToast } from "./fixtures/ui";

function unique(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test.describe("Bulk actions", () => {
  test("approves two inbox items in one batch", async ({ page }) => {
    const projectName = unique("e2e-bulk-inbox");
    await createProject(projectName);
    try {
      await setupReviewableTest(projectName, "login-form");
      await setupReviewableTest(projectName, "checkout-flow");

      await page.goto("/");
      const section = byText(page, TEST_ID.inboxProjectSection, projectName);
      await expect(section).toBeVisible();
      const checkboxes = section.getByTestId(TEST_ID.inboxSelectRow);
      await expect(checkboxes).toHaveCount(2);
      await checkboxes.nth(0).check();
      await checkboxes.nth(1).check();

      const bar = page.getByTestId(TEST_ID.inboxBulkBar);
      await expect(bar).toContainText("2 selected");
      await page.getByTestId(TEST_ID.inboxBulkApprove).click();
      await expect(page.getByTestId(TEST_ID.dialogConfirm)).toBeVisible();
      await confirmDialog(page);

      await expectToast(page, "Approved 2 changes");
      await expect(
        byText(page, TEST_ID.inboxProjectSection, projectName).getByTestId(
          TEST_ID.inboxItem,
        ),
      ).toHaveCount(0);
    } finally {
      await deleteProject(projectName);
    }
  });

  test("moves several projects into a group", async ({ page }) => {
    const groupName = unique("e2e-bulk-group");
    const first = unique("e2e-bulk-project-a");
    const second = unique("e2e-bulk-project-b");
    await createGroup(groupName);
    await createProject(first);
    await createProject(second);

    try {
      await page.goto("/projects");
      for (const name of [first, second]) {
        const row = byText(page, TEST_ID.projectRow, name);
        await expect(row).toBeVisible();
        await row.getByTestId(TEST_ID.projectSelectRow).check();
      }
      await expect(page.getByTestId(TEST_ID.projectBulkBar)).toContainText(
        "2 selected",
      );

      await page.getByTestId(TEST_ID.projectBulkMove).click();
      await page.getByTestId(TEST_ID.projectBulkMoveGroup).click();
      await page.getByRole("option", { name: groupName }).click();
      await page.getByTestId(TEST_ID.projectBulkMoveConfirm).click();

      await expectToast(page, "Moved 2 projects");

      await page.goto(`/projects/${encodeURIComponent(first)}`);
      await expect(page.getByTestId(TEST_ID.projectGroupBadge)).toContainText(
        groupName,
      );
      await page.goto(`/projects/${encodeURIComponent(second)}`);
      await expect(page.getByTestId(TEST_ID.projectGroupBadge)).toContainText(
        groupName,
      );
    } finally {
      await deleteProject(first);
      await deleteProject(second);
      const groups = await getGroups();
      const match = groups.find((entry) => entry.name === groupName);
      if (match) await deleteGroup(match.id);
    }
  });
});

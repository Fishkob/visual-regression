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
      const section = page
        .getByTestId(TEST_ID.inboxProjectSection)
        .filter({ hasText: projectName });
      await expect(section).toBeVisible({ timeout: 10000 });
      const checkboxes = section.getByTestId(TEST_ID.inboxSelectRow);
      await expect(checkboxes).toHaveCount(2, { timeout: 10000 });
      await checkboxes.nth(0).check();
      await checkboxes.nth(1).check();

      const bar = page.getByTestId(TEST_ID.inboxBulkBar);
      await expect(bar).toContainText("2 selected");
      await page.getByTestId(TEST_ID.inboxBulkApprove).click();
      await expect(page.getByTestId(TEST_ID.dialogConfirm)).toBeVisible();
      await page.getByTestId(TEST_ID.dialogConfirm).click();

      await expect(page.getByTestId(TEST_ID.toaster)).toContainText(
        "Approved 2 changes",
        { timeout: 10000 },
      );
      await expect(
        page
          .getByTestId(TEST_ID.inboxProjectSection)
          .filter({ hasText: projectName })
          .getByTestId(TEST_ID.inboxItem),
      ).toHaveCount(0, { timeout: 10000 });
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
        const row = page
          .getByTestId(TEST_ID.tableRow)
          .filter({ hasText: name });
        await expect(row).toBeVisible({ timeout: 10000 });
        await row.locator("..").getByTestId(TEST_ID.projectSelectRow).check();
      }
      await expect(page.getByTestId(TEST_ID.projectBulkBar)).toContainText(
        "2 selected",
      );

      await page.getByTestId(TEST_ID.projectBulkMove).click();
      await page.getByTestId(TEST_ID.projectBulkMoveGroup).click();
      await page.getByRole("option", { name: groupName }).click();
      await page.getByTestId(TEST_ID.projectBulkMoveConfirm).click();

      await expect(page.getByTestId(TEST_ID.toaster)).toContainText(
        "Moved 2 projects",
        { timeout: 10000 },
      );

      await page.goto(`/projects/${encodeURIComponent(first)}`);
      await expect(page.getByTestId(TEST_ID.projectGroupBadge)).toContainText(
        groupName,
        { timeout: 10000 },
      );
      await page.goto(`/projects/${encodeURIComponent(second)}`);
      await expect(page.getByTestId(TEST_ID.projectGroupBadge)).toContainText(
        groupName,
        { timeout: 10000 },
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

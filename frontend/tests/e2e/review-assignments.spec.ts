import { expect, test } from "@playwright/test";
import { deleteProject, setupReviewableTest } from "./fixtures/api";
import { testUrl } from "./fixtures/review";
import { TEST_ID } from "@/lib/test-ids";
import { byText, expectToast } from "./fixtures/ui";

// Assignments land on "my reviews" below, so the assignee is the session user.
const ADMIN_USERNAME = process.env.E2E_ADMIN_USERNAME ?? "admin";

let projectName: string;

const TEST_NAME = "login-form";

test.describe("Review assignments", () => {
  test.beforeEach(async () => {
    projectName = `e2e-review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await setupReviewableTest(projectName, TEST_NAME);
  });

  test.afterEach(async () => {
    await deleteProject(projectName);
  });

  test("assigns the review to a reviewer and completes it", async ({
    page,
  }) => {
    await page.goto(testUrl(projectName, TEST_NAME));
    await expect(page.getByTestId(TEST_ID.comparisonView)).toBeVisible();
    await expect(page.getByTestId(TEST_ID.assignBadge)).toHaveCount(0);

    await page.getByTestId(TEST_ID.assignAction).click();
    await expect(page.getByTestId(TEST_ID.assignDialog)).toBeVisible();
    await page.getByTestId(TEST_ID.assignAssignee).fill(ADMIN_USERNAME);
    await page.getByTestId(TEST_ID.assignDueAt).fill("2030-06-01");
    await page.getByTestId(TEST_ID.assignSave).click();

    await expectToast(page, "Assignment created");
    const badge = page.getByTestId(TEST_ID.assignBadge);
    await expect(badge).toContainText(ADMIN_USERNAME);
    await expect(badge).toContainText("Due");

    await page.getByTestId(TEST_ID.assignComplete).click();
    await expectToast(page, "Assignment completed");
    await expect(page.getByTestId(TEST_ID.assignBadge)).toHaveCount(0);
    await expect(page.getByTestId(TEST_ID.assignComplete)).toHaveCount(0);
  });

  test("lists an assignment in the inbox and can complete it there", async ({
    page,
  }) => {
    await page.goto(testUrl(projectName, TEST_NAME));
    await expect(page.getByTestId(TEST_ID.comparisonView)).toBeVisible();
    await page.getByTestId(TEST_ID.assignAction).click();
    await page.getByTestId(TEST_ID.assignAssignee).fill(ADMIN_USERNAME);
    await page.getByTestId(TEST_ID.assignSave).click();
    await expect(page.getByTestId(TEST_ID.assignBadge)).toBeVisible();

    await page.goto("/");
    await page.getByTestId(TEST_ID.inboxAssignedToMe).check();
    const section = byText(page, TEST_ID.inboxProjectSection, projectName);
    await expect(section).toBeVisible();
    await expect(byText(section, TEST_ID.inboxItem, TEST_NAME)).toBeVisible();
  });
});

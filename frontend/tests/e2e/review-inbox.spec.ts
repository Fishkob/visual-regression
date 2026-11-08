import { test, expect } from "@playwright/test";
import {
  createProject,
  deleteProject,
  setupReviewableTest,
} from "./fixtures/api";
import { TEST_ID } from "@/lib/test-ids";
import { approveCurrentComparison } from "./fixtures/review";
import { byText } from "./fixtures/ui";

let projectName: string;

test.beforeEach(async () => {
  projectName = `e2e-inbox-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await createProject(projectName);
  await setupReviewableTest(projectName, "login-form");
});

test.afterEach(async () => {
  await deleteProject(projectName);
});

test("opens a single review from the inbox and returns to the inbox", async ({
  page,
}) => {
  await page.goto("/");
  const section = byText(page, TEST_ID.inboxProjectSection, projectName);
  const item = byText(section, TEST_ID.inboxItem, "login-form");
  await expect(item).toBeVisible();
  await item.click();

  await expect(page.getByTestId(TEST_ID.comparisonView)).toBeVisible();
  await approveCurrentComparison(page);

  await expect(page).toHaveURL("/");
});

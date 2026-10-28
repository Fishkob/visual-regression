import { test, expect } from "@playwright/test";
import {
  createProject,
  deleteProject,
  setupReviewableTest,
} from "./fixtures/api";
import { TEST_ID } from "@/lib/test-ids";
import { approveCurrentComparison } from "./fixtures/review";

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
  const section = page
    .getByTestId(TEST_ID.inboxProjectSection)
    .filter({ hasText: projectName });
  const item = section
    .getByTestId(TEST_ID.inboxItem)
    .filter({ hasText: "login-form" });
  await expect(item).toBeVisible({ timeout: 10000 });
  await item.click();

  await expect(page.getByTestId(TEST_ID.comparisonView)).toBeVisible({
    timeout: 10000,
  });
  await approveCurrentComparison(page);

  await expect(page).toHaveURL("/", { timeout: 10000 });
});

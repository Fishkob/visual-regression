import { expect, test } from "@playwright/test";
import {
  createComment,
  deleteProject,
  loginSession,
  setupReviewableTest,
  uploadScreenshot,
} from "./fixtures/api";
import { testUrl } from "./fixtures/review";
import { TEST_ID } from "@/lib/test-ids";

let projectName: string;
let cookie: string;

const TEST_NAME = "login-form";

test.describe("Review comments", () => {
  test.beforeEach(async () => {
    projectName = `e2e-comments-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await setupReviewableTest(projectName, TEST_NAME);
    cookie = await loginSession();
  });

  test.afterEach(async () => {
    await deleteProject(projectName);
  });

  test("adds, lists and resolves a comment on the comparison", async ({
    page,
  }) => {
    await page.goto(testUrl(projectName, TEST_NAME));
    await expect(page.getByTestId(TEST_ID.comparisonView)).toBeVisible({
      timeout: 10000,
    });

    // The panel starts collapsed while the thread is empty, so the diff keeps
    // the reviewer's scroll.
    await expect(page.getByTestId(TEST_ID.commentsPanel)).toBeVisible();
    await page.getByTestId(TEST_ID.commentsToggle).click();
    await expect(page.getByTestId(TEST_ID.commentsBody)).toBeVisible();
    await expect(page.getByTestId(TEST_ID.commentRow)).toHaveCount(0);

    const commentText = `Does this button look right? ${Date.now()}`;
    await page.getByTestId(TEST_ID.commentsBody).fill(commentText);
    await page.getByTestId(TEST_ID.commentsSubmit).click();

    await expect(page.getByTestId(TEST_ID.toaster)).toContainText(
      "Comment added",
      { timeout: 10000 },
    );
    const row = page
      .getByTestId(TEST_ID.commentRow)
      .filter({ hasText: commentText });
    await expect(row).toBeVisible({ timeout: 10000 });
    await expect(row).toContainText("alice");
    await expect(page.getByTestId(TEST_ID.commentsBody)).toHaveValue("");

    // A comment stored without a comparison id is thread-level: the
    // comparison-only filter must hide it.
    const threadText = `Thread-level note ${Date.now()}`;
    await createComment(cookie, projectName, TEST_NAME, threadText);

    // An externally created comment is only visible after a refetch, and the
    // "all comments" key is still fresh in the cache.
    await page.reload();
    await expect(page.getByTestId(TEST_ID.commentRow)).toHaveCount(2, {
      timeout: 10000,
    });

    await page.getByTestId(TEST_ID.commentsOnlyComparison).check();
    await expect(page.getByTestId(TEST_ID.commentRow)).toHaveCount(1, {
      timeout: 10000,
    });
    await expect(
      page.getByTestId(TEST_ID.commentRow).filter({ hasText: threadText }),
    ).toHaveCount(0);

    await page.getByTestId(TEST_ID.commentsOnlyComparison).uncheck();
    await expect(page.getByTestId(TEST_ID.commentRow)).toHaveCount(2, {
      timeout: 10000,
    });

    await row.getByTestId(TEST_ID.commentResolve).click();
    await expect(page.getByTestId(TEST_ID.toaster)).toContainText(
      "Comment resolved",
      { timeout: 10000 },
    );
    await expect(row.getByTestId(TEST_ID.commentResolved)).toBeVisible();
    await expect(row.getByTestId(TEST_ID.commentResolve)).toHaveCount(0);
    await expect(row).toContainText("Resolved by alice");
  });

  test("keeps resolved comments after a reload", async ({ page }) => {
    await page.goto(testUrl(projectName, TEST_NAME));
    await expect(page.getByTestId(TEST_ID.comparisonView)).toBeVisible({
      timeout: 10000,
    });

    const commentText = `Anchored note ${Date.now()}`;
    await createComment(cookie, projectName, TEST_NAME, commentText);
    await page.reload();

    const row = page
      .getByTestId(TEST_ID.commentRow)
      .filter({ hasText: commentText });
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.getByTestId(TEST_ID.commentResolve).click();
    await expect(row.getByTestId(TEST_ID.commentResolved)).toBeVisible({
      timeout: 10000,
    });

    await page.reload();
    await expect(
      page
        .getByTestId(TEST_ID.commentRow)
        .filter({ hasText: commentText })
        .getByTestId(TEST_ID.commentResolved),
    ).toBeVisible({ timeout: 10000 });
  });

  test("shows an inherited branch thread read-only", async ({ page }) => {
    const commentText = `Thread owned by main ${Date.now()}`;
    await createComment(cookie, projectName, TEST_NAME, commentText);

    // The branch owns a different test only; login-form stays an inherited
    // shadow there, which is the read-only case.
    await uploadScreenshot(projectName, "signup-form", "baseline_black.png", {
      branch: "feature/inherit",
    });

    await page.goto(
      testUrl(projectName, TEST_NAME, "1920x1080", "Chrome", "staging", {
        branch: "feature/inherit",
      }),
    );
    await expect(page.getByTestId(TEST_ID.inheritedBadge)).toBeVisible({
      timeout: 10000,
    });

    // Reading an inherited thread is allowed; writing and resolving are not.
    // A non-empty thread renders expanded, so the row is already reachable.
    await expect(
      page.getByTestId(TEST_ID.commentRow).filter({ hasText: commentText }),
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId(TEST_ID.commentsBody)).toHaveCount(0);
    await expect(page.getByTestId(TEST_ID.commentResolve)).toHaveCount(0);
  });
});

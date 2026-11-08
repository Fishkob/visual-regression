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
import { byText, expectToast } from "./fixtures/ui";

let projectName: string;
let cookie: string;

const TEST_NAME = "login-form";

// The comment author is whoever the session belongs to; no fixture seeds a
// fixed display name.
const ADMIN_USERNAME = process.env.E2E_ADMIN_USERNAME ?? "admin";

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
    await expect(page.getByTestId(TEST_ID.comparisonView)).toBeVisible();

    // The discussion sits beside the comparison, so an empty thread still
    // offers its composer without a click.
    await expect(page.getByTestId(TEST_ID.commentsPanel)).toBeVisible();
    await expect(page.getByTestId(TEST_ID.commentsBody)).toBeVisible();
    await expect(page.getByTestId(TEST_ID.commentRow)).toHaveCount(0);

    const commentText = `Does this button look right? ${Date.now()}`;
    await page.getByTestId(TEST_ID.commentsBody).fill(commentText);
    await page.getByTestId(TEST_ID.commentsSubmit).click();

    await expectToast(page, "Comment added");
    const row = byText(page, TEST_ID.commentRow, commentText);
    await expect(row).toBeVisible();
    await expect(row).toContainText(ADMIN_USERNAME);
    await expect(page.getByTestId(TEST_ID.commentsBody)).toHaveValue("");

    // A comment stored without a comparison id is thread-level: the
    // comparison-only filter must hide it.
    const threadText = `Thread-level note ${Date.now()}`;
    await createComment(cookie, projectName, TEST_NAME, threadText);

    // An externally created comment is only visible after a refetch, and the
    // "all comments" key is still fresh in the cache.
    await page.reload();
    await expect(page.getByTestId(TEST_ID.commentRow)).toHaveCount(2);

    await page.getByTestId(TEST_ID.commentsOnlyComparison).check();
    await expect(page.getByTestId(TEST_ID.commentRow)).toHaveCount(1);
    await expect(byText(page, TEST_ID.commentRow, threadText)).toHaveCount(0);

    await page.getByTestId(TEST_ID.commentsOnlyComparison).uncheck();
    await expect(page.getByTestId(TEST_ID.commentRow)).toHaveCount(2);

    await row.getByTestId(TEST_ID.commentResolve).click();
    await expectToast(page, "Comment resolved");

    // Resolved comments fold into their own group, so the reviewer can see
    // what is still open at a glance.
    await page.getByTestId(TEST_ID.commentsResolvedToggle).click();
    await expect(row.getByTestId(TEST_ID.commentResolved)).toBeVisible();
    await expect(row.getByTestId(TEST_ID.commentResolve)).toHaveCount(0);
    await expect(row).toContainText(`Resolved by ${ADMIN_USERNAME}`);
  });

  test("keeps resolved comments after a reload", async ({ page }) => {
    await page.goto(testUrl(projectName, TEST_NAME));
    await expect(page.getByTestId(TEST_ID.comparisonView)).toBeVisible();

    const commentText = `Anchored note ${Date.now()}`;
    await createComment(cookie, projectName, TEST_NAME, commentText);
    await page.reload();

    const row = byText(page, TEST_ID.commentRow, commentText);
    await expect(row).toBeVisible();
    await row.getByTestId(TEST_ID.commentResolve).click();

    await page.getByTestId(TEST_ID.commentsResolvedToggle).click();
    await expect(row.getByTestId(TEST_ID.commentResolved)).toBeVisible();

    await page.reload();
    await page.getByTestId(TEST_ID.commentsResolvedToggle).click();
    await expect(
      byText(page, TEST_ID.commentRow, commentText).getByTestId(
        TEST_ID.commentResolved,
      ),
    ).toBeVisible();
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
    await expect(page.getByTestId(TEST_ID.inheritedBadge)).toBeVisible();

    // Reading an inherited thread is allowed; writing and resolving are not.
    // The open thread is the rail's first tab, so the row is already there.
    await expect(byText(page, TEST_ID.commentRow, commentText)).toBeVisible();
    await expect(page.getByTestId(TEST_ID.commentsBody)).toHaveCount(0);
    await expect(page.getByTestId(TEST_ID.commentResolve)).toHaveCount(0);
  });
});

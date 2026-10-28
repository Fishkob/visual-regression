import { expect, test } from "@playwright/test";
import {
  deleteProject,
  getTestMetadata,
  getTestStatus,
  getVariants,
  setupReviewableTest,
} from "./fixtures/api";
import { testUrl } from "./fixtures/review";
import { TEST_ID } from "@/lib/test-ids";

let projectName: string;

const TEST_NAME = "login-form";

test.describe("Test lifecycle", () => {
  test.beforeEach(async () => {
    projectName = `e2e-lifecycle-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await setupReviewableTest(projectName, TEST_NAME);
  });

  test.afterEach(async () => {
    await deleteProject(projectName);
  });

  test("renames, describes, tags and resizes a test", async ({ page }) => {
    await page.goto(testUrl(projectName, TEST_NAME));
    await expect(page.getByTestId(TEST_ID.comparisonView)).toBeVisible({
      timeout: 10000,
    });

    const renamed = "login-form-renamed";
    await page.getByTestId(TEST_ID.testEditAction).click();
    await expect(page.getByTestId(TEST_ID.testEditDialog)).toBeVisible();

    const nameInput = page.getByTestId(TEST_ID.testEditName);
    await expect(nameInput).toHaveValue(TEST_NAME);
    await nameInput.fill(renamed);
    await page
      .getByTestId(TEST_ID.testEditDescription)
      .fill("Login form screenshot");
    await page.getByTestId(TEST_ID.testEditTags).fill("smoke, checkout");

    await page.getByTestId(TEST_ID.testSizePolicySelect).click();
    await page.getByRole("option", { name: "Resize" }).click();

    await page.getByTestId(TEST_ID.testMuteSubmit).click();
    await expect(page.getByTestId(TEST_ID.toaster)).toContainText(
      "Test updated",
      { timeout: 10000 },
    );

    // A rename changes the route identity, so the page replaces the URL and
    // keeps the variant query.
    await expect(page).toHaveURL(new RegExp(`/tests/${renamed}(\\?|$)`), {
      timeout: 10000,
    });
    await expect(page.getByTestId(TEST_ID.testDescription)).toHaveText(
      "Login form screenshot",
    );
    await expect(page.getByTestId(TEST_ID.testTags)).toContainText("smoke");
    await expect(page.getByTestId(TEST_ID.testTags)).toContainText("checkout");
    await expect(page.getByTestId(TEST_ID.testSizePolicy)).toContainText(
      "Size policy: Resize",
    );

    const metadata = await getTestMetadata(projectName, renamed);
    expect(metadata).toEqual(
      expect.objectContaining({
        name: renamed,
        description: "Login form screenshot",
        tags: expect.arrayContaining(["smoke", "checkout"]),
        sizePolicy: "RESIZE",
      }),
    );
    expect(await getTestStatus(projectName, TEST_NAME)).toBe(404);
    expect(await getTestStatus(projectName, renamed)).toBe(200);
  });

  test("mutes and unmutes a test", async ({ page }) => {
    await page.goto(testUrl(projectName, TEST_NAME));
    await expect(page.getByTestId(TEST_ID.comparisonView)).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId(TEST_ID.testMutedBadge)).toHaveCount(0);

    await page.getByTestId(TEST_ID.testEditAction).click();
    await page.getByTestId(TEST_ID.testMuteUntil).fill("2030-01-01T12:00");
    await page.getByTestId(TEST_ID.testMuteReason).fill("Flaky animation");
    await page.getByTestId(TEST_ID.testMuteSubmit).click();

    await expect(page.getByTestId(TEST_ID.testMutedBadge)).toBeVisible({
      timeout: 10000,
    });
    const muted = await getTestMetadata(projectName, TEST_NAME);
    expect(muted).toEqual(
      expect.objectContaining({
        isMuted: true,
        muteReason: "Flaky animation",
      }),
    );

    await page.getByTestId(TEST_ID.testEditAction).click();
    await page.getByTestId(TEST_ID.testUnmute).click();
    await expect(page.getByTestId(TEST_ID.testMutedBadge)).toHaveCount(0, {
      timeout: 10000,
    });
    const unmuted = await getTestMetadata(projectName, TEST_NAME);
    expect(unmuted).toEqual(expect.objectContaining({ isMuted: false }));
  });

  test("deletes a test variant from the project table", async ({ page }) => {
    await page.goto(`/projects/${encodeURIComponent(projectName)}`);

    const card = page
      .getByTestId(TEST_ID.testResultCard)
      .filter({ hasText: TEST_NAME });
    await expect(card).toBeVisible({ timeout: 10000 });

    await card.getByTestId(TEST_ID.testActionsButton).click();
    await page.getByTestId(TEST_ID.rowActionDelete).click();
    await expect(page.getByTestId(TEST_ID.dialogConfirm)).toBeVisible({
      timeout: 10000,
    });
    await page.getByTestId(TEST_ID.dialogConfirm).click();

    // Deleting is variant-scoped even when it is the last variant: the test
    // row survives with no variants, which is exactly what the API reports.
    await expect(page.getByTestId(TEST_ID.toaster)).toContainText(
      /Deleted .* of "login-form"/,
      { timeout: 10000 },
    );
    expect(await getVariants(projectName, TEST_NAME)).toEqual([]);
    expect(await getTestStatus(projectName, TEST_NAME)).toBe(200);
  });
});

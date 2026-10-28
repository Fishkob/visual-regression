import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { deleteProject, setupReviewableTest } from "./fixtures/api";
import { TEST_ID } from "@/lib/test-ids";

let projectName: string;

const TEST_NAME = "login-form";

function baseURL(): string {
  return (test.info().project.use.baseURL as string) ?? "http://localhost:80";
}

async function openShare(context: BrowserContext, url: string): Promise<Page> {
  const anonymous = await context.newPage();
  await anonymous.goto(url);
  return anonymous;
}

async function createShare(
  page: Page,
  scope: "Entire project" | "Single test" | "Single run",
  options: { testName?: string; passphrase?: string } = {},
): Promise<string> {
  await page.getByTestId(TEST_ID.shareScope).click();
  await page.getByRole("option", { name: scope }).click();
  if (options.testName) {
    await page.getByTestId(TEST_ID.shareTestName).fill(options.testName);
  }
  if (options.passphrase) {
    await page
      .getByTestId(TEST_ID.shareCreatePassphrase)
      .fill(options.passphrase);
  }
  await page.getByTestId(TEST_ID.shareCreateSubmit).click();
  await expect(page.getByTestId(TEST_ID.toaster)).toContainText(
    "Share link created",
    { timeout: 10000 },
  );
  const created = page.getByTestId(TEST_ID.shareCreatedUrl);
  await expect(created).toBeVisible({ timeout: 10000 });
  const text = (await created.textContent()) ?? "";
  const token = /\/share\/([^/?#]+)/.exec(text)?.[1];
  if (!token) throw new Error(`Could not parse the share URL: ${text}`);
  return `${baseURL()}/share/${token}`;
}

test.describe.configure({ timeout: 90_000 });

test.describe("Share links", () => {
  test.beforeEach(async () => {
    projectName = `e2e-share-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await setupReviewableTest(projectName, TEST_NAME);
  });

  test.afterEach(async () => {
    await deleteProject(projectName);
  });

  test("shares a single test behind a passphrase and revokes it", async ({
    page,
    browser,
  }) => {
    await page.goto(`/projects/${encodeURIComponent(projectName)}`);
    await page.getByTestId(TEST_ID.shareAction).click();
    await expect(page.getByTestId(TEST_ID.shareDialog)).toBeVisible();

    const shareUrl = await createShare(page, "Single test", {
      testName: TEST_NAME,
      passphrase: "let-me-in",
    });
    const linkRow = page
      .getByTestId(TEST_ID.shareLinkRow)
      .filter({ hasText: TEST_NAME });
    await expect(linkRow).toBeVisible({ timeout: 10000 });
    await expect(linkRow).toContainText("Passphrase");

    const context = await browser.newContext();
    try {
      const anonymous = await openShare(context, shareUrl);
      await expect(anonymous.getByTestId(TEST_ID.sharePassphrase)).toBeVisible({
        timeout: 10000,
      });

      await anonymous.getByTestId(TEST_ID.sharePassphrase).fill("wrong");
      await anonymous.getByTestId(TEST_ID.sharePassphraseSubmit).click();
      await expect(anonymous.getByRole("alert")).toContainText("not correct", {
        timeout: 10000,
      });

      await anonymous.getByTestId(TEST_ID.sharePassphrase).fill("let-me-in");
      await anonymous.getByTestId(TEST_ID.sharePassphraseSubmit).click();
      const summary = anonymous.getByTestId(TEST_ID.shareTestSummary);
      await expect(summary).toBeVisible({ timeout: 10000 });
      await expect(summary).toContainText(TEST_NAME);
    } finally {
      await context.close();
    }

    await linkRow.getByTestId(TEST_ID.shareRevoke).click();
    await page.getByTestId(TEST_ID.dialogConfirm).click();
    await expect(page.getByTestId(TEST_ID.toaster)).toContainText(
      "Share link revoked",
      { timeout: 10000 },
    );

    const context2 = await browser.newContext();
    try {
      const anonymous = await openShare(context2, shareUrl);
      await expect(anonymous.getByTestId(TEST_ID.shareError)).toContainText(
        "not available",
        { timeout: 10000 },
      );
    } finally {
      await context2.close();
    }
  });

  test("shares the whole project without a passphrase", async ({
    page,
    browser,
  }) => {
    await page.goto(`/projects/${encodeURIComponent(projectName)}`);
    await page.getByTestId(TEST_ID.shareAction).click();
    const shareUrl = await createShare(page, "Entire project");

    const context = await browser.newContext();
    try {
      const anonymous = await openShare(context, shareUrl);
      const tests = anonymous.getByTestId(TEST_ID.shareProjectTests);
      await expect(tests).toBeVisible({ timeout: 10000 });
      await expect(tests).toContainText(TEST_NAME);
      await expect(anonymous.getByTestId(TEST_ID.sharePassphrase)).toHaveCount(
        0,
      );
    } finally {
      await context.close();
    }
  });
});

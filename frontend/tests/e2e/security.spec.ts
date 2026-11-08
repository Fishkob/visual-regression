import { expect, test } from "@playwright/test";
import { TEST_ID } from "@/lib/test-ids";
import { confirmDialog, expectToast } from "./fixtures/ui";
import { loginAsAdmin } from "./fixtures/auth";

function baseURL(): string {
  return (test.info().project.use.baseURL as string) ?? "http://localhost:80";
}

test.describe("Account security", () => {
  test("lists sessions and revokes another session", async ({
    page,
    browser,
  }) => {
    const secondContext = await browser.newContext({ baseURL: baseURL() });
    const secondPage = await secondContext.newPage();
    await loginAsAdmin(secondPage);
    await expect(secondPage).toHaveURL((url) => url.pathname === "/");

    try {
      await page.goto("/settings/security");
      await expect(page.getByTestId(TEST_ID.securityView)).toBeVisible();
      const rows = page.getByTestId(TEST_ID.sessionRow);
      await expect(rows.first()).toBeVisible();
      // Sessions accumulate across runs (every login creates one), so assert
      // the delta rather than an absolute count.
      const before = await rows.count();
      expect(before).toBeGreaterThan(1);
      await expect(page.getByTestId(TEST_ID.sessionCurrent)).toHaveCount(1);

      const revoke = page.getByTestId(TEST_ID.sessionRevoke);
      await expect(revoke.first()).toBeVisible();
      await revoke.first().click();
      await confirmDialog(page);
      await expectToast(page, "Session revoked");
      await expect(rows).toHaveCount(before - 1);
      await expect(page.getByTestId(TEST_ID.sessionCurrent)).toHaveCount(1);
      if (before - 1 === 1) {
        await expect(
          page.getByTestId(TEST_ID.sessionsRevokeAll),
        ).toBeDisabled();
      }
    } finally {
      await secondContext.close();
    }
  });
});

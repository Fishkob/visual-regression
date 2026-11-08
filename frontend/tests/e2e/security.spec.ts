import { expect, test, type Browser, type Page } from "@playwright/test";
import { totp } from "./fixtures/totp";
import { TEST_ID } from "@/lib/test-ids";
import { confirmDialog, expectToast } from "./fixtures/ui";
import { loginAs, loginAsAdmin } from "./fixtures/auth";

const PASSWORD = "user-pass-123";

function unique(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function baseURL(): string {
  return (test.info().project.use.baseURL as string) ?? "http://localhost:80";
}

async function createUserAndSignIn(
  browser: Browser,
  adminPage: Page,
  username: string,
): Promise<{
  context: Awaited<ReturnType<Browser["newContext"]>>;
  page: Page;
}> {
  await adminPage.goto("/users");
  await adminPage.getByTestId(TEST_ID.userCreate).click();
  await adminPage.getByTestId(TEST_ID.createUserUsername).fill(username);
  await adminPage.getByTestId(TEST_ID.createUserSubmit).click();
  await expect(
    adminPage.getByTestId(TEST_ID.temporaryPasswordDialog),
  ).toBeVisible();
  const temporary = (
    (await adminPage
      .getByTestId(TEST_ID.temporaryPasswordValue)
      .textContent()) ?? ""
  ).trim();
  await adminPage
    .getByTestId(TEST_ID.temporaryPasswordDone)
    .click({ force: true });

  const context = await browser.newContext({ baseURL: baseURL() });
  const page = await context.newPage();
  await loginAs(page, username, temporary);
  await expect(page.getByTestId(TEST_ID.changePasswordView)).toBeVisible();
  await page.getByTestId(TEST_ID.changePasswordCurrent).fill(temporary);
  await page.getByTestId(TEST_ID.changePasswordNew).fill(PASSWORD);
  await page.getByTestId(TEST_ID.changePasswordConfirm).fill(PASSWORD);
  await page.getByTestId(TEST_ID.changePasswordSubmit).click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
  return { context, page };
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

  test("enables two-factor auth, challenges the login and disables it", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const username = unique("e2e-2fa");
    const adminContext = await browser.newContext({ baseURL: baseURL() });
    const adminPage = await adminContext.newPage();
    // A dedicated account: enabling 2FA on the shared admin would lock the
    // suite's storage state out of the next run.
    const { context, page: userPage } = await createUserAndSignIn(
      browser,
      adminPage,
      username,
    );

    try {
      await userPage.goto("/settings/security");
      await expect(userPage.getByTestId(TEST_ID.twoFactorEnable)).toBeVisible();
      await userPage.getByTestId(TEST_ID.twoFactorEnable).click();
      const secret = (
        (await userPage.getByTestId(TEST_ID.twoFactorSecret).textContent()) ??
        ""
      ).trim();
      expect(secret.length).toBeGreaterThan(10);

      await userPage.getByTestId(TEST_ID.twoFactorCode).fill(totp(secret));
      await userPage.getByTestId(TEST_ID.twoFactorConfirm).click();
      await expectToast(userPage, "Two-factor authentication enabled");
      await expect(userPage.getByTestId(TEST_ID.recoveryCodes)).toBeVisible();
      const codes = userPage.getByTestId(TEST_ID.recoveryCodes);
      await expect(codes).toContainText("-");
      await userPage
        .getByTestId(TEST_ID.recoveryCodesDone)
        .click({ force: true });
      await expect(
        userPage.getByTestId(TEST_ID.twoFactorDisable),
      ).toBeVisible();

      // A password login now stops at the second factor.
      await userPage.getByTestId(TEST_ID.logout).click();
      await expect(userPage).toHaveURL(/\/login/);
      await loginAs(userPage, username, PASSWORD);
      await expect(
        userPage.getByTestId(TEST_ID.loginTwoFactorCode),
      ).toBeVisible();
      await userPage.getByTestId(TEST_ID.loginTwoFactorCode).fill(totp(secret));
      await userPage.getByTestId(TEST_ID.loginTwoFactorSubmit).click();
      await expect(userPage).toHaveURL((url) => url.pathname === "/");

      // Disabling requires the password and restores password-only login.
      await userPage.goto("/settings/security");
      await userPage.getByTestId(TEST_ID.twoFactorDisable).click();
      await userPage.getByTestId(TEST_ID.twoFactorPassword).fill(PASSWORD);
      await userPage.getByTestId(TEST_ID.twoFactorDisableSubmit).click();
      await expectToast(userPage, "Two-factor authentication disabled");
      await expect(userPage.getByTestId(TEST_ID.twoFactorEnable)).toBeVisible();

      await userPage.getByTestId(TEST_ID.logout).click();
      await expect(userPage).toHaveURL(/\/login/);
      await loginAs(userPage, username, PASSWORD);
      await expect(userPage).toHaveURL((url) => url.pathname === "/");
      await expect(
        userPage.getByTestId(TEST_ID.loginTwoFactorCode),
      ).toHaveCount(0);
    } finally {
      await context.close();
      await adminContext.close();
    }
  });
});

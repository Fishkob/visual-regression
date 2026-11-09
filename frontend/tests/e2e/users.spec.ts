import { expect, test, type Browser, type Page } from "@playwright/test";
import { createProject, deleteProject } from "./fixtures/api";
import { TEST_ID } from "@/lib/test-ids";
import { byText, confirmDialog, expectToast } from "./fixtures/ui";
import { loginAs } from "./fixtures/auth";

const PASSWORD = "user-pass-123";

function unique(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function baseURL(): string {
  return (test.info().project.use.baseURL as string) ?? "http://localhost:80";
}

// The create answer carries the one-time link, never the password (ADR-075).
async function readInviteLink(page: Page): Promise<string> {
  await expect(page.getByTestId(TEST_ID.inviteLinkDialog)).toBeVisible();
  const link = (
    (await page.getByTestId(TEST_ID.inviteLinkUrl).textContent()) ?? ""
  ).trim();
  await page.getByTestId(TEST_ID.inviteLinkDone).click({ force: true });
  return link;
}

async function createUser(
  page: Page,
  username: string,
  role: "ADMIN" | "MEMBER" | "VIEWER" = "MEMBER",
): Promise<string> {
  await page.getByTestId(TEST_ID.userCreate).click();
  await page.getByTestId(TEST_ID.createUserUsername).fill(username);
  if (role !== "MEMBER") {
    await page.getByTestId(TEST_ID.createUserRole).click();
    await page.getByRole("option", { name: role }).click();
  }
  await page.getByTestId(TEST_ID.createUserSubmit).click();
  await expectToast(page, "User created");
  return readInviteLink(page);
}

// Opens the link the way the invited person does: a fresh context with no
// session, then the one reveal it allows.
async function revealInvite(browser: Browser, link: string): Promise<string> {
  const context = await browser.newContext({ baseURL: baseURL() });
  const page = await context.newPage();
  try {
    await page.goto(link);
    await page.getByTestId(TEST_ID.inviteReveal).click();
    const password = (
      (await page.getByTestId(TEST_ID.invitePassword).textContent()) ?? ""
    ).trim();
    expect(password.length).toBeGreaterThan(8);
    return password;
  } finally {
    await context.close();
  }
}

// The platform deactivates accounts instead of deleting them (ADR-031), so a
// long-lived dev database keeps the row; this at least leaves no active
// leftover account behind. Best effort: a failed cleanup must not turn a green
// test red.
async function deactivateUser(page: Page, username: string): Promise<void> {
  const response = await page.request.get("/api/v1/users");
  if (!response.ok()) return;
  const users = (await response.json()) as Array<{
    id: string;
    username: string;
  }>;
  const user = users.find((entry) => entry.username === username);
  if (!user) return;
  await page.request.patch(`/api/v1/users/${user.id}`, {
    data: { isActive: false },
  });
}

test.describe("User administration", () => {
  let username: string;

  test.beforeEach(() => {
    username = unique("e2e-user");
  });

  test.afterEach(async ({ page }) => {
    await deactivateUser(page, username);
  });

  test("creates, resets, deactivates and reactivates a user", async ({
    browser,
    page,
  }) => {
    await page.goto("/users");
    const firstLink = await createUser(page, username, "MEMBER");
    const temporaryPassword = await revealInvite(browser, firstLink);

    // The link is spent: a second reveal reports the state instead of the
    // password.
    const spent = await browser.newContext({ baseURL: baseURL() });
    const spentPage = await spent.newPage();
    try {
      await spentPage.goto(firstLink);
      await expect(spentPage.getByTestId(TEST_ID.inviteReveal)).toHaveCount(0);
      await expect(spentPage.getByTestId(TEST_ID.inviteStatus)).toContainText(
        "already been used",
      );
    } finally {
      await spent.close();
    }

    const row = byText(page, TEST_ID.userRow, username);
    await expect(row).toBeVisible();
    await expect(row.getByTestId(TEST_ID.userRole)).toContainText("MEMBER");
    await expect(row.getByTestId(TEST_ID.userActive)).toContainText("Active");

    await row.getByTestId(TEST_ID.userActions).click();
    await page.getByTestId(TEST_ID.userReset).click();
    await confirmDialog(page);
    await expectToast(page, "Temporary password issued");
    const secondLink = await readInviteLink(page);
    expect(secondLink).not.toBe(firstLink);
    const resetPassword = await revealInvite(browser, secondLink);
    expect(resetPassword).not.toBe(temporaryPassword);

    await row.getByTestId(TEST_ID.userActions).click();
    await page.getByTestId(TEST_ID.userDeactivate).click();
    await confirmDialog(page);
    await expectToast(page, "User deactivated");
    await expect(row.getByTestId(TEST_ID.userActive)).toContainText("Inactive");

    await row.getByTestId(TEST_ID.userActions).click();
    await page.getByTestId(TEST_ID.userDeactivate).click();
    await confirmDialog(page);
    await expectToast(page, "User reactivated");
    await expect(row.getByTestId(TEST_ID.userActive)).toContainText("Active");
  });

  test("a new viewer must change the temporary password and cannot reach admin pages", async ({
    browser,
  }) => {
    const adminContext = await browser.newContext({ baseURL: baseURL() });
    const adminPage = await adminContext.newPage();
    const projectName = unique("e2e-viewer-project");
    await createProject(projectName);

    try {
      await adminPage.goto("/users");
      const inviteLink = await createUser(adminPage, username, "VIEWER");
      const temporaryPassword = await revealInvite(browser, inviteLink);

      // The storage state is deliberately not reused: this is a brand-new
      // person signing in for the first time.
      const context = await browser.newContext({ baseURL: baseURL() });
      const page = await context.newPage();
      try {
        await loginAs(page, username, temporaryPassword);

        // A temporary password only unlocks the password-change screen.
        await expect(page).toHaveURL(/\/change-password/);
        await expect(
          page.getByTestId(TEST_ID.changePasswordView),
        ).toBeVisible();

        await page
          .getByTestId(TEST_ID.changePasswordCurrent)
          .fill(temporaryPassword);
        await page.getByTestId(TEST_ID.changePasswordNew).fill(PASSWORD);
        await page.getByTestId(TEST_ID.changePasswordConfirm).fill(PASSWORD);
        await page.getByTestId(TEST_ID.changePasswordSubmit).click();

        await expectToast(page, "Password changed");
        await expect(page).toHaveURL((url) => url.pathname === "/");
        await expect(page.getByTestId(TEST_ID.currentUser)).toContainText(
          username,
        );
        await expect(page.getByTestId(TEST_ID.currentUserRole)).toContainText(
          "VIEWER",
        );

        // Admin navigation and routes are gone for a VIEWER.
        await expect(page.getByTestId(TEST_ID.usersNavLink)).toHaveCount(0);
        await expect(page.getByTestId(TEST_ID.navApiKeys)).toHaveCount(0);
        await expect(page.getByTestId(TEST_ID.auditNavLink)).toHaveCount(0);

        await page.goto("/users");
        await expect(page.getByTestId(TEST_ID.forbiddenView)).toBeVisible();
        await page.goto("/api-keys");
        await expect(page.getByTestId(TEST_ID.forbiddenView)).toBeVisible();

        // Read access stays: the project page opens, but without admin-only or
        // write actions.
        await page.goto(`/projects/${encodeURIComponent(projectName)}`);
        await expect(page.getByTestId(TEST_ID.projectTitle)).toContainText(
          projectName,
        );
        await expect(page.getByTestId(TEST_ID.webhooksLink)).toHaveCount(0);
        await expect(page.getByTestId(TEST_ID.shareAction)).toHaveCount(0);

        // The settings page is readable, but every edit surface in it is
        // admin-only.
        await page.goto(
          `/projects/${encodeURIComponent(projectName)}/settings`,
        );
        await expect(
          page.getByTestId(TEST_ID.projectSettingsView),
        ).toBeVisible();
        await expect(page.getByTestId(TEST_ID.storagePanel)).toBeVisible();
        await expect(
          page.getByTestId(TEST_ID.thresholdSettingsAction),
        ).toHaveCount(0);
        await expect(page.getByTestId(TEST_ID.storageEditAction)).toHaveCount(
          0,
        );
        // Endpoint administration is ADMIN-only in the API, so the section is
        // absent rather than present-but-failing.
        await expect(
          page.getByTestId(TEST_ID.projectSettingsWebhooks),
        ).toHaveCount(0);
      } finally {
        await context.close();
      }
    } finally {
      await deleteProject(projectName);
      await adminContext.close();
    }
  });
});

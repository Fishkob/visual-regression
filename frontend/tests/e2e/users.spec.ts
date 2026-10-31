import { expect, test, type Page } from "@playwright/test";
import { createProject, deleteProject } from "./fixtures/api";
import { TEST_ID } from "@/lib/test-ids";

const PASSWORD = "user-pass-123";

function unique(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function baseURL(): string {
  return (test.info().project.use.baseURL as string) ?? "http://localhost:80";
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
  await expect(page.getByTestId(TEST_ID.toaster)).toContainText(
    "User created",
    { timeout: 10000 },
  );
  await expect(page.getByTestId(TEST_ID.temporaryPasswordDialog)).toBeVisible({
    timeout: 10000,
  });
  const password = (
    (await page.getByTestId(TEST_ID.temporaryPasswordValue).textContent()) ?? ""
  ).trim();
  await page.getByTestId(TEST_ID.temporaryPasswordDone).click({ force: true });
  return password;
}

test.describe("User administration", () => {
  let username: string;

  test.beforeEach(() => {
    username = unique("e2e-user");
  });

  test("creates, resets, deactivates and reactivates a user", async ({
    page,
  }) => {
    await page.goto("/users");
    const temporaryPassword = await createUser(page, username, "MEMBER");
    expect(temporaryPassword.length).toBeGreaterThan(8);

    const row = page.getByTestId(TEST_ID.userRow).filter({ hasText: username });
    await expect(row).toBeVisible({ timeout: 10000 });
    await expect(row.getByTestId(TEST_ID.userRole)).toContainText("MEMBER");
    await expect(row.getByTestId(TEST_ID.userActive)).toContainText("Active");

    await row.getByTestId(TEST_ID.userActions).click();
    await page.getByTestId(TEST_ID.userReset).click();
    await page.getByTestId(TEST_ID.dialogConfirm).click();
    await expect(page.getByTestId(TEST_ID.toaster)).toContainText(
      "Temporary password issued",
      { timeout: 10000 },
    );
    await expect(
      page.getByTestId(TEST_ID.temporaryPasswordDialog),
    ).toBeVisible();
    const resetPassword = (
      (await page.getByTestId(TEST_ID.temporaryPasswordValue).textContent()) ??
      ""
    ).trim();
    expect(resetPassword).not.toBe(temporaryPassword);
    await page
      .getByTestId(TEST_ID.temporaryPasswordDone)
      .click({ force: true });

    await row.getByTestId(TEST_ID.userActions).click();
    await page.getByTestId(TEST_ID.userDeactivate).click();
    await page.getByTestId(TEST_ID.dialogConfirm).click();
    await expect(page.getByTestId(TEST_ID.toaster)).toContainText(
      "User deactivated",
      { timeout: 10000 },
    );
    await expect(row.getByTestId(TEST_ID.userActive)).toContainText("Inactive");

    await row.getByTestId(TEST_ID.userActions).click();
    await page.getByTestId(TEST_ID.userDeactivate).click();
    await page.getByTestId(TEST_ID.dialogConfirm).click();
    await expect(page.getByTestId(TEST_ID.toaster)).toContainText(
      "User reactivated",
      { timeout: 10000 },
    );
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
      const temporaryPassword = await createUser(adminPage, username, "VIEWER");

      // The storage state is deliberately not reused: this is a brand-new
      // person signing in for the first time.
      const context = await browser.newContext({ baseURL: baseURL() });
      const page = await context.newPage();
      try {
        await page.goto("/login");
        await page.getByTestId(TEST_ID.loginUsername).fill(username);
        await page.getByTestId(TEST_ID.loginPassword).fill(temporaryPassword);
        await page.getByTestId(TEST_ID.loginSubmit).click();

        // A temporary password only unlocks the password-change screen.
        await expect(page).toHaveURL(/\/change-password/, {
          timeout: 10000,
        });
        await expect(
          page.getByTestId(TEST_ID.changePasswordView),
        ).toBeVisible();

        await page
          .getByTestId(TEST_ID.changePasswordCurrent)
          .fill(temporaryPassword);
        await page.getByTestId(TEST_ID.changePasswordNew).fill(PASSWORD);
        await page.getByTestId(TEST_ID.changePasswordConfirm).fill(PASSWORD);
        await page.getByTestId(TEST_ID.changePasswordSubmit).click();

        await expect(page.getByTestId(TEST_ID.toaster)).toContainText(
          "Password changed",
          { timeout: 10000 },
        );
        await expect(page).toHaveURL((url) => url.pathname === "/", {
          timeout: 10000,
        });
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
        await expect(page.getByTestId(TEST_ID.forbiddenView)).toBeVisible({
          timeout: 10000,
        });
        await page.goto("/api-keys");
        await expect(page.getByTestId(TEST_ID.forbiddenView)).toBeVisible({
          timeout: 10000,
        });

        // Read access stays: the project page opens, but without admin-only or
        // write actions.
        await page.goto(`/projects/${encodeURIComponent(projectName)}`);
        await expect(page.getByTestId(TEST_ID.projectTitle)).toContainText(
          projectName,
          { timeout: 10000 },
        );
        await expect(page.getByTestId(TEST_ID.webhooksLink)).toHaveCount(0);
        await expect(page.getByTestId(TEST_ID.shareAction)).toHaveCount(0);

        // The settings page is readable, but every edit surface in it is
        // admin-only.
        await page.goto(
          `/projects/${encodeURIComponent(projectName)}/settings`,
        );
        await expect(page.getByTestId(TEST_ID.projectSettingsView)).toBeVisible(
          { timeout: 10000 },
        );
        await expect(page.getByTestId(TEST_ID.storagePanel)).toBeVisible();
        await expect(
          page.getByTestId(TEST_ID.reviewSettingsAction),
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

import { expect, test } from "@playwright/test";
import { createProject, deleteProject } from "./fixtures/api";
import { TEST_ID } from "@/lib/test-ids";
import { byText } from "./fixtures/ui";
import { loginAsAdmin } from "./fixtures/auth";

let projectName: string;

test.describe("Search, theme and locale", () => {
  test.beforeEach(async () => {
    projectName = `e2e-shell-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await createProject(projectName);
  });

  test.afterEach(async () => {
    await deleteProject(projectName);
  });

  test("finds a project in the global search palette", async ({ page }) => {
    await page.goto("/projects");
    await expect(page.getByTestId(TEST_ID.projectSearch)).toBeVisible();

    // Ctrl+K is the documented shortcut; the header button opens the same
    // dialog.
    await page.keyboard.press("Control+k");
    await expect(page.getByTestId(TEST_ID.globalSearchDialog)).toBeVisible();
    await page.getByTestId(TEST_ID.globalSearchInput).fill(projectName);

    const result = byText(page, TEST_ID.globalSearchResult, projectName);
    await expect(result.first()).toBeVisible();
    await result.first().click();

    await expect(page.getByTestId(TEST_ID.globalSearchDialog)).toHaveCount(0);
    await expect(page.getByTestId(TEST_ID.projectTitle)).toContainText(
      projectName,
    );

    // A query without matches shows the empty state instead of the old list.
    await page.keyboard.press("Control+k");
    await page
      .getByTestId(TEST_ID.globalSearchInput)
      .fill("no-such-project-e2e");
    await expect(page.getByTestId(TEST_ID.globalSearchEmpty)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId(TEST_ID.globalSearchDialog)).toHaveCount(0);
  });

  test("toggles the theme and remembers it across a reload", async ({
    page,
  }) => {
    await page.goto("/projects");
    const html = page.locator("html");
    await expect(html).not.toHaveClass(/dark/);

    await page.getByTestId(TEST_ID.themeToggle).click();
    await expect(html).toHaveClass(/dark/);

    await page.reload();
    await expect(html).toHaveClass(/dark/);

    await page.getByTestId(TEST_ID.themeToggle).click();
    await expect(html).not.toHaveClass(/dark/);
  });

  test("switches the UI language and re-renders the current page", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Review inbox",
    );

    await page.getByTestId(TEST_ID.localeSwitcher).selectOption("de");
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Posteingang",
    );
    await expect(page.getByTestId(TEST_ID.navProjects)).toContainText(
      "Projekte",
    );

    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Posteingang",
    );

    await page.getByTestId(TEST_ID.localeSwitcher).selectOption("en");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Review inbox",
    );
  });

  test("logs out and rejects the protected route afterwards", async ({
    browser,
  }) => {
    // A dedicated session: the suite's shared storage state must survive this
    // test, so the logout happens in its own context.
    const base =
      (test.info().project.use.baseURL as string) ?? "http://localhost:80";
    const context = await browser.newContext({ baseURL: base });
    const page = await context.newPage();
    try {
      await loginAsAdmin(page);
      await expect(page).toHaveURL((url) => url.pathname === "/");

      await page.getByTestId(TEST_ID.logout).click();
      await expect(page).toHaveURL(/\/login/);

      await page.goto("/projects");
      await expect(page).toHaveURL(/\/login/);
      await expect(page.getByTestId(TEST_ID.loginUsername)).toBeVisible();
    } finally {
      await context.close();
    }
  });
});

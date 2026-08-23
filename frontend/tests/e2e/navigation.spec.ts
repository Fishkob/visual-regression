import { test, expect } from "@playwright/test";
import { createProject, setupBaselines, deleteProject } from "./fixtures/api";
import { TEST_ID } from "@/lib/test-ids";

let projectName: string;

test.beforeEach(async () => {
  projectName = `e2e-project-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await createProject(projectName);
  await setupBaselines(projectName, "login-form");
});

test.afterEach(async () => {
  await deleteProject(projectName);
});

test.describe("Project List", () => {
  test("loads and displays projects", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Projects",
    );
  });

  test("can navigate to project detail", async ({ page }) => {
    await page.goto("/");

    await page
      .getByTestId(TEST_ID.tableRow)
      .filter({ hasText: projectName })
      .click();

    await page.waitForURL(/\/projects\//);

    await expect(page.getByRole("heading", { level: 2 })).toContainText(
      projectName,
      {
        timeout: 10000,
      },
    );
  });
});

test.describe("Navigation", () => {
  test("shows 404 for unknown route", async ({ page }) => {
    await page.goto("/nonexistent-route");

    await expect(page.getByRole("heading", { level: 1 })).toContainText("404");
  });
});

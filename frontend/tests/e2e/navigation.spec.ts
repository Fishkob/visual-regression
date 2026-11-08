import { test, expect } from "@playwright/test";
import { createProject, setupBaselines, deleteProject } from "./fixtures/api";
import { TEST_ID } from "@/lib/test-ids";
import { byText } from "./fixtures/ui";

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
    await page.goto("/projects");

    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Projects",
    );
  });

  test("can navigate to project detail", async ({ page }) => {
    await page.goto("/projects");

    await byText(page, TEST_ID.tableRow, projectName).click();

    await page.waitForURL(/\/projects\//);

    await expect(page.getByTestId(TEST_ID.projectTitle)).toContainText(
      projectName,
    );
  });
});

test.describe("Navigation", () => {
  test("lands on the review inbox", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Review inbox",
    );
  });

  test("shows 404 for unknown route", async ({ page }) => {
    await page.goto("/nonexistent-route");

    await expect(page.getByRole("heading", { level: 1 })).toContainText("404");
  });
});

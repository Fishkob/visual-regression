import { test, expect } from "@playwright/test";
import { mockApi } from "./routes/api.routes";
import {
  PROJECTS_PENDING_EMPTY_RESPONSE,
  PROJECTS_PENDING_RESPONSE,
} from "./mocks/projects.mocks";

test.describe("ProjectList", () => {
  test("shows projects", async ({ mount, page }) => {
    await mockApi(page, [
      ["**/api/v1/projects/pending*", PROJECTS_PENDING_RESPONSE],
    ]);

    const component = await mount("views/ProjectsView/Projects");
    await expect(component).toContainText("checkout-ui");
    await expect(component).toContainText("dashboard-ui");
    await expect(component).toContainText("admin-ui");
  });

  test("filters by search", async ({ mount, page }) => {
    await mockApi(page, [
      ["**/api/v1/projects/pending*", PROJECTS_PENDING_RESPONSE],
    ]);

    const component = await mount("views/ProjectsView/Projects");

    await component.getByTestId("project-search").fill("dash");
    const rows = component.getByTestId("table-row");

    await expect(rows).toHaveCount(1);
    await expect(rows.nth(0)).toContainText("dashboard-ui");
  });

  test("shows the empty state when there are no projects", async ({
    mount,
    page,
  }) => {
    await mockApi(page, [
      ["**/api/v1/projects/pending*", PROJECTS_PENDING_EMPTY_RESPONSE],
    ]);

    const component = await mount("views/ProjectsView/Projects");

    await expect(component).toContainText("No projects found");
  });
});

import { test, expect, type Page } from "@playwright/test";
import { mockApi } from "./routes/api.routes";
import {
  PROJECTS_PENDING_EMPTY_RESPONSE,
  PROJECTS_PENDING_RESPONSE,
} from "./mocks/projects.mocks";
import { TEST_ID } from "@/lib/test-ids";

// The project list filters on the server now, so the CT mock must answer the
// query it receives instead of returning a fixed page.
async function mockFilteredProjects(page: Page) {
  const body = JSON.parse(PROJECTS_PENDING_RESPONSE.body) as {
    data: Array<{ name: string; groupId: string | null }>;
  };

  await page.route("**/api/v1/projects/pending*", async (route) => {
    const url = new URL(route.request().url());
    const search = url.searchParams.get("q")?.toLowerCase() ?? "";
    const groupId = url.searchParams.get("groupId");
    const data = body.data.filter((project) => {
      const matchesSearch =
        search === "" || project.name.toLowerCase().includes(search);
      const matchesGroup =
        !groupId ||
        (groupId === "unassigned"
          ? project.groupId === null
          : project.groupId === groupId);
      return matchesSearch && matchesGroup;
    });

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data, meta: { total: data.length } }),
    });
  });
}

test.describe("ProjectList", () => {
  test("shows projects", async ({ mount, page }) => {
    await mockApi(page, [
      ["**/api/v1/projects/pending*", PROJECTS_PENDING_RESPONSE],
    ]);

    const component = await mount("views/ProjectsView/Projects");
    await expect(component).toContainText("checkout-ui");
    await expect(component).toContainText("dashboard-ui");
    await expect(component).toContainText("admin-ui");
    // Both blocks name the owning team: the section header is the axis the
    // project lives on (ADR-084).
    await expect(component).toContainText("Checkout");
    await expect(component).toContainText("Platform");
  });

  test("opens the new project dialog and preselects the first team", async ({
    mount,
    page,
  }) => {
    await mockApi(page, [
      ["**/api/v1/projects/pending*", PROJECTS_PENDING_RESPONSE],
    ]);

    const component = await mount("views/ProjectsView/Projects");
    await component.getByTestId(TEST_ID.newProject).click();

    await expect(page.getByTestId(TEST_ID.projectNameInput)).toBeVisible();
    await expect(page.getByTestId(TEST_ID.projectFormSubmit)).toBeDisabled();
    // A project always has an owner (ADR-083), and the dialog picks the first
    // team so the form is submittable without a second decision.
    await expect(page.getByTestId(TEST_ID.newProjectTeam)).toHaveText(
      "Storefront",
    );
    await expect(page.getByTestId(TEST_ID.newProjectNoTeam)).toHaveCount(0);

    await page.getByTestId(TEST_ID.projectNameInput).fill("new-project");
    await expect(page.getByTestId(TEST_ID.projectFormSubmit)).toBeEnabled();
  });

  // A member that belongs to no team cannot own a project, so the dialog says so
  // instead of sending a request the API answers with 409.
  test("explains a member without a team instead of a dead form", async ({
    mount,
    page,
  }) => {
    await page.route("**/api/v1/teams", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      }),
    );
    await mockApi(page, [
      ["**/api/v1/projects/pending*", PROJECTS_PENDING_RESPONSE],
      [
        "**/api/v1/teams",
        { status: 200, contentType: "application/json", body: "[]" },
      ],
    ]);

    const component = await mount("views/ProjectsView/Projects");
    await component.getByTestId(TEST_ID.newProject).click();

    await expect(page.getByTestId(TEST_ID.newProjectNoTeam)).toBeVisible();
    await page.getByTestId(TEST_ID.projectNameInput).fill("new-project");
    await expect(page.getByTestId(TEST_ID.projectFormSubmit)).toBeDisabled();
  });

  test("creates a project and navigates to it", async ({ mount, page }) => {
    await mockApi(page, [
      ["**/api/v1/projects/pending*", PROJECTS_PENDING_RESPONSE],
      [
        "**/api/v1/projects",
        {
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ id: "4", name: "new-project" }),
        },
      ],
    ]);

    const component = await mount("views/ProjectsView/Projects");
    await component.getByTestId(TEST_ID.newProject).click();
    await page.getByTestId(TEST_ID.projectNameInput).fill("new-project");
    const created = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/api/v1/projects",
    );
    await page.getByTestId(TEST_ID.projectFormSubmit).click();

    // The owner rides along: the API refuses a project without one.
    expect((await created).postDataJSON()).toMatchObject({
      name: "new-project",
      teamId: "team-storefront",
    });

    await page.waitForURL((url) => url.pathname === "/projects/new-project");
  });

  test("deletes a project from the row actions menu", async ({
    mount,
    page,
  }) => {
    let deleted = false;
    await page.route("**/api/v1/projects/pending*", async (route) => {
      const payload = JSON.parse(PROJECTS_PENDING_RESPONSE.body) as {
        data: Array<{ name: string }>;
      };
      if (deleted) {
        payload.data = payload.data.filter(
          (project) => project.name !== "checkout-ui",
        );
      }
      await route.fulfill({
        status: PROJECTS_PENDING_RESPONSE.status,
        contentType: PROJECTS_PENDING_RESPONSE.contentType,
        body: JSON.stringify(payload),
      });
    });
    await page.route("**/api/v1/projects/checkout-ui", async (route) => {
      if (route.request().method() !== "DELETE") {
        await route.fallback();
        return;
      }
      deleted = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    });
    await mockApi(page, []);

    const component = await mount("views/ProjectsView/Projects");

    await component.getByTestId(TEST_ID.projectActionsButton).first().click();
    await page.getByRole("menuitem").click();

    const deleteRequest = page.waitForRequest(
      (request) =>
        request.method() === "DELETE" &&
        new URL(request.url()).pathname === "/api/v1/projects/checkout-ui",
    );
    await page.getByTestId(TEST_ID.dialogConfirm).click();
    await deleteRequest;

    await expect(
      component
        .getByTestId(TEST_ID.tableRow)
        .filter({ hasText: "checkout-ui" }),
    ).toHaveCount(0);
  });

  test("shows a loading skeleton while projects load", async ({
    mount,
    page,
  }) => {
    await page.route("**/api/v1/projects/pending*", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 750));
      await route.fulfill(PROJECTS_PENDING_RESPONSE);
    });
    await mockApi(page, []);

    const component = await mount("views/ProjectsView/Projects");

    await expect(
      component.getByTestId(TEST_ID.skeletonRow).first(),
    ).toBeVisible();
    await expect(component.getByTestId(TEST_ID.tableRow)).toHaveCount(3);
  });

  test("filters by search", async ({ mount, page }) => {
    await mockApi(page, []);
    await mockFilteredProjects(page);

    const component = await mount("views/ProjectsView/Projects");

    await component.getByTestId(TEST_ID.projectSearch).fill("dash");
    const rows = component.getByTestId(TEST_ID.tableRow);

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

  test("opens the dialog from the empty-state action", async ({
    mount,
    page,
  }) => {
    await mockApi(page, [
      ["**/api/v1/projects/pending*", PROJECTS_PENDING_EMPTY_RESPONSE],
    ]);

    const component = await mount("views/ProjectsView/Projects");
    await component.getByTestId(TEST_ID.newProjectEmpty).click();

    await expect(page.getByTestId(TEST_ID.projectNameInput)).toBeVisible();
  });

  test("shows the no-match state without a create action", async ({
    mount,
    page,
  }) => {
    await mockApi(page, []);
    await mockFilteredProjects(page);

    const component = await mount("views/ProjectsView/Projects");
    await component.getByTestId(TEST_ID.projectSearch).fill("missing");

    await expect(component).toContainText("No projects match these filters");
    await expect(component).toContainText("Try a different search.");
    await expect(component.getByTestId(TEST_ID.newProjectEmpty)).toHaveCount(0);
  });

  test("shows an error with retry when loading fails", async ({
    mount,
    page,
  }) => {
    await mockApi(page, [
      [
        "**/api/v1/projects/pending*",
        { status: 500, contentType: "application/json", body: "{}" },
      ],
    ]);

    const component = await mount("views/ProjectsView/Projects");

    // The query retries with backoff before the error state surfaces, so allow
    // a generous wait (same as the project-detail error test).
    await expect(component.getByTestId(TEST_ID.retry)).toBeVisible({
      timeout: 15_000,
    });
    await expect(component).toContainText("Failed to load projects");
  });
});

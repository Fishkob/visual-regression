import { test, expect, type Page } from "@playwright/test";
import { mockApi } from "./routes/api.routes";
import {
  PROJECTS_PENDING_EMPTY_RESPONSE,
  PROJECTS_PENDING_RESPONSE,
} from "./mocks/projects.mocks";
import { GROUPS_RESPONSE } from "./mocks/groups.mocks";
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
      ["**/api/v1/groups", GROUPS_RESPONSE],
    ]);

    const component = await mount("views/ProjectsView/Projects");
    await expect(component).toContainText("checkout-ui");
    await expect(component).toContainText("dashboard-ui");
    await expect(component).toContainText("admin-ui");
    await expect(component).toContainText("Checkout");
    await expect(component).toContainText("Unassigned");
  });

  test("opens the new project dialog", async ({ mount, page }) => {
    await mockApi(page, [
      ["**/api/v1/projects/pending*", PROJECTS_PENDING_RESPONSE],
      ["**/api/v1/groups", GROUPS_RESPONSE],
    ]);

    const component = await mount("views/ProjectsView/Projects");
    await component.getByTestId(TEST_ID.newProject).click();

    await expect(page.getByTestId(TEST_ID.projectNameInput)).toBeVisible();
    await expect(page.getByTestId(TEST_ID.projectFormSubmit)).toBeDisabled();
    await page.getByTestId(TEST_ID.projectNameInput).fill("new-project");
    await expect(page.getByTestId(TEST_ID.projectFormSubmit)).toBeEnabled();
  });

  test("creates a project and navigates to it", async ({ mount, page }) => {
    await mockApi(page, [
      ["**/api/v1/projects/pending*", PROJECTS_PENDING_RESPONSE],
      ["**/api/v1/groups", GROUPS_RESPONSE],
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
    await page.getByTestId(TEST_ID.projectFormSubmit).click();

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
    await mockApi(page, [["**/api/v1/groups", GROUPS_RESPONSE]]);

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
    await mockApi(page, [["**/api/v1/groups", GROUPS_RESPONSE]]);

    const component = await mount("views/ProjectsView/Projects");

    await expect(
      component.getByTestId(TEST_ID.skeletonRow).first(),
    ).toBeVisible();
    await expect(component.getByTestId(TEST_ID.tableRow)).toHaveCount(3);
  });

  test("filters by group", async ({ mount, page }) => {
    await mockApi(page, [["**/api/v1/groups", GROUPS_RESPONSE]]);
    await mockFilteredProjects(page);

    const component = await mount("views/ProjectsView/Projects");

    await component.getByTestId(TEST_ID.filterGroup).click();
    await page.getByRole("option", { name: "Checkout" }).click();

    const rows = component.getByTestId(TEST_ID.tableRow);
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("checkout-ui");
    await expect(rows.nth(1)).toContainText("dashboard-ui");
    await expect(component).not.toContainText("admin-ui");
  });

  test("filters by search", async ({ mount, page }) => {
    await mockApi(page, [["**/api/v1/groups", GROUPS_RESPONSE]]);
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
      ["**/api/v1/groups", GROUPS_RESPONSE],
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
      ["**/api/v1/groups", GROUPS_RESPONSE],
    ]);

    const component = await mount("views/ProjectsView/Projects");
    await component.getByTestId(TEST_ID.newProjectEmpty).click();

    await expect(page.getByTestId(TEST_ID.projectNameInput)).toBeVisible();
  });

  test("shows the no-match state without a create action", async ({
    mount,
    page,
  }) => {
    await mockApi(page, [["**/api/v1/groups", GROUPS_RESPONSE]]);
    await mockFilteredProjects(page);

    const component = await mount("views/ProjectsView/Projects");
    await component.getByTestId(TEST_ID.projectSearch).fill("missing");

    await expect(component).toContainText("No projects match these filters");
    await expect(component).toContainText("Try a different search or group.");
    await expect(component.getByTestId(TEST_ID.newProjectEmpty)).toHaveCount(0);
  });

  test("creates a group inline from the new project dialog", async ({
    mount,
    page,
  }) => {
    let created = false;
    await mockApi(page, [
      ["**/api/v1/projects/pending*", PROJECTS_PENDING_RESPONSE],
    ]);
    await page.route("**/api/v1/groups", async (route) => {
      if (route.request().method() === "POST") {
        created = true;
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            id: "g3",
            name: "Payments",
            createdAt: "2026-10-22T10:00:00.000Z",
            projectCount: 0,
          }),
        });
        return;
      }
      const groups = JSON.parse(GROUPS_RESPONSE.body) as Array<{
        id: string;
        name: string;
        createdAt: string;
        projectCount: number;
      }>;
      if (created) {
        groups.push({
          id: "g3",
          name: "Payments",
          createdAt: "2026-10-22T10:00:00.000Z",
          projectCount: 0,
        });
      }
      await route.fulfill({
        status: GROUPS_RESPONSE.status,
        contentType: GROUPS_RESPONSE.contentType,
        body: JSON.stringify(groups),
      });
    });

    const component = await mount("views/ProjectsView/Projects");
    await component.getByTestId(TEST_ID.newProject).click();

    const createRequest = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/api/v1/groups",
    );
    await page.getByTestId(TEST_ID.projectNewGroupName).fill("Payments");
    await page.getByTestId(TEST_ID.projectAddGroup).click();
    await createRequest;

    await page.getByTestId(TEST_ID.projectGroupSelect).click();
    await expect(page.getByRole("option", { name: "Payments" })).toBeVisible();
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
      ["**/api/v1/groups", GROUPS_RESPONSE],
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

test.describe("ProjectList stale group link", () => {
  test.use({
    baseURL:
      "http://localhost:5173/playwright/gallery/index.html?group=missing",
  });

  test("resets an unknown group filter to all groups", async ({
    mount,
    page,
  }) => {
    await mockApi(page, [
      ["**/api/v1/projects/pending*", PROJECTS_PENDING_RESPONSE],
    ]);
    // Delay the groups response so the router's initial navigation settles
    // before the query resolves; the watch then validates against a real link.
    await page.route("**/api/v1/groups", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 250));
      await route.fulfill(GROUPS_RESPONSE);
    });

    const component = await mount("views/ProjectsView/Projects");

    await expect(component.getByTestId(TEST_ID.tableRow)).toHaveCount(3);
    await expect
      .poll(() => new URL(page.url()).searchParams.get("group"))
      .toBeNull();
  });
});

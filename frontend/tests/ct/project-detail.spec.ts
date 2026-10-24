import { test, expect } from "@playwright/test";
import { mockApi } from "./routes/api.routes";
import {
  BRANCHES_RESPONSE,
  PROJECT_CHECKOUT_UI_RESPONSE,
  PROJECT_EMPTY_RESPONSE,
} from "./mocks/projects.mocks";
import { GROUPS_RESPONSE } from "./mocks/groups.mocks";
import type { Routed } from "../../src/views/ProjectDetailView.story";
import { TEST_ID } from "@/lib/test-ids";

test.describe("ProjectDetail", () => {
  test("shows details", async ({ mount, page }) => {
    await mockApi(page, [
      ["**/api/v1/projects/checkout-ui", PROJECT_CHECKOUT_UI_RESPONSE],
      ["**/api/v1/groups", GROUPS_RESPONSE],
      ["**/api/v1/projects/*/branches*", BRANCHES_RESPONSE],
    ]);

    const component = await mount<typeof Routed>(
      "views/ProjectDetailView/Routed",
      { initialRoute: "/projects/checkout-ui" },
    );

    await expect(component).toContainText("checkout-ui");
    await expect(component.getByTestId(TEST_ID.tableRow)).toHaveCount(9);
  });

  test("shows the group, pending count, and test count", async ({
    mount,
    page,
  }) => {
    await mockApi(page, [
      ["**/api/v1/projects/checkout-ui", PROJECT_CHECKOUT_UI_RESPONSE],
      ["**/api/v1/groups", GROUPS_RESPONSE],
      ["**/api/v1/projects/*/branches*", BRANCHES_RESPONSE],
    ]);

    const component = await mount<typeof Routed>(
      "views/ProjectDetailView/Routed",
      { initialRoute: "/projects/checkout-ui" },
    );

    await expect(component.getByRole("heading", { level: 2 })).toHaveText(
      "checkout-ui",
    );
    await expect(component.getByTestId(TEST_ID.projectGroupBadge)).toHaveText(
      "Checkout",
    );
    await expect(
      component.getByTestId(TEST_ID.projectPendingCount),
    ).toContainText("1");
    await expect(component.getByTestId(TEST_ID.projectTestCount)).toContainText(
      "2",
    );
  });

  test("moves a project to unassigned", async ({ mount, page }) => {
    const unassignedProject = {
      ...(JSON.parse(PROJECT_CHECKOUT_UI_RESPONSE.body) as Record<
        string,
        unknown
      >),
      groupId: null,
      groupName: null,
    };

    await page.route("**/api/v1/projects/checkout-ui", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body:
          route.request().method() === "PATCH"
            ? JSON.stringify(unassignedProject)
            : PROJECT_CHECKOUT_UI_RESPONSE.body,
      });
    });
    await mockApi(page, [["**/api/v1/groups", GROUPS_RESPONSE]]);

    const component = await mount<typeof Routed>(
      "views/ProjectDetailView/Routed",
      { initialRoute: "/projects/checkout-ui" },
    );

    await component.getByTestId(TEST_ID.moveProject).click();
    await page.getByTestId(TEST_ID.moveProjectSelect).click();
    await page.getByRole("option", { name: "Unassigned" }).click();

    const moveRequest = page.waitForRequest(
      (request) =>
        request.method() === "PATCH" &&
        new URL(request.url()).pathname === "/api/v1/projects/checkout-ui",
    );
    await page.getByTestId(TEST_ID.moveProjectSubmit).click();

    expect((await moveRequest).postDataJSON()).toEqual({ groupId: null });
    await expect(page.getByTestId(TEST_ID.moveProjectSelect)).not.toBeVisible();
  });

  test("moves a project to the checkout group", async ({ mount, page }) => {
    const checkoutProject = {
      ...(JSON.parse(PROJECT_CHECKOUT_UI_RESPONSE.body) as Record<
        string,
        unknown
      >),
      groupId: "g1",
      groupName: "Checkout",
    };

    await page.route("**/api/v1/projects/checkout-ui", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body:
          route.request().method() === "PATCH"
            ? JSON.stringify(checkoutProject)
            : PROJECT_CHECKOUT_UI_RESPONSE.body,
      });
    });
    await mockApi(page, [["**/api/v1/groups", GROUPS_RESPONSE]]);

    const component = await mount<typeof Routed>(
      "views/ProjectDetailView/Routed",
      { initialRoute: "/projects/checkout-ui" },
    );

    await component.getByTestId(TEST_ID.moveProject).click();
    await page.getByTestId(TEST_ID.moveProjectSelect).click();
    await page.getByRole("option", { name: "Checkout" }).click();

    const moveRequest = page.waitForRequest(
      (request) =>
        request.method() === "PATCH" &&
        new URL(request.url()).pathname === "/api/v1/projects/checkout-ui",
    );
    await page.getByTestId(TEST_ID.moveProjectSubmit).click();

    expect((await moveRequest).postDataJSON()).toEqual({ groupId: "g1" });
    await expect(page.getByTestId(TEST_ID.moveProjectSelect)).not.toBeVisible();
  });

  test("filters by viewport and reset", async ({ mount, page }) => {
    await mockApi(page, [
      ["**/api/v1/projects/checkout-ui", PROJECT_CHECKOUT_UI_RESPONSE],
      ["**/api/v1/groups", GROUPS_RESPONSE],
      ["**/api/v1/projects/*/branches*", BRANCHES_RESPONSE],
    ]);

    const component = await mount<typeof Routed>(
      "views/ProjectDetailView/Routed",
      { initialRoute: "/projects/checkout-ui" },
    );

    await component.getByTestId(TEST_ID.filterViewport).click();
    await page.getByRole("option", { name: "1920x1080" }).click();

    await expect(component.getByTestId(TEST_ID.tableRow)).toHaveCount(5);

    await component.getByTestId(TEST_ID.resetFilter).click();
    await expect(component.getByTestId(TEST_ID.tableRow)).toHaveCount(9);
  });

  test("filters by search", async ({ mount, page }) => {
    await mockApi(page, [
      ["**/api/v1/projects/checkout-ui", PROJECT_CHECKOUT_UI_RESPONSE],
      ["**/api/v1/groups", GROUPS_RESPONSE],
      ["**/api/v1/projects/*/branches*", BRANCHES_RESPONSE],
    ]);

    const component = await mount<typeof Routed>(
      "views/ProjectDetailView/Routed",
      { initialRoute: "/projects/checkout-ui" },
    );

    await component.getByTestId(TEST_ID.testSearch).fill("checkout");
    await expect(component.getByTestId(TEST_ID.tableRow)).toHaveCount(6);
  });

  test("shows the empty state for a project without tests", async ({
    mount,
    page,
  }) => {
    await mockApi(page, [
      ["**/api/v1/projects/checkout-ui", PROJECT_EMPTY_RESPONSE],
      ["**/api/v1/groups", GROUPS_RESPONSE],
      ["**/api/v1/projects/*/branches*", BRANCHES_RESPONSE],
    ]);

    const component = await mount<typeof Routed>(
      "views/ProjectDetailView/Routed",
      { initialRoute: "/projects/checkout-ui" },
    );

    await expect(component).toContainText("No tests found");
  });

  test("shows an error with retry when loading fails", async ({
    mount,
    page,
  }) => {
    await mockApi(page, [
      [
        "**/api/v1/projects/checkout-ui",
        { status: 500, contentType: "application/json", body: "{}" },
      ],
      ["**/api/v1/groups", GROUPS_RESPONSE],
      ["**/api/v1/projects/*/branches*", BRANCHES_RESPONSE],
    ]);

    const component = await mount<typeof Routed>(
      "views/ProjectDetailView/Routed",
      { initialRoute: "/projects/checkout-ui" },
    );

    // The mapper throws on a missing payload, but the query retries with
    // backoff before the error state surfaces, so allow a generous wait.
    await expect(component.getByTestId(TEST_ID.retry)).toBeVisible({
      timeout: 15_000,
    });
    await expect(component).toContainText("Failed to load project");
  });
});

test.describe("ProjectDetail branch switcher", () => {
  test("lists the branches, marks the default and shows the effective target", async ({
    mount,
    page,
  }) => {
    // The project is read with `?branch=…` after a switch, so the mock must
    // match the query string too — and we assert the branch-scoped read really
    // happened, otherwise this test would pass on branch-list data alone.
    const branchReads: Array<string | null> = [];
    await mockApi(page, [
      ["**/api/v1/groups", GROUPS_RESPONSE],
      ["**/api/v1/projects/*/branches*", BRANCHES_RESPONSE],
    ]);
    await page.route("**/api/v1/projects/checkout-ui*", async (route) => {
      const requested = new URL(route.request().url());
      branchReads.push(requested.searchParams.get("branch"));
      await route.fulfill(PROJECT_CHECKOUT_UI_RESPONSE);
    });

    const component = await mount<typeof Routed>(
      "views/ProjectDetailView/Routed",
      { initialRoute: "/projects/checkout-ui" },
    );

    const switcher = component.getByTestId(TEST_ID.projectBranchSelect);
    await expect(switcher).toBeVisible();
    await expect(switcher).toContainText("main (default)");

    await switcher.click();
    await page
      .getByRole("option", { name: "feature/checkout-v2", exact: true })
      .click();

    // The switch re-keys the project read to the selected branch and its tests
    // render; the target label proves the branch identity too.
    await expect.poll(() => branchReads).toContain("feature/checkout-v2");
    await expect(component.getByTestId(TEST_ID.tableRow)).toHaveCount(9);
    await expect(
      component.getByTestId(TEST_ID.projectBranchTarget),
    ).toContainText("inherits from main");
  });

  test("blocks deleting a branch that others inherit from and says why", async ({
    mount,
    page,
  }) => {
    await mockApi(page, [
      // The deep link carries the branch, so the project read has a query.
      ["**/api/v1/projects/checkout-ui*", PROJECT_CHECKOUT_UI_RESPONSE],
      ["**/api/v1/groups", GROUPS_RESPONSE],
      ["**/api/v1/projects/*/branches*", BRANCHES_RESPONSE],
    ]);

    const component = await mount<typeof Routed>(
      "views/ProjectDetailView/Routed",
      { initialRoute: "/projects/checkout-ui?branch=feature%2Fcheckout-v2" },
    );

    await component.getByTestId(TEST_ID.branchActionsButton).click();

    // The dropdown renders in a portal, so it is queried from the page.
    await expect(page.getByTestId(TEST_ID.branchDeleteBlocked)).toContainText(
      "inherits from this branch",
    );
    await expect(page.getByTestId(TEST_ID.branchSetDefault)).toBeVisible();
    await expect(page.getByTestId(TEST_ID.branchChangeTarget)).toBeVisible();
  });
});

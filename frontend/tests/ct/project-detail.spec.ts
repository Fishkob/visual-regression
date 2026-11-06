import { test, expect } from "@playwright/test";
import { mockApi } from "./routes/api.routes";
import {
  BRANCHES_RESPONSE,
  PROJECT_CHECKOUT_UI_BRANCH_RESPONSE,
  PROJECT_CHECKOUT_UI_RESPONSE,
  PROJECT_EMPTY_RESPONSE,
} from "./mocks/projects.mocks";
import { GROUPS_RESPONSE } from "./mocks/groups.mocks";
import type { Routed } from "../../src/views/ProjectDetailView.story";
import { TEST_ID } from "@/lib/test-ids";

// The project overview filters and pages on the server now, so the CT mock must
// answer the query it receives (search, kind, status, variant, skip/take) and
// return the branch-wide filter options.
// The columns the mock filters on; the rest of the row passes through untouched.
type ProjectRow = {
  name: string;
  kind?: string;
  latestStatus?: string;
  variant?: { viewport?: string; browser?: string; environment?: string };
};

async function mockProjectFilters(page: import("@playwright/test").Page) {
  const body = JSON.parse(PROJECT_CHECKOUT_UI_RESPONSE.body) as {
    visualTests: ProjectRow[];
  };
  const rows = body.visualTests;

  await page.route("**/api/v1/projects/checkout-ui*", async (route) => {
    const url = new URL(route.request().url());
    const q = url.searchParams.get("q")?.toLowerCase() ?? "";
    const kind = url.searchParams.get("kind");
    const status = url.searchParams.get("status");
    const viewport = url.searchParams.get("viewport");
    const browser = url.searchParams.get("browser");
    const environment = url.searchParams.get("environment");
    const skip = Number(url.searchParams.get("skip") ?? 0);
    const take = Number(url.searchParams.get("take") ?? 50);

    const filtered = rows.filter((row) => {
      const isPending = row.latestStatus === "PENDING_APPROVAL";
      return (
        (!q || String(row.name).toLowerCase().includes(q)) &&
        (!kind || (row.kind ?? "image") === kind) &&
        (!status || (status === "pending" ? isPending : !isPending)) &&
        (!viewport || row.variant?.viewport === viewport) &&
        (!browser || row.variant?.browser === browser) &&
        (!environment || row.variant?.environment === environment)
      );
    });
    const visualTests = filtered.slice(skip, skip + take);

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...body,
        visualTests,
        pendingCount: rows.filter(
          (row) => row.latestStatus === "PENDING_APPROVAL",
        ).length,
        testCount: new Set(rows.map((row) => row.name)).size,
        meta: {
          page: Math.floor(skip / take) + 1,
          limit: take,
          total: filtered.length,
          totalPages: Math.ceil(filtered.length / take),
          hasNextPage: skip + take < filtered.length,
          hasPreviousPage: skip > 0,
        },
        filterOptions: {
          viewports: [
            ...new Set(
              rows.map((row) => row.variant?.viewport).filter(Boolean),
            ),
          ],
          browsers: [
            ...new Set(rows.map((row) => row.variant?.browser).filter(Boolean)),
          ],
          environments: [
            ...new Set(
              rows.map((row) => row.variant?.environment).filter(Boolean),
            ),
          ],
        },
      }),
    });
  });
}

test.describe("ProjectDetail", () => {
  test("shows details", async ({ mount, page }) => {
    await mockApi(page, [
      ["**/api/v1/projects/checkout-ui*", PROJECT_CHECKOUT_UI_RESPONSE],
      ["**/api/v1/groups", GROUPS_RESPONSE],
      ["**/api/v1/projects/*/branches*", BRANCHES_RESPONSE],
    ]);

    const component = await mount<typeof Routed>(
      "views/ProjectDetailView/Routed",
      { initialRoute: "/projects/checkout-ui" },
    );

    await expect(component).toContainText("checkout-ui");
    await expect(component.getByTestId(TEST_ID.breadcrumbGroup)).toHaveText(
      "Checkout",
    );
    await expect(component.getByTestId(TEST_ID.tableRow)).toHaveCount(9);
  });

  test("opens the clicked variant from a test row", async ({ mount, page }) => {
    await mockApi(page, [
      ["**/api/v1/projects/checkout-ui*", PROJECT_CHECKOUT_UI_RESPONSE],
      ["**/api/v1/groups", GROUPS_RESPONSE],
      ["**/api/v1/projects/*/branches*", BRANCHES_RESPONSE],
    ]);

    const component = await mount<typeof Routed>(
      "views/ProjectDetailView/Routed",
      { initialRoute: "/projects/checkout-ui" },
    );

    await component.getByTestId(TEST_ID.tableRow).first().click();

    // The row opens that variant itself (baseline, or the comparison waiting
    // for review) — the variant gallery is a detour, not the destination.
    await expect
      .poll(() => page.url())
      .toContain("/projects/checkout-ui/tests/");
    await expect.poll(() => page.url()).toContain("viewport=");
    await expect.poll(() => page.url()).not.toContain("/overview");
  });

  test("opens the variant gallery from the row actions", async ({
    mount,
    page,
  }) => {
    await mockApi(page, [
      ["**/api/v1/projects/checkout-ui*", PROJECT_CHECKOUT_UI_RESPONSE],
      ["**/api/v1/groups", GROUPS_RESPONSE],
      ["**/api/v1/projects/*/branches*", BRANCHES_RESPONSE],
    ]);

    const component = await mount<typeof Routed>(
      "views/ProjectDetailView/Routed",
      { initialRoute: "/projects/checkout-ui" },
    );

    await component.getByTestId(TEST_ID.testActionsButton).first().click();
    // The menu renders in a portal, so it is addressed through the page.
    await page.getByTestId(TEST_ID.rowActionOverview).click();

    await expect.poll(() => page.url()).toContain("/overview");
  });

  test("shows the group, pending count, and test count", async ({
    mount,
    page,
  }) => {
    await mockApi(page, [
      ["**/api/v1/projects/checkout-ui*", PROJECT_CHECKOUT_UI_RESPONSE],
      ["**/api/v1/groups", GROUPS_RESPONSE],
      ["**/api/v1/projects/*/branches*", BRANCHES_RESPONSE],
    ]);

    const component = await mount<typeof Routed>(
      "views/ProjectDetailView/Routed",
      { initialRoute: "/projects/checkout-ui" },
    );

    await expect(component.getByTestId(TEST_ID.projectTitle)).toHaveText(
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

    await page.route("**/api/v1/projects/checkout-ui*", async (route) => {
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

    await page.route("**/api/v1/projects/checkout-ui*", async (route) => {
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
      ["**/api/v1/groups", GROUPS_RESPONSE],
      ["**/api/v1/projects/*/branches*", BRANCHES_RESPONSE],
    ]);
    await mockProjectFilters(page);

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

  // The accordion's default values are uncontrolled, so a group that a filter
  // had hidden would come back collapsed. Both groups must read as expanded
  // once the filter is cleared, or the reset silently hides half the project.
  test("re-expands a group that the filter had hidden", async ({
    mount,
    page,
  }) => {
    await mockApi(page, [
      ["**/api/v1/groups", GROUPS_RESPONSE],
      ["**/api/v1/projects/*/branches*", BRANCHES_RESPONSE],
    ]);
    await mockProjectFilters(page);

    const component = await mount<typeof Routed>(
      "views/ProjectDetailView/Routed",
      { initialRoute: "/projects/checkout-ui" },
    );

    const cards = component.getByTestId(TEST_ID.testResultCard);
    await expect(cards).toHaveCount(2);

    // Chrome appears in checkout-flow only, so the login-form group disappears.
    await component.getByTestId(TEST_ID.filterBrowser).click();
    await page.getByRole("option", { name: "Chrome", exact: true }).click();
    await expect(cards).toHaveCount(1);

    await component.getByTestId(TEST_ID.resetFilter).click();

    await expect(cards).toHaveCount(2);
    await expect(cards.filter({ hasText: "login-form" })).toHaveAttribute(
      "data-state",
      "open",
    );
  });

  test("filters by search", async ({ mount, page }) => {
    await mockApi(page, [
      ["**/api/v1/groups", GROUPS_RESPONSE],
      ["**/api/v1/projects/*/branches*", BRANCHES_RESPONSE],
    ]);
    await mockProjectFilters(page);

    const component = await mount<typeof Routed>(
      "views/ProjectDetailView/Routed",
      { initialRoute: "/projects/checkout-ui" },
    );

    await component.getByTestId(TEST_ID.testSearch).fill("checkout");
    await expect(component.getByTestId(TEST_ID.tableRow)).toHaveCount(6);
  });

  // A filter that matches nothing is not an empty project: saying "this project
  // has no tests yet" would tell a reviewer the branch is clean when it is just
  // too narrow a query.
  test("says the filters matched nothing instead of claiming the project is empty", async ({
    mount,
    page,
  }) => {
    await mockApi(page, [
      ["**/api/v1/groups", GROUPS_RESPONSE],
      ["**/api/v1/projects/*/branches*", BRANCHES_RESPONSE],
    ]);
    await mockProjectFilters(page);

    const component = await mount<typeof Routed>(
      "views/ProjectDetailView/Routed",
      { initialRoute: "/projects/checkout-ui" },
    );

    await component.getByTestId(TEST_ID.testSearch).fill("no-such-test");

    await expect(component).toContainText("No tests match these filters");
    await expect(component).toContainText("Try a different search or filter.");
    await expect(component).not.toContainText("This project has no tests yet");
  });

  test("shows the empty state for a project without tests", async ({
    mount,
    page,
  }) => {
    await mockApi(page, [
      ["**/api/v1/projects/checkout-ui*", PROJECT_EMPTY_RESPONSE],
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
        "**/api/v1/projects/checkout-ui*",
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

  // The post-merge cleanup (docs/branches.md) in one action: the archive must
  // reach the server before the delete, or a refused delete would leave the
  // branch accepting uploads.
  test("archives and then deletes a branch the delete is allowed for", async ({
    mount,
    page,
  }) => {
    const calls: string[] = [];
    await mockApi(page, [
      ["**/api/v1/projects/checkout-ui*", PROJECT_CHECKOUT_UI_RESPONSE],
      ["**/api/v1/groups", GROUPS_RESPONSE],
      ["**/api/v1/projects/*/branches*", BRANCHES_RESPONSE],
    ]);
    // Registered after mockApi, so it wins for the writes while the list read
    // still falls through to the fixture above.
    await page.route("**/api/v1/projects/*/branches*", async (route) => {
      const request = route.request();
      if (request.method() === "GET") {
        await route.fallback();
        return;
      }
      calls.push(
        `${request.method()} ${new URL(request.url()).searchParams.get("branch")}`,
      );
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    });

    const component = await mount<typeof Routed>(
      "views/ProjectDetailView/Routed",
      {
        initialRoute:
          "/projects/checkout-ui?branch=feature%2Fcheckout-v2-child",
      },
    );

    await component.getByTestId(TEST_ID.branchActionsButton).click();
    await page.getByTestId(TEST_ID.branchArchiveAndDelete).click();
    await page.getByTestId(TEST_ID.dialogConfirm).click();

    await expect
      .poll(() => calls)
      .toEqual([
        "PATCH feature/checkout-v2-child",
        "DELETE feature/checkout-v2-child",
      ]);
  });
});

test.describe("ProjectDetail row actions", () => {
  test("offers the overview and the delete confirmation per row", async ({
    mount,
    page,
  }) => {
    await mockApi(page, [
      ["**/api/v1/projects/checkout-ui*", PROJECT_CHECKOUT_UI_RESPONSE],
      ["**/api/v1/groups", GROUPS_RESPONSE],
      ["**/api/v1/projects/*/branches*", BRANCHES_RESPONSE],
    ]);

    const component = await mount<typeof Routed>(
      "views/ProjectDetailView/Routed",
      { initialRoute: "/projects/checkout-ui" },
    );

    await component.getByTestId(TEST_ID.testActionsButton).first().click();

    // The menu renders in a portal: the read-only variant gallery comes first,
    // the destructive delete second.
    const items = page.getByRole("menuitem");
    await expect(items).toHaveText(["Variants", "Delete variant"]);

    await items.nth(1).click();
    // The confirmation names the variant that was clicked, which proves the
    // action is bound to its own row rather than to the first one.
    await expect(page.getByTestId(TEST_ID.dialogTitle)).toHaveText(
      "Delete test",
    );
    await expect(page.getByTestId(TEST_ID.dialogDescription)).toContainText(
      "checkout-flow",
    );
    await expect(page.getByTestId(TEST_ID.dialogConfirm)).toBeVisible();
  });

  test("marks a variant inherited from the target branch as read-only", async ({
    mount,
    page,
  }) => {
    await mockApi(page, [
      ["**/api/v1/projects/checkout-ui*", PROJECT_CHECKOUT_UI_BRANCH_RESPONSE],
      ["**/api/v1/groups", GROUPS_RESPONSE],
      ["**/api/v1/projects/*/branches*", BRANCHES_RESPONSE],
    ]);

    const component = await mount<typeof Routed>(
      "views/ProjectDetailView/Routed",
      { initialRoute: "/projects/checkout-ui?branch=feature%2Fcheckout-v2" },
    );

    await expect(component.getByTestId(TEST_ID.tableRow)).toHaveCount(2);
    await expect(component.getByTestId(TEST_ID.inheritedBadge)).toHaveText(
      "inherited from main",
    );
    // Only the branch's own variant is mutable; the inherited row has no actions
    // because its baselines belong to the branch it inherits from.
    await expect(component.getByTestId(TEST_ID.testActionsButton)).toHaveCount(
      1,
    );
  });
});

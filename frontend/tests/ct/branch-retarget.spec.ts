import { expect, test, type Locator, type Page } from "@playwright/test";
import { mockApi } from "./routes/api.routes";
import {
  BRANCHES_RESPONSE,
  PROJECT_CHECKOUT_UI_RESPONSE,
} from "./mocks/projects.mocks";
import { GROUPS_RESPONSE } from "./mocks/groups.mocks";
import type { Routed } from "../../src/views/ProjectDetailView.story";
import { TEST_ID } from "@/lib/test-ids";

// A branch's target decides which baselines an unapproved variant inherits from.
// "Change target…" is the only UI that writes it, and the branch list already
// holds the whole inheritance graph, so the dialog is where both the write and
// the cycle guard are observable. The dropdown and the dialog render in portals —
// query them from the page, not from the mounted component.
const FEATURE_BRANCH_ROUTE =
  "/projects/checkout-ui?branch=feature%2Fcheckout-v2";

async function mockProjectDetail(page: Page) {
  await mockApi(page, [
    ["**/api/v1/projects/checkout-ui*", PROJECT_CHECKOUT_UI_RESPONSE],
    ["**/api/v1/groups", GROUPS_RESPONSE],
    ["**/api/v1/projects/*/branches*", BRANCHES_RESPONSE],
  ]);
}

async function openTargetDialog(component: Locator, page: Page) {
  await component.getByTestId(TEST_ID.branchActionsButton).click();
  await page.getByTestId(TEST_ID.branchChangeTarget).click();
  await expect(page.getByTestId(TEST_ID.branchTargetDialog)).toBeVisible();
}

function retargetRequest(page: Page) {
  return page.waitForRequest(
    (request) =>
      request.method() === "PATCH" &&
      new URL(request.url()).pathname ===
        "/api/v1/projects/checkout-ui/branches",
  );
}

test.describe("Branch target dialog", () => {
  test("offers only targets that cannot close an inheritance cycle", async ({
    mount,
    page,
  }) => {
    await mockProjectDetail(page);

    const component = await mount<typeof Routed>(
      "views/ProjectDetailView/Routed",
      { initialRoute: FEATURE_BRANCH_ROUTE },
    );

    await expect(
      component.getByTestId(TEST_ID.projectBranchTarget),
    ).toContainText("inherits from main");

    await openTargetDialog(component, page);
    await expect(page.getByTestId(TEST_ID.branchTargetDialog)).toContainText(
      "feature/checkout-v2",
    );

    await page.getByTestId(TEST_ID.branchTargetSelect).click();
    await expect(
      page.getByRole("option", { name: "Project default" }),
    ).toBeVisible();
    await expect(
      page.getByRole("option", { name: "main", exact: true }),
    ).toBeVisible();
    // The child branch inherits from this one, so targeting it would close a
    // cycle the API rejects with a 409 — it must not be on offer.
    await expect(
      page.getByRole("option", { name: "feature/checkout-v2-child" }),
    ).toHaveCount(0);
  });

  test("writes the selected target branch", async ({ mount, page }) => {
    await mockProjectDetail(page);

    const component = await mount<typeof Routed>(
      "views/ProjectDetailView/Routed",
      { initialRoute: FEATURE_BRANCH_ROUTE },
    );

    await openTargetDialog(component, page);
    await page.getByTestId(TEST_ID.branchTargetSelect).click();
    await page.getByRole("option", { name: "main", exact: true }).click();

    const patch = retargetRequest(page);
    await page.getByTestId(TEST_ID.branchTargetConfirm).click();

    expect((await patch).postDataJSON()).toEqual({ targetBranch: "main" });
    await expect(page.getByTestId(TEST_ID.branchTargetDialog)).toBeHidden();
  });

  test("clears the target back to the project default", async ({
    mount,
    page,
  }) => {
    await mockProjectDetail(page);

    const component = await mount<typeof Routed>(
      "views/ProjectDetailView/Routed",
      { initialRoute: FEATURE_BRANCH_ROUTE },
    );

    await openTargetDialog(component, page);
    await page.getByTestId(TEST_ID.branchTargetSelect).click();
    await page.getByRole("option", { name: "Project default" }).click();

    // The project default is the absence of a target, not a branch name: the
    // endpoint takes `targetBranch: null` for it.
    const patch = retargetRequest(page);
    await page.getByTestId(TEST_ID.branchTargetConfirm).click();

    expect((await patch).postDataJSON()).toEqual({ targetBranch: null });
  });

  test("writes nothing when the dialog is dismissed", async ({
    mount,
    page,
  }) => {
    await mockProjectDetail(page);

    const component = await mount<typeof Routed>(
      "views/ProjectDetailView/Routed",
      { initialRoute: FEATURE_BRANCH_ROUTE },
    );

    const writes: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "PATCH") writes.push(request.url());
    });

    await openTargetDialog(component, page);
    await page.getByTestId(TEST_ID.branchTargetSelect).click();
    await page.getByRole("option", { name: "Project default" }).click();

    // An AlertDialog is deliberately not dismissable by Escape or an outside
    // click, so cancel is the only way out that writes nothing.
    await page.getByTestId(TEST_ID.branchTargetCancel).click();
    await expect(page.getByTestId(TEST_ID.branchTargetDialog)).toBeHidden();
    expect(writes).toEqual([]);
  });

  test("keeps the default branch from being retargeted", async ({
    mount,
    page,
  }) => {
    await mockProjectDetail(page);

    const component = await mount<typeof Routed>(
      "views/ProjectDetailView/Routed",
      { initialRoute: "/projects/checkout-ui" },
    );

    await component.getByTestId(TEST_ID.branchActionsButton).click();

    // The default branch is structural: it has no target of its own and nothing
    // to become the default of, so both lifecycle items stay disabled.
    await expect(page.getByTestId(TEST_ID.branchChangeTarget)).toBeDisabled();
    await expect(page.getByTestId(TEST_ID.branchSetDefault)).toBeDisabled();
  });
});

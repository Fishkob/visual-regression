import { expect, test } from "@playwright/test";
import { mockApi } from "./routes/api.routes";
import { GROUPS_EMPTY_RESPONSE, GROUPS_RESPONSE } from "./mocks/groups.mocks";
import { TEST_ID } from "@/lib/test-ids";

test.describe("Groups", () => {
  test("lists groups with project counts", async ({ mount, page }) => {
    await mockApi(page, [["**/api/v1/groups", GROUPS_RESPONSE]]);

    const component = await mount("views/GroupsView/Groups");
    const rows = component.getByTestId(TEST_ID.groupRow);

    await expect(rows).toHaveCount(2);

    const admin = rows.filter({ hasText: "Admin" });
    await expect(admin.getByTestId(TEST_ID.groupProjectCount)).toHaveText(
      "1 project",
    );

    const checkout = rows.filter({ hasText: "Checkout" });
    await expect(checkout.getByTestId(TEST_ID.groupProjectCount)).toHaveText(
      "2 projects",
    );
  });

  test("shows the empty state when there are no groups", async ({
    mount,
    page,
  }) => {
    await mockApi(page, [["**/api/v1/groups", GROUPS_EMPTY_RESPONSE]]);

    const component = await mount("views/GroupsView/Groups");

    await expect(component).toContainText("No groups yet");
  });

  test("shows an error with retry when loading fails", async ({
    mount,
    page,
  }) => {
    await mockApi(page, [
      [
        "**/api/v1/groups",
        { status: 500, contentType: "application/json", body: "{}" },
      ],
    ]);

    const component = await mount("views/GroupsView/Groups");

    // The query retries with backoff before the error state surfaces, so allow
    // a generous wait (same as the project-list error test).
    await expect(component.getByTestId(TEST_ID.retry)).toBeVisible({
      timeout: 15_000,
    });
    await expect(component).toContainText("Failed to load groups");
  });

  test("disables submit until a non-whitespace name is typed", async ({
    mount,
    page,
  }) => {
    await mockApi(page, [["**/api/v1/groups", GROUPS_RESPONSE]]);

    const component = await mount("views/GroupsView/Groups");

    await component.getByTestId(TEST_ID.newGroup).click();

    const input = page.getByTestId(TEST_ID.groupNameInput);
    const submit = page.getByTestId(TEST_ID.groupFormSubmit);

    await expect(input).toBeVisible();
    await expect(submit).toBeDisabled();

    await input.fill("   ");
    await expect(submit).toBeDisabled();

    await input.fill("Checkout");
    await expect(submit).toBeEnabled();
  });
});

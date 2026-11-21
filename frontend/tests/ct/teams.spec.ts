import { expect, test } from "@playwright/test";
import type { TeamDto } from "@sdk";
import { mockGet, type FulfillResponse } from "./routes/api.routes";
import {
  TEAMS_EMPTY_RESPONSE,
  TEAMS_GLOB,
  TEAMS_RESPONSE,
} from "./mocks/teams.mocks";
import {
  USERS_GLOB,
  USERS_ONE_RESPONSE,
  USERS_RESPONSE,
} from "./mocks/users.mocks";
import type { Routed } from "../../src/views/TeamsView.story";
import { TEST_ID } from "@/lib/test-ids";

const TEAMS_ROUTE = "/teams";

function json(body: unknown, status = 200): FulfillResponse {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  };
}

// A mutable copy of the list fixture: the view re-reads the list after every
// write, so a static answer would keep showing the old rows and hide a missing
// invalidation.
function seedTeams(): TeamDto[] {
  return JSON.parse(TEAMS_RESPONSE.body) as TeamDto[];
}

test.describe("Teams", () => {
  test("lists teams with their members and owned projects", async ({
    mount,
    page,
  }) => {
    await mockGet(page, TEAMS_GLOB, TEAMS_RESPONSE);
    await mockGet(page, USERS_GLOB, USERS_RESPONSE);

    const component = await mount<typeof Routed>("views/TeamsView/Routed", {
      initialRoute: TEAMS_ROUTE,
    });

    const rows = component.getByTestId(TEST_ID.teamRow);
    await expect(rows).toHaveCount(2);

    const checkout = rows.filter({ hasText: "Checkout" });
    await expect(checkout.getByTestId(TEST_ID.teamMemberCount)).toHaveText(
      "1 member · alice",
    );
    await expect(checkout.getByTestId(TEST_ID.teamProjects)).toHaveText(
      "No projects",
    );

    const platform = rows.filter({ hasText: "Platform" });
    await expect(platform.getByTestId(TEST_ID.teamMemberCount)).toHaveText(
      "0 members",
    );
    await expect(platform.getByTestId(TEST_ID.teamProjects)).toHaveText(
      "Projects: design-system, shared-lib",
    );
  });

  test("explains the ownership rule and shows the empty state", async ({
    mount,
    page,
  }) => {
    await mockGet(page, TEAMS_GLOB, TEAMS_EMPTY_RESPONSE);
    await mockGet(page, USERS_GLOB, USERS_RESPONSE);

    const component = await mount<typeof Routed>("views/TeamsView/Routed", {
      initialRoute: TEAMS_ROUTE,
    });

    await expect(component).toContainText("No teams yet");
    // The page has to say what "no team" means, not only what a team is.
    await expect(component).toContainText(
      "without a team it stays visible to every signed-in person",
    );
  });

  test("renames a team and continues with the new name", async ({
    mount,
    page,
  }) => {
    const teams = seedTeams();
    // One glob for both the list read and the rename. It has to be `**` after
    // the path: a single `*` does not cross a `/` in Playwright's glob, so
    // `**/api/v1/teams*` would not match `/api/v1/teams/team-checkout` and the
    // write would escape to the dev server.
    await page.route("**/api/v1/teams**", async (route) => {
      const request = route.request();
      if (request.method() !== "PATCH") {
        await route.fulfill(json(teams));
        return;
      }
      const { name } = request.postDataJSON() as { name: string };
      const index = teams.findIndex((team) => team.id === "team-checkout");
      teams[index] = { ...teams[index], name };
      await route.fulfill(json(teams[index]));
    });
    await mockGet(page, USERS_GLOB, USERS_RESPONSE);

    const component = await mount<typeof Routed>("views/TeamsView/Routed", {
      initialRoute: TEAMS_ROUTE,
    });
    await component
      .getByTestId(TEST_ID.teamRow)
      .filter({ hasText: "Checkout" })
      .getByTestId(TEST_ID.teamRename)
      .click();

    const input = page.getByTestId(TEST_ID.teamNameInput);
    await expect(input).toHaveValue("Checkout");
    await input.fill("Storefront");

    const patched = page.waitForRequest(
      (request) =>
        request.method() === "PATCH" &&
        request.url().endsWith("/api/v1/teams/team-checkout"),
    );
    await page.getByTestId(TEST_ID.teamFormSubmit).click();

    expect((await patched).postDataJSON()).toEqual({ name: "Storefront" });
    await expect(input).toBeHidden();
    await expect(
      component.getByTestId(TEST_ID.teamRow).filter({ hasText: "Storefront" }),
    ).toBeVisible();
  });

  test("replaces the member set with the complete selection", async ({
    mount,
    page,
  }) => {
    const teams = seedTeams();
    let replaced: string[] | undefined;
    await page.route(TEAMS_GLOB, async (route) => {
      await route.fulfill(json(teams));
    });
    await mockGet(page, USERS_GLOB, USERS_RESPONSE);
    await page.route("**/api/v1/teams/team-checkout/members", async (route) => {
      if (route.request().method() !== "PUT") {
        await route.fallback();
        return;
      }
      const { userIds } = route.request().postDataJSON() as {
        userIds: string[];
      };
      replaced = userIds;
      const index = teams.findIndex((team) => team.id === "team-checkout");
      teams[index] = {
        ...teams[index],
        members: userIds.map((userId) => ({
          userId,
          username: userId === "u-2" ? "bob" : "alice",
          role: "MEMBER" as const,
        })),
      };
      await route.fulfill(json(teams[index]));
    });

    const component = await mount<typeof Routed>("views/TeamsView/Routed", {
      initialRoute: TEAMS_ROUTE,
    });
    await component
      .getByTestId(TEST_ID.teamRow)
      .filter({ hasText: "Checkout" })
      .getByTestId(TEST_ID.teamMembers)
      .click();

    const dialog = page.getByTestId(TEST_ID.teamMembersDialog);
    await expect(dialog).toBeVisible();
    const alice = dialog
      .getByTestId(TEST_ID.teamMemberOption)
      .filter({ hasText: "alice" });
    const bob = dialog
      .getByTestId(TEST_ID.teamMemberOption)
      .filter({ hasText: "bob" });

    // Preselected from the team, not from a fresh empty selection.
    await expect(alice.getByTestId(TEST_ID.teamMemberCheckbox)).toBeChecked();
    await expect(bob.getByTestId(TEST_ID.teamMemberCheckbox)).toBeChecked({
      checked: false,
    });

    await alice.getByTestId(TEST_ID.teamMemberCheckbox).uncheck();
    await bob.getByTestId(TEST_ID.teamMemberCheckbox).check();
    // The dialog buttons live outside the dialog body slot, so they are found on
    // the page rather than inside the scoped container.
    await page.getByTestId(TEST_ID.teamMembersSubmit).click();

    // The complete set, not a delta: alice is gone because she is unchecked.
    await expect.poll(() => replaced).toEqual(["u-2"]);
    await expect(dialog).toBeHidden();
    await expect(
      component
        .getByTestId(TEST_ID.teamRow)
        .filter({ hasText: "Checkout" })
        .getByTestId(TEST_ID.teamMemberCount),
    ).toHaveText("1 member · bob");
  });

  test("shows the API's 409 message when a delete is refused", async ({
    mount,
    page,
  }) => {
    await mockGet(page, TEAMS_GLOB, TEAMS_RESPONSE);
    await mockGet(page, USERS_GLOB, USERS_RESPONSE);
    await page.route("**/api/v1/teams/*", async (route) => {
      if (route.request().method() !== "DELETE") {
        await route.fallback();
        return;
      }
      await route.fulfill(
        json(
          {
            statusCode: 409,
            message:
              'Team "Checkout" still owns 1 project; move or unassign them first',
          },
          409,
        ),
      );
    });

    const component = await mount<typeof Routed>("views/TeamsView/Routed", {
      initialRoute: TEAMS_ROUTE,
    });
    const rows = component.getByTestId(TEST_ID.teamRow);
    await rows
      .filter({ hasText: "Checkout" })
      .getByTestId(TEST_ID.teamDelete)
      .click();
    await page.getByTestId(TEST_ID.dialogConfirm).click();

    const banner = component.getByTestId(TEST_ID.teamDeleteError);
    await expect(banner).toContainText("The team was not deleted");
    await expect(banner).toContainText("still owns 1 project");
    // Refused means refused: the row is still there.
    await expect(rows.filter({ hasText: "Checkout" })).toBeVisible();
  });

  test("creates a team from a trimmed, allowed name", async ({
    mount,
    page,
  }) => {
    const teams = seedTeams();
    await page.route(TEAMS_GLOB, async (route) => {
      const request = route.request();
      if (request.method() !== "POST") {
        await route.fulfill(json(teams));
        return;
      }
      const { name } = request.postDataJSON() as { name: string };
      const created: TeamDto = {
        id: "team-storefront",
        name,
        createdBy: "admin",
        createdAt: "2026-10-22T12:00:00.000Z",
        members: [],
        projects: [],
      };
      teams.push(created);
      await route.fulfill(json(created, 201));
    });
    await mockGet(page, USERS_GLOB, USERS_RESPONSE);

    const component = await mount<typeof Routed>("views/TeamsView/Routed", {
      initialRoute: TEAMS_ROUTE,
    });
    await component.getByTestId(TEST_ID.newTeam).click();

    const input = page.getByTestId(TEST_ID.teamNameInput);
    const submit = page.getByTestId(TEST_ID.teamFormSubmit);
    await expect(submit).toBeDisabled();

    await input.fill("   ");
    await expect(submit).toBeDisabled();

    await input.fill("Store-front!");
    await expect(submit).toBeDisabled();
    await expect(page.getByRole("alert")).toContainText(
      "Only letters, digits, spaces, dashes and underscores.",
    );

    await input.fill("  Store-front  ");
    await expect(submit).toBeEnabled();

    const posted = page.waitForRequest(
      (request) =>
        request.method() === "POST" && request.url().endsWith("/api/v1/teams"),
    );
    await submit.click();

    expect((await posted).postDataJSON()).toEqual({ name: "Store-front" });
    await expect(input).toBeHidden();
    await expect(
      component.getByTestId(TEST_ID.teamRow).filter({ hasText: "Store-front" }),
    ).toBeVisible();
  });

  test("says that one account cannot fill a team", async ({ mount, page }) => {
    await mockGet(page, TEAMS_GLOB, TEAMS_RESPONSE);
    await mockGet(page, USERS_GLOB, USERS_ONE_RESPONSE);

    const component = await mount<typeof Routed>("views/TeamsView/Routed", {
      initialRoute: TEAMS_ROUTE,
    });
    await component
      .getByTestId(TEST_ID.teamRow)
      .filter({ hasText: "Checkout" })
      .getByTestId(TEST_ID.teamMembers)
      .click();

    await expect(page.getByTestId(TEST_ID.teamMembersEmpty)).toContainText(
      "Only one account",
    );
    await expect(page.getByTestId(TEST_ID.teamMembersSubmit)).toBeDisabled();
  });
});

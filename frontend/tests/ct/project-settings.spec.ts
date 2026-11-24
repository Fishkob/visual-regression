import { test, expect } from "@playwright/test";
import {
  mockProjectSettings,
  mockRenamedProject,
  SETTINGS_ROUTE,
} from "./mocks/projectSettings.mocks";
import type { Routed } from "../../src/views/ProjectSettingsView.story";
import {
  TEAMS_GLOB,
  TEAMS_RESPONSE,
  TEAMS_WITH_PROJECT_RESPONSE,
} from "./mocks/teams.mocks";
import { TEST_ID } from "@/lib/test-ids";

// The settings page is the home of the per-project admin surfaces: the name,
// the storage quota, the pixel threshold and the webhook endpoints. The shared
// mock answers every read the view makes.
test.describe("ProjectSettings", () => {
  test.beforeEach(async ({ page }) => {
    await mockProjectSettings(page);
  });

  test("shows the pixel threshold and the storage limits", async ({
    mount,
  }) => {
    const component = await mount<typeof Routed>(
      "views/ProjectSettingsView/Routed",
      { initialRoute: SETTINGS_ROUTE },
    );

    await expect(component.getByTestId(TEST_ID.projectSettingsName)).toHaveText(
      "checkout-ui",
    );
    await expect(
      component.getByTestId(TEST_ID.projectThresholdValue),
    ).toContainText("No project default");

    await expect(component.getByTestId(TEST_ID.storageUsage)).toContainText(
      "5.0 MB",
    );
    await expect(component.getByTestId(TEST_ID.storageQuota)).toContainText(
      "10.0 MB",
    );
    await expect(component.getByTestId(TEST_ID.storageRetention)).toContainText(
      "5 revisions",
    );
    await expect(component.getByTestId(TEST_ID.storageRetention)).toContainText(
      "30 days",
    );
    await expect(component.getByTestId(TEST_ID.storageRetention)).toContainText(
      "24 hours",
    );
  });

  test("shows both axes of the project's affiliation", async ({ mount }) => {
    const component = await mount<typeof Routed>(
      "views/ProjectSettingsView/Routed",
      { initialRoute: SETTINGS_ROUTE },
    );

    // The group is a navigation label and the team decides the access; the page
    // that edits a project has to name both instead of leaving the group to the
    // project list and the team to an admin-only corner.
    await expect(
      component.getByTestId(TEST_ID.projectAffiliationGroup),
    ).toHaveText("Checkout");
    // A project always has an owner now, and the flag says whether it is also
    // readable by everyone (ADR-083) — the two are no longer one column.
    await expect(component.getByTestId(TEST_ID.projectTeamCurrent)).toHaveText(
      "Checkout",
    );
    await expect(
      component.getByTestId(TEST_ID.projectVisibilityState),
    ).toHaveText("Currently visible to its team only.");
  });

  test("shows the project's webhook endpoints and opens the editor", async ({
    mount,
    page,
  }) => {
    const component = await mount<typeof Routed>(
      "views/ProjectSettingsView/Routed",
      { initialRoute: SETTINGS_ROUTE },
    );

    const section = component.getByTestId(TEST_ID.projectSettingsWebhooks);
    await expect(section).toBeVisible();
    await expect(section.getByTestId(TEST_ID.webhookRow)).toHaveCount(2);

    const active = section
      .getByTestId(TEST_ID.webhookRow)
      .filter({ hasText: "hooks.slack.com" });
    await expect(active.getByTestId(TEST_ID.webhookActiveToggle)).toBeChecked();

    const disabled = section
      .getByTestId(TEST_ID.webhookRow)
      .filter({ hasText: "vrt-disabled" });
    await expect(disabled.getByTestId(TEST_ID.webhookActiveToggle)).toBeChecked(
      { checked: false },
    );

    await section.getByTestId(TEST_ID.webhookAdd).click();
    await expect(page.getByTestId(TEST_ID.webhookUrlInput)).toBeVisible();
  });

  test("links back to the project table", async ({ mount }) => {
    const component = await mount<typeof Routed>(
      "views/ProjectSettingsView/Routed",
      { initialRoute: SETTINGS_ROUTE },
    );

    await expect(
      component.getByTestId(TEST_ID.projectSettingsBack),
    ).toHaveAttribute("href", "/projects/checkout-ui");
  });

  // The name is the project's address. A rename therefore moves the page with
  // it: the settings route, the project read and the panels below continue under
  // the new name instead of leaving the old one on screen.
  test("renames the project and continues on the new name", async ({
    mount,
    page,
  }) => {
    const renamed = "checkout-ui-renamed";
    await mockRenamedProject(page, renamed);

    const component = await mount<typeof Routed>(
      "views/ProjectSettingsView/Routed",
      { initialRoute: SETTINGS_ROUTE },
    );
    await expect(
      component.getByTestId(TEST_ID.projectRenameCurrent),
    ).toHaveText("checkout-ui");

    await component.getByTestId(TEST_ID.projectRenameAction).click();
    const dialog = page.getByTestId(TEST_ID.projectRenameDialog);
    await expect(dialog).toBeVisible();

    await page.getByTestId(TEST_ID.projectRenameInput).fill(renamed);
    const patched = page.waitForRequest(
      (request) =>
        request.method() === "PATCH" &&
        request.url().endsWith("/api/v1/projects/checkout-ui"),
    );
    await page.getByTestId(TEST_ID.projectRenameSave).click();

    // Only the name is sent: the group and the default branch belong to their
    // own actions.
    expect((await patched).postDataJSON()).toEqual({ name: renamed });
    await expect(dialog).toBeHidden();
    await expect(component.getByTestId(TEST_ID.projectSettingsName)).toHaveText(
      renamed,
    );
    await expect(
      component.getByTestId(TEST_ID.projectRenameCurrent),
    ).toHaveText(renamed);
  });

  test("keeps the submit disabled while the name is unchanged or empty", async ({
    mount,
    page,
  }) => {
    const component = await mount<typeof Routed>(
      "views/ProjectSettingsView/Routed",
      { initialRoute: SETTINGS_ROUTE },
    );

    await component.getByTestId(TEST_ID.projectRenameAction).click();
    const save = page.getByTestId(TEST_ID.projectRenameSave);
    await expect(save).toBeDisabled();

    await page.getByTestId(TEST_ID.projectRenameInput).fill("  ");
    await expect(save).toBeDisabled();
    await expect(page.getByTestId(TEST_ID.projectRenameDialog)).toContainText(
      "A project name is required.",
    );

    await page.getByTestId(TEST_ID.projectRenameInput).fill("checkout-ui-2");
    await expect(save).toBeEnabled();
  });

  test("moves the project to another team", async ({ mount, page }) => {
    // Stateful on purpose: the page re-reads the team list after the write, so a
    // static answer would snap the dropdown back to the old owner and hide a
    // broken invalidation.
    let owner = "Checkout";
    await page.route(TEAMS_GLOB, (route) =>
      route.fulfill(
        owner === "Checkout" ? TEAMS_WITH_PROJECT_RESPONSE : TEAMS_RESPONSE,
      ),
    );
    let patched: unknown;
    await page.route("**/api/v1/projects/checkout-ui/team", async (route) => {
      patched = route.request().postDataJSON();
      const body = patched as { teamId: string };
      owner = body.teamId === "team-platform" ? "Platform" : "Checkout";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          projectId: "p-1",
          projectName: "checkout-ui",
          teamId: body.teamId,
          teamName: owner,
        }),
      });
    });

    const component = await mount<typeof Routed>(
      "views/ProjectSettingsView/Routed",
      { initialRoute: SETTINGS_ROUTE },
    );

    // The team row names the owner directly; the row label already says "Team".
    await expect(component.getByTestId(TEST_ID.projectTeamCurrent)).toHaveText(
      "Checkout",
    );

    await component.getByTestId(TEST_ID.projectTeamSelect).click();
    await page.getByRole("option", { name: "Platform" }).click();
    await component.getByTestId(TEST_ID.projectTeamSave).click();

    // A project always has one owner, so a move sends a team id — there is no
    // "no team" option left to send.
    await expect.poll(() => patched).toEqual({ teamId: "team-platform" });
  });

  // Publishing is its own audited write (ADR-083), so the toggle saves on click
  // instead of waiting for a "save" next to the dropdown.
  test("publishes the project with the visibility toggle", async ({
    mount,
    page,
  }) => {
    await page.route(TEAMS_GLOB, (route) =>
      route.fulfill(TEAMS_WITH_PROJECT_RESPONSE),
    );
    let patched: unknown;
    await page.route(
      "**/api/v1/projects/checkout-ui/visibility",
      async (route) => {
        patched = route.request().postDataJSON();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ projectName: "checkout-ui", isShared: true }),
        });
      },
    );

    const component = await mount<typeof Routed>(
      "views/ProjectSettingsView/Routed",
      { initialRoute: SETTINGS_ROUTE },
    );

    const toggle = component.getByTestId(TEST_ID.projectVisibilityToggle);
    await expect(toggle).not.toBeChecked();
    await toggle.click();

    await expect.poll(() => patched).toEqual({ isShared: true });
    await expect(
      component.getByTestId(TEST_ID.projectVisibilityState),
    ).toHaveText("Currently visible to every signed-in person.");
  });
});

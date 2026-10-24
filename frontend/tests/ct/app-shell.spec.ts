import { expect, test } from "@playwright/test";
import { mockApi } from "./routes/api.routes";
import {
  PROJECTS_PENDING_RESPONSE,
  REVIEW_INBOX_RESPONSE,
} from "./mocks/projects.mocks";
import { GROUPS_RESPONSE } from "./mocks/groups.mocks";
import type { AppShell } from "@/AppShell.story.ts";
import { TEST_ID } from "@/lib/test-ids";

test.describe("App shell sidebar", () => {
  test("collapses and expands the navigation", async ({ mount, page }) => {
    await mockApi(page, [
      ["**/api/v1/projects/pending*", PROJECTS_PENDING_RESPONSE],
      ["**/api/v1/groups", GROUPS_RESPONSE],
      ["**/api/v1/review/pending*", REVIEW_INBOX_RESPONSE],
    ]);

    const component = await mount<typeof AppShell>("AppShell/AppShell", {
      initialRoute: "/projects",
    });

    const sidebar = component.getByTestId(TEST_ID.appSidebar);
    const toggle = component.getByTestId(TEST_ID.sidebarToggle);
    const label = component.getByTestId(TEST_ID.navInboxLabel);

    await expect(component.getByTestId(TEST_ID.appShell)).toBeVisible();
    await expect(component.getByTestId(TEST_ID.appHeader)).toBeVisible();
    await expect(component.getByTestId(TEST_ID.themeToggle)).toBeVisible();
    await expect(component.getByTestId(TEST_ID.logout)).toBeVisible();

    const initiallyExpanded =
      (await toggle.getAttribute("aria-expanded")) === "true";

    await toggle.click();

    await expect(toggle).toHaveAttribute(
      "aria-expanded",
      initiallyExpanded ? "false" : "true",
    );
    await expect(sidebar).toHaveAttribute(
      "data-collapsed",
      initiallyExpanded ? "true" : "false",
    );
    if (initiallyExpanded) {
      await expect(label).toBeHidden();
    } else {
      await expect(label).toBeVisible();
    }

    await toggle.click();

    await expect(toggle).toHaveAttribute(
      "aria-expanded",
      initiallyExpanded ? "true" : "false",
    );
    await expect(sidebar).toHaveAttribute(
      "data-collapsed",
      initiallyExpanded ? "false" : "true",
    );
    if (initiallyExpanded) {
      await expect(label).toBeVisible();
    } else {
      await expect(label).toBeHidden();
    }
  });
});

import { expect, test, type Locator, type Page } from "@playwright/test";
import type { CreatedUserDto } from "@sdk";
import { mockApi, type FulfillResponse } from "./routes/api.routes";
import {
  PROJECTS_PENDING_RESPONSE,
  REVIEW_INBOX_RESPONSE,
} from "./mocks/projects.mocks";
import { GROUPS_RESPONSE } from "./mocks/groups.mocks";
import type { AppShell } from "@/AppShell.story.ts";
import { TEST_ID } from "@/lib/test-ids";
import { USERS_RESPONSE } from "../quality/mocks/pages.mocks";

const INTERACTIVE_TAGS = ["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA"];

const SHELL_MOCKS: Array<[string, FulfillResponse]> = [
  ["**/api/v1/projects/pending*", PROJECTS_PENDING_RESPONSE],
  ["**/api/v1/groups", GROUPS_RESPONSE],
  ["**/api/v1/review/pending*", REVIEW_INBOX_RESPONSE],
];

// What the create endpoint answers: the account plus the one-time link whose
// reveal shows the temporary password. Bound to the DTO, so a changed response
// shape fails the type check instead of stranding the dialog without a link.
const CREATED_USER_RESPONSE: FulfillResponse = {
  status: 201,
  contentType: "application/json",
  body: JSON.stringify({
    user: {
      id: "u-created",
      username: "dana.qa",
      role: "MEMBER",
      isActive: true,
      mustChangePassword: true,
      // `deactivatedAt`/`createdBy` stay out: the generated DTO types those
      // nullable columns as free-form objects, and the mapper normalizes an
      // absent value to null anyway.
      createdAt: "2026-10-22T12:00:00.000Z",
    },
    invite: {
      token: "gallery-invite-token",
      expiresAt: "2026-10-29T12:00:00.000Z",
    },
  } satisfies CreatedUserDto),
};

// Dialogs portal to the body, so containment has to be asked in the page while
// the trigger stays scoped inside the mounted story.
async function focusIsInside(container: Locator): Promise<boolean> {
  return container.evaluate((element) =>
    element.contains(document.activeElement),
  );
}

interface FocusedElement {
  tag: string;
  insideShell: boolean;
}

async function focusedElement(page: Page): Promise<FocusedElement> {
  return page.evaluate((shellTestId) => {
    const element = document.activeElement as HTMLElement | null;
    return {
      tag: element?.tagName ?? "BODY",
      insideShell:
        element !== null &&
        element.closest(`[data-testid="${shellTestId}"]`) !== null,
    };
  }, TEST_ID.appShell);
}

test.describe("Modal dialog focus", () => {
  test("moves focus into the new project dialog and back to its trigger", async ({
    mount,
    page,
  }) => {
    await mockApi(page, [
      ["**/api/v1/projects/pending*", PROJECTS_PENDING_RESPONSE],
      ["**/api/v1/groups", GROUPS_RESPONSE],
    ]);

    const component = await mount("views/ProjectsView/Projects");
    const trigger = component.getByTestId(TEST_ID.newProject);
    await trigger.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId(TEST_ID.projectNameInput)).toBeFocused();
    await expect.poll(() => focusIsInside(dialog)).toBe(true);

    for (let stop = 0; stop < 8; stop++) {
      await page.keyboard.press("Tab");
      await expect
        .poll(() => focusIsInside(dialog), {
          message: `focus left the dialog after tab stop ${stop + 1}`,
        })
        .toBe(true);
    }

    await page.keyboard.press("Escape");

    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});

test.describe("Invite link dialog focus", () => {
  // Creating an account ends in the one-time link dialog instead of a password
  // (ADR-075). Its only control is the copy button, so a dialog that traps focus
  // wrongly strands the admin who has to hand the link over.
  test("moves focus into the invite dialog and closes on Escape", async ({
    mount,
    page,
  }) => {
    await mockApi(page, [["**/api/v1/users", USERS_RESPONSE]]);
    // The list read and the create write share one URL, so the handler answers
    // by method — the last registered route wins in Playwright.
    await page.route("**/api/v1/users", (route) =>
      route.request().method() === "POST"
        ? route.fulfill(CREATED_USER_RESPONSE)
        : route.fulfill(USERS_RESPONSE),
    );

    const component = await mount("views/UsersView/Routed", {
      initialRoute: "/users",
    });
    await expect(component.getByTestId(TEST_ID.userRow).first()).toBeVisible();

    await component.getByTestId(TEST_ID.userCreate).click();
    // The dialog portals to the body, so its controls live outside the mounted
    // story and are addressed through the page.
    await page.getByTestId(TEST_ID.createUserUsername).fill("dana.qa");
    await page.getByTestId(TEST_ID.createUserSubmit).click();

    const dialog = page.getByTestId(TEST_ID.inviteLinkDialog);
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId(TEST_ID.inviteLinkUrl)).toContainText(
      "/invite/gallery-invite-token",
    );
    await expect.poll(() => focusIsInside(dialog)).toBe(true);

    for (let stop = 0; stop < 4; stop++) {
      await page.keyboard.press("Tab");
      await expect
        .poll(() => focusIsInside(dialog), {
          message: `focus left the dialog after tab stop ${stop + 1}`,
        })
        .toBe(true);
    }

    await page.keyboard.press("Escape");

    await expect(dialog).toBeHidden();
  });
});

test.describe("Global search palette focus", () => {
  test("opens with the keyboard shortcut, focuses the input and closes on Escape", async ({
    mount,
    page,
  }) => {
    await mockApi(page, [...SHELL_MOCKS]);

    const component = await mount<typeof AppShell>("AppShell/AppShell", {
      initialRoute: "/projects",
    });
    await expect(component.getByTestId(TEST_ID.appShell)).toBeVisible();
    // The palette only mounts once the initial route resolves, so a shortcut
    // pressed before the routed shell is up would be lost.
    await expect(component.getByTestId(TEST_ID.projectSearch)).toBeVisible();

    await page.keyboard.press("Control+k");

    const palette = page.getByTestId(TEST_ID.globalSearchDialog);
    await expect(palette).toBeVisible();
    await expect(page.getByTestId(TEST_ID.globalSearchInput)).toBeFocused();
    await expect.poll(() => focusIsInside(palette)).toBe(true);

    await page.keyboard.press("Escape");

    await expect(palette).toBeHidden();
  });

  // The palette returns focus to the header search button, which is its
  // documented landing spot. reka-ui would restore the element focused before
  // the open instead — after a navigation that is the page <h1> — so the
  // palette cancels that restore and focuses the trigger itself.
  test("returns focus to the search trigger on Escape", async ({
    mount,
    page,
  }) => {
    await mockApi(page, [...SHELL_MOCKS]);

    const component = await mount<typeof AppShell>("AppShell/AppShell", {
      initialRoute: "/projects",
    });
    await expect(component.getByTestId(TEST_ID.projectSearch)).toBeVisible();

    await page.keyboard.press("Control+k");
    const palette = page.getByTestId(TEST_ID.globalSearchDialog);
    await expect(palette).toBeVisible();
    await expect(page.getByTestId(TEST_ID.globalSearchInput)).toBeFocused();

    await page.keyboard.press("Escape");

    await expect(palette).toBeHidden();
    await expect(component.getByTestId(TEST_ID.searchTrigger)).toBeFocused();
  });
});

test.describe("Tab order", () => {
  test("reaches real controls for the first tab stops of the page", async ({
    mount,
    page,
  }) => {
    await mockApi(page, [...SHELL_MOCKS]);

    const component = await mount<typeof AppShell>("AppShell/AppShell", {
      initialRoute: "/projects",
    });
    await expect(component.getByTestId(TEST_ID.appShell)).toBeVisible();
    await expect(component.getByTestId(TEST_ID.projectSearch)).toBeVisible();
    // The filter trigger stays disabled and the rows are absent until the list
    // settles, and a half-loaded page would run out of tab stops.
    await expect(component.getByTestId(TEST_ID.filterGroup)).toBeEnabled();
    await expect(component.getByTestId(TEST_ID.tableRow).first()).toBeVisible();

    for (let stop = 1; stop <= 6; stop++) {
      await page.keyboard.press("Tab");
      const focused = await focusedElement(page);
      expect(focused.tag, `tab stop ${stop}`).not.toBe("BODY");
      expect(INTERACTIVE_TAGS, `tab stop ${stop}`).toContain(focused.tag);
      expect(focused.insideShell, `tab stop ${stop}`).toBe(true);
    }
  });
});

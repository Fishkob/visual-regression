import { expect, test, type Locator, type Page } from "@playwright/test";
import type { CreatedUserDto } from "@sdk";
import { mockApi, type FulfillResponse } from "./routes/api.routes";
import {
  BRANCHES_RESPONSE,
  PROJECT_CHECKOUT_UI_RESPONSE,
  PROJECTS_PENDING_RESPONSE,
  REVIEW_INBOX_RESPONSE,
} from "./mocks/projects.mocks";
import { GROUPS_RESPONSE } from "./mocks/groups.mocks";
import { API_KEYS_RESPONSE } from "./mocks/apiKeys.mocks";
import type { AppShell } from "@/AppShell.story.ts";
import type { Routed as ProjectDetailRouted } from "@/views/ProjectDetailView.story";
import type { Routed as ProjectSettingsRouted } from "@/views/ProjectSettingsView.story";
import { TEST_ID } from "@/lib/test-ids";
import {
  mockProjectSettings,
  SETTINGS_ROUTE,
} from "./mocks/projectSettings.mocks";
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

test.describe("Rename project dialog focus", () => {
  // The rename has exactly one way in, the button on the settings page: if
  // focus does not come back to it on Escape, the keyboard user is left on the
  // page with nothing focused.
  test("moves focus into the rename dialog and back to its trigger", async ({
    mount,
    page,
  }) => {
    await mockProjectSettings(page);

    const component = await mount<typeof ProjectSettingsRouted>(
      "views/ProjectSettingsView/Routed",
      { initialRoute: SETTINGS_ROUTE },
    );
    const trigger = component.getByTestId(TEST_ID.projectRenameAction);
    await trigger.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId(TEST_ID.projectRenameInput)).toBeFocused();
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
    await expect(trigger).toBeFocused();
  });
});

test.describe("API key rotation dialog focus", () => {
  // Rotation is the one key action that mints a credential the admin has to
  // copy right away; the dialog must be operable without a pointer.
  test("moves focus into the rotation dialog and closes on Escape", async ({
    mount,
    page,
  }) => {
    await mockApi(page, [["**/api/v1/api-keys", API_KEYS_RESPONSE]]);

    const component = await mount("views/ApiKeysView/ApiKeys");
    const trigger = component.getByTestId(TEST_ID.rotateApiKey).first();
    await trigger.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect.poll(() => focusIsInside(dialog)).toBe(true);

    await page.keyboard.press("Escape");

    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
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

test.describe("Bulk delete dialog focus", () => {
  // The typed confirmation is the last guard before an irreversible delete.
  // Focus moves into it, Escape leaves without deleting, and focus returns to
  // the button the dialog was opened from.
  test("moves focus into the typed confirmation and closes on Escape", async ({
    mount,
    page,
  }) => {
    await mockApi(page, [
      ["**/api/v1/projects/checkout-ui*", PROJECT_CHECKOUT_UI_RESPONSE],
      ["**/api/v1/groups", GROUPS_RESPONSE],
      ["**/api/v1/projects/*/branches*", BRANCHES_RESPONSE],
    ]);

    const component = await mount<typeof ProjectDetailRouted>(
      "views/ProjectDetailView/Routed",
      { initialRoute: "/projects/checkout-ui" },
    );

    await component.getByTestId(TEST_ID.testSelectRow).first().click();
    const trigger = component.getByTestId(TEST_ID.testBulkDelete);
    await trigger.click();

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await expect.poll(() => focusIsInside(dialog)).toBe(true);

    await page.keyboard.press("Escape");

    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});

// The three overlays below had no keyboard case at all: they open, they close on
// a click, and nothing asserted that a keyboard user can get in, stay in and get
// out again. They are the patterns the rest of the page's overlays share — a
// dialog over a page, a dialog wrapping a combobox, and a dialog whose content
// arrives from a request — so a new one should be a row here, not a new theory.
async function expectDialogKeyboardContract(
  page: Page,
  component: Locator,
  options: {
    trigger: string;
    dialog: string;
    // Content that only exists once the dialog's request answered; waiting for
    // it keeps the tab walk off a spinner.
    waitFor?: string;
    firstFocus?: string;
    tabStops?: number;
  },
): Promise<void> {
  const trigger = component.getByTestId(options.trigger).first();
  await trigger.click();

  const dialog = page.getByTestId(options.dialog);
  await expect(dialog).toBeVisible();

  // The focus container is the dialog element, not the test id: several dialogs
  // put their id on an inner wrapper while the footer buttons (cancel, confirm,
  // close) live beside it. Checking the wrapper would report a working focus
  // trap as broken the moment Tab reaches the dialog's own actions.
  const container = page.getByRole("dialog").first();
  await expect.poll(() => focusIsInside(container)).toBe(true);
  if (options.waitFor) {
    await expect(page.getByTestId(options.waitFor)).toBeVisible();
  }
  if (options.firstFocus) {
    await expect(page.getByTestId(options.firstFocus)).toBeFocused();
  }

  const stops = options.tabStops ?? 5;
  for (let stop = 0; stop < stops; stop += 1) {
    await page.keyboard.press("Tab");
    await expect
      .poll(() => focusIsInside(container), {
        message: `focus left the dialog after tab stop ${stop + 1}`,
      })
      .toBe(true);
  }

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
}

test.describe("Share links dialog focus", () => {
  test("moves focus into the share dialog, keeps it there and closes on Escape", async ({
    mount,
    page,
  }) => {
    await mockApi(page, [
      ["**/api/v1/projects/checkout-ui*", PROJECT_CHECKOUT_UI_RESPONSE],
      ["**/api/v1/groups", GROUPS_RESPONSE],
      ["**/api/v1/projects/*/branches*", BRANCHES_RESPONSE],
    ]);

    const component = await mount<typeof ProjectDetailRouted>(
      "views/ProjectDetailView/Routed",
      { initialRoute: "/projects/checkout-ui" },
    );

    await expectDialogKeyboardContract(page, component, {
      trigger: TEST_ID.shareAction,
      dialog: TEST_ID.shareDialog,
    });
  });
});

test.describe("Branch target dialog focus", () => {
  test("traps focus and closes its select before closing itself", async ({
    mount,
    page,
  }) => {
    await mockApi(page, [
      ["**/api/v1/projects/checkout-ui*", PROJECT_CHECKOUT_UI_RESPONSE],
      ["**/api/v1/groups", GROUPS_RESPONSE],
      ["**/api/v1/projects/*/branches*", BRANCHES_RESPONSE],
    ]);

    const component = await mount<typeof ProjectDetailRouted>(
      "views/ProjectDetailView/Routed",
      {
        initialRoute: "/projects/checkout-ui?branch=feature%2Fcheckout-v2",
      },
    );

    // Reached through the row menu, so this one does not fit the helper: the
    // trigger that opens the dialog is itself inside an overlay that is gone by
    // the time the dialog closes.
    await component.getByTestId(TEST_ID.branchActionsButton).click();
    await page.getByTestId(TEST_ID.branchChangeTarget).click();

    const dialog = page.getByTestId(TEST_ID.branchTargetDialog);
    await expect(dialog).toBeVisible();
    await expect.poll(() => focusIsInside(dialog)).toBe(true);

    // A dialog that wraps a combobox has two overlays stacked. Escape must close
    // the inner one and leave the dialog standing, or a keyboard user who opened
    // the wrong option loses the form they were filling.
    await page.getByTestId(TEST_ID.branchTargetSelect).click();
    const listbox = page.getByRole("listbox");
    await expect(listbox).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(listbox).toBeHidden();
    await expect(dialog).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
});

test.describe("Retention preview dialog focus", () => {
  test("waits for the dry-run, traps focus and closes on Escape", async ({
    mount,
    page,
  }) => {
    await mockProjectSettings(page);

    const component = await mount<typeof ProjectSettingsRouted>(
      "views/ProjectSettingsView/Routed",
      { initialRoute: SETTINGS_ROUTE },
    );

    // The only automated gate on this dialog: nothing else opens it, and the
    // request it fires on open is mocked in the shared settings mocks.
    await expectDialogKeyboardContract(page, component, {
      trigger: TEST_ID.storagePreviewAction,
      dialog: TEST_ID.storagePreviewDialog,
      waitFor: TEST_ID.storagePreviewResults,
    });
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

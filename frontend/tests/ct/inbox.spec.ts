import { expect, test, type Page } from "@playwright/test";
import { mockApi, mockReviewBackend } from "./routes/api.routes";
import {
  REVIEW_INBOX_BRANCHES_RESPONSE,
  REVIEW_INBOX_EMPTY_RESPONSE,
  REVIEW_INBOX_MULTI_RESPONSE,
  REVIEW_INBOX_RESPONSE,
} from "./mocks/projects.mocks";
import {
  makeImageKind,
  makePendingItem,
  makeReviewableDetails,
} from "./mocks/reviewLoop.mocks";
import { GROUPS_RESPONSE } from "./mocks/groups.mocks";
import { TEST_ID } from "@/lib/test-ids";
import type { AppShell } from "../../src/AppShell.story";

const INBOX_ENDPOINT = "**/api/v1/review/pending*";

// The inbox filters and pages on the server now, so the CT mock answers the
// query it receives. Groups and branches are separate reads.
async function mockInbox(
  page: Page,
  response: { body: string },
): Promise<void> {
  const rows = JSON.parse(response.body).data as Array<{
    projectName: string;
    groupId: string | null;
    testName: string;
    kind: string;
    branchName: string;
  }>;

  await mockApi(page, [
    ["**/api/v1/groups", GROUPS_RESPONSE],
    [
      "**/api/v1/review/branches",
      {
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([...new Set(rows.map((row) => row.branchName))]),
      },
    ],
  ]);

  await page.route(INBOX_ENDPOINT, async (route) => {
    const url = new URL(route.request().url());
    const search = url.searchParams.get("q")?.toLowerCase() ?? "";
    const kind = url.searchParams.get("kind");
    const groupId = url.searchParams.get("groupId");
    const branch = url.searchParams.get("branch");

    const data = rows.filter((row) => {
      const matchesSearch =
        search === "" ||
        row.testName.toLowerCase().includes(search) ||
        row.projectName.toLowerCase().includes(search);
      const matchesKind = !kind || row.kind === kind;
      const matchesGroup =
        !groupId ||
        (groupId === "unassigned"
          ? row.groupId === null
          : row.groupId === groupId);
      const matchesBranch = !branch || row.branchName === branch;
      return matchesSearch && matchesKind && matchesGroup && matchesBranch;
    });

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data, meta: { total: data.length } }),
    });
  });
}

test.describe("Review inbox", () => {
  test("groups pending reviews by group and project", async ({
    mount,
    page,
  }) => {
    await mockInbox(page, REVIEW_INBOX_RESPONSE);

    const component = await mount("views/InboxView/Inbox");

    await expect(component).toContainText("Checkout");
    await expect(component).toContainText("Unassigned");
    await expect(component.getByTestId(TEST_ID.inboxItem)).toHaveCount(2);

    const sections = component.getByTestId(TEST_ID.inboxProjectSection);
    await expect(sections).toHaveCount(2);
    await expect(sections.nth(0)).toContainText("checkout-ui");
    await expect(sections.nth(1)).toContainText("admin-ui");
  });

  test("shows the caught-up state", async ({ mount, page }) => {
    await mockInbox(page, REVIEW_INBOX_EMPTY_RESPONSE);

    const component = await mount("views/InboxView/Inbox");
    await expect(component).toContainText("All caught up");
  });

  test("filters by kind", async ({ mount, page }) => {
    await mockInbox(page, REVIEW_INBOX_RESPONSE);

    const component = await mount("views/InboxView/Inbox");

    await component.getByTestId(TEST_ID.inboxFilterKind).click();
    await page.getByRole("option", { name: "PDFs" }).click();

    await expect(component.getByTestId(TEST_ID.inboxItem)).toHaveCount(1);
    await expect(component).toContainText("users");
    // The kind filter is part of the review scope, so it lives in the URL and
    // survives a refresh or a "return to inbox".
    await expect(page).toHaveURL(/[?&]kind=pdf/);
  });

  test("filters by group", async ({ mount, page }) => {
    await mockInbox(page, REVIEW_INBOX_RESPONSE);

    const component = await mount("views/InboxView/Inbox");

    await component.getByTestId(TEST_ID.filterGroup).click();
    await page.getByRole("option", { name: "Checkout" }).click();

    const sections = component.getByTestId(TEST_ID.inboxProjectSection);
    await expect(sections).toHaveCount(1);
    await expect(sections.first()).toContainText("checkout-ui");
    await expect(sections.first().getByTestId(TEST_ID.inboxItem)).toHaveCount(
      1,
    );
    await expect(component).not.toContainText("admin-ui");
    await expect(page).toHaveURL(/[?&]group=g1/);
  });

  test("searches by test name or project name", async ({ mount, page }) => {
    await mockInbox(page, REVIEW_INBOX_RESPONSE);

    const component = await mount("views/InboxView/Inbox");
    const search = component.getByTestId(TEST_ID.inboxSearch);

    await search.fill("checkout");
    await expect(component.getByTestId(TEST_ID.inboxItem)).toHaveCount(1);

    await search.fill("admin");
    await expect(component.getByTestId(TEST_ID.inboxItem)).toHaveCount(1);
    await expect(component).toContainText("users");
  });

  test("opens a single review from an inbox item", async ({ mount, page }) => {
    await mockInbox(page, REVIEW_INBOX_RESPONSE);

    const component = await mount("views/InboxView/Inbox");

    await component.getByTestId(TEST_ID.inboxItem).first().click();

    await page.waitForURL(
      (url) =>
        url.pathname === "/projects/checkout-ui/tests/checkout-flow" &&
        url.searchParams.get("from") === "inbox",
    );
  });

  test("keeps the kind scope through an item review and back to the inbox", async ({
    mount,
    page,
  }) => {
    await mockInbox(page, REVIEW_INBOX_RESPONSE);
    // The item's detail page needs a reviewable comparison for the skip button;
    // skipping in inbox mode is a pure navigation (no server round-trip).
    await mockReviewBackend(page, {
      projectName: "checkout-ui",
      details: new Map([
        ["checkout-flow", makeReviewableDetails("checkout-flow")],
      ]),
      kind: new Map([["checkout-flow", makeImageKind()]]),
      pending: [makePendingItem("checkout-flow")],
    });

    const component = await mount<typeof AppShell>("AppShell/AppShell", {
      initialRoute: "/",
    });

    await component.getByTestId(TEST_ID.inboxFilterKind).click();
    await page.getByRole("option", { name: "Images" }).click();
    await expect(page).toHaveURL(/[?&]kind=image/);
    await expect(component.getByTestId(TEST_ID.inboxItem)).toHaveCount(1);

    await component.getByTestId(TEST_ID.inboxItem).click();
    // Opening a filtered item carries the inbox scope into the pass…
    await page.waitForURL(
      (url) =>
        url.pathname === "/projects/checkout-ui/tests/checkout-flow" &&
        url.searchParams.get("inboxKind") === "image" &&
        url.searchParams.get("from") === "inbox",
    );

    await expect(component.getByTestId(TEST_ID.comparisonView)).toBeVisible();
    await component.getByTestId(TEST_ID.skip).click();

    // …and "back to inbox" restores the filter instead of widening the queue.
    await expect(page).toHaveURL(/[?&]kind=image/);
    await expect(component.getByTestId(TEST_ID.reviewInbox)).toBeVisible();
    await expect(component.getByTestId(TEST_ID.inboxFilterKind)).toContainText(
      "Images",
    );
    await expect(component.getByTestId(TEST_ID.inboxItem)).toHaveCount(1);
  });

  test("scopes the review count to the kind filter and enters at a visible item", async ({
    mount,
    page,
  }) => {
    await mockInbox(page, REVIEW_INBOX_MULTI_RESPONSE);

    const component = await mount("views/InboxView/Inbox");

    await component.getByTestId(TEST_ID.inboxFilterKind).click();
    await page.getByRole("option", { name: "PDFs" }).click();

    const section = component
      .getByTestId(TEST_ID.inboxProjectSection)
      .filter({ hasText: "checkout-ui" });
    await expect(section.getByTestId(TEST_ID.inboxItem)).toHaveCount(1);
    await expect(section).toContainText("checkout-pdf");

    const review = section.getByTestId(TEST_ID.reviewProjectButton);
    // The inbox filters are the pass's scope: they ride along as `inbox*` keys,
    // so the count describes the set the details page will actually walk. After
    // the kind filter that is one change, not the branch-wide two.
    await expect(review).toHaveText("Review 1");
    await review.click();

    // The entry item is the only visible one, and the scope rides along so the
    // pass does not silently widen back to both changes.
    await page.waitForURL(
      (url) => url.pathname === "/projects/checkout-ui/tests/checkout-pdf",
    );
    const url = new URL(page.url());
    expect(url.searchParams.get("inboxKind")).toBe("pdf");
    expect(url.searchParams.get("from")).toBeNull();
  });

  test("starts the project review loop without the inbox marker", async ({
    mount,
    page,
  }) => {
    await mockInbox(page, REVIEW_INBOX_RESPONSE);

    const component = await mount("views/InboxView/Inbox");

    await component.getByTestId(TEST_ID.reviewProjectButton).first().click();

    await page.waitForURL(
      (url) => url.pathname === "/projects/checkout-ui/tests/checkout-flow",
    );
    expect(new URL(page.url()).searchParams.get("from")).toBeNull();
  });

  test("shows an error with retry when loading fails", async ({
    mount,
    page,
  }) => {
    await mockApi(page, [
      [
        INBOX_ENDPOINT,
        { status: 500, contentType: "application/json", body: "{}" },
      ],
    ]);

    const component = await mount("views/InboxView/Inbox");

    // The query retries with backoff before the error state surfaces, so allow
    // a generous wait (same as the other list error tests).
    await expect(component.getByTestId(TEST_ID.retry)).toBeVisible({
      timeout: 15_000,
    });
    await expect(component).toContainText("Failed to load review inbox");
  });

  test("shows the no-match state when filters exclude everything", async ({
    mount,
    page,
  }) => {
    await mockInbox(page, REVIEW_INBOX_RESPONSE);

    const component = await mount("views/InboxView/Inbox");

    await component.getByTestId(TEST_ID.inboxFilterKind).click();
    await page.getByRole("option", { name: "PDFs" }).click();
    await component.getByTestId(TEST_ID.inboxSearch).fill("checkout");

    await expect(component.getByTestId(TEST_ID.inboxItem)).toHaveCount(0);
    await expect(component).toContainText(
      "No pending reviews match these filters.",
    );
  });

  test("restores the branch filter from the URL", async ({ mount, page }) => {
    await mockInbox(page, REVIEW_INBOX_BRANCHES_RESPONSE);

    // "Return to inbox" from a branch-scoped pass links `?branch=…`; the filter
    // must restore from it instead of showing every branch again.
    const component = await mount("views/InboxView/Inbox", {
      initialRoute: "/?branch=feature%2Fcheckout-v2",
    });

    await expect(component.getByTestId(TEST_ID.inboxItem)).toHaveCount(1);
    await expect(component).toContainText("checkout-pay");
    await expect(
      component.getByTestId(TEST_ID.inboxFilterBranch),
    ).toContainText("feature/checkout-v2");
  });

  test("writes the branch filter back to the URL and clears it", async ({
    mount,
    page,
  }) => {
    await mockInbox(page, REVIEW_INBOX_BRANCHES_RESPONSE);

    const component = await mount("views/InboxView/Inbox");
    await expect(component.getByTestId(TEST_ID.inboxItem)).toHaveCount(2);

    await component.getByTestId(TEST_ID.inboxFilterBranch).click();
    await page.getByRole("option", { name: "feature/checkout-v2" }).click();

    await expect(component.getByTestId(TEST_ID.inboxItem)).toHaveCount(1);
    await expect(page).toHaveURL(/branch=feature(%2F|\/)checkout-v2/);

    await component.getByTestId(TEST_ID.inboxFilterBranch).click();
    await page.getByRole("option", { name: "All branches" }).click();

    await expect(component.getByTestId(TEST_ID.inboxItem)).toHaveCount(2);
    await expect(page).not.toHaveURL(/branch=/);
  });

  test("carries a feature-branch item into the review loop", async ({
    mount,
    page,
  }) => {
    await mockInbox(page, REVIEW_INBOX_BRANCHES_RESPONSE);

    const component = await mount("views/InboxView/Inbox");

    await component
      .getByTestId(TEST_ID.inboxItem)
      .filter({ hasText: "checkout-pay" })
      .click();

    await page.waitForURL(
      (url) =>
        url.pathname === "/projects/checkout-ui/tests/checkout-pay" &&
        url.searchParams.get("branch") === "feature/checkout-v2",
    );
  });

  // The default branch needs no parameter (same convention as the project
  // switcher): an item on it returns to the unfiltered inbox.
  test("does not add a branch parameter for a default-branch item", async ({
    mount,
    page,
  }) => {
    await mockInbox(page, REVIEW_INBOX_BRANCHES_RESPONSE);

    const component = await mount("views/InboxView/Inbox");

    await component
      .getByTestId(TEST_ID.inboxItem)
      .filter({ hasText: "checkout-flow" })
      .click();

    await page.waitForURL(
      (url) =>
        url.pathname === "/projects/checkout-ui/tests/checkout-flow" &&
        !url.searchParams.has("branch"),
    );
  });

  test("badges, filters and counts per branch", async ({ mount, page }) => {
    await mockInbox(page, REVIEW_INBOX_BRANCHES_RESPONSE);

    const component = await mount("views/InboxView/Inbox");

    // Two branches in one project: only the non-default one carries a badge.
    const badge = component.getByTestId(TEST_ID.inboxBranchBadge);
    await expect(badge).toHaveCount(1);
    await expect(badge).toHaveText("feature/checkout-v2");

    // The pass the section starts is branch-scoped, so the count must describe
    // the same set instead of the whole project.
    const section = component.getByTestId(TEST_ID.inboxProjectSection).first();
    const reviewButton = section.getByTestId(TEST_ID.reviewProjectButton);
    await expect(reviewButton).toContainText("Review 1");
    await expect(section).toContainText("on main");

    await component.getByTestId(TEST_ID.inboxFilterBranch).click();
    await page.getByRole("option", { name: "feature/checkout-v2" }).click();

    await expect(component.getByTestId(TEST_ID.inboxItem)).toHaveCount(1);
    await expect(component).toContainText("checkout-pay");
  });
});

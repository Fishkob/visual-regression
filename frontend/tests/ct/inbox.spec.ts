import { expect, test } from "@playwright/test";
import { mockApi } from "./routes/api.routes";
import {
  REVIEW_INBOX_EMPTY_RESPONSE,
  REVIEW_INBOX_MULTI_RESPONSE,
  REVIEW_INBOX_RESPONSE,
} from "./mocks/projects.mocks";
import { TEST_ID } from "@/lib/test-ids";

const INBOX_ENDPOINT = "**/api/v1/review/pending*";

test.describe("Review inbox", () => {
  test("groups pending reviews by group and project", async ({
    mount,
    page,
  }) => {
    await mockApi(page, [[INBOX_ENDPOINT, REVIEW_INBOX_RESPONSE]]);

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
    await mockApi(page, [[INBOX_ENDPOINT, REVIEW_INBOX_EMPTY_RESPONSE]]);

    const component = await mount("views/InboxView/Inbox");
    await expect(component).toContainText("All caught up");
  });

  test("filters by kind", async ({ mount, page }) => {
    await mockApi(page, [[INBOX_ENDPOINT, REVIEW_INBOX_RESPONSE]]);

    const component = await mount("views/InboxView/Inbox");

    await component.getByTestId(TEST_ID.inboxFilterKind).click();
    await page.getByRole("option", { name: "PDFs" }).click();

    await expect(component.getByTestId(TEST_ID.inboxItem)).toHaveCount(1);
    await expect(component).toContainText("users");
  });

  test("filters by group", async ({ mount, page }) => {
    await mockApi(page, [[INBOX_ENDPOINT, REVIEW_INBOX_RESPONSE]]);

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
  });

  test("searches by test name or project name", async ({ mount, page }) => {
    await mockApi(page, [[INBOX_ENDPOINT, REVIEW_INBOX_RESPONSE]]);

    const component = await mount("views/InboxView/Inbox");
    const search = component.getByTestId(TEST_ID.inboxSearch);

    await search.fill("checkout");
    await expect(component.getByTestId(TEST_ID.inboxItem)).toHaveCount(1);

    await search.fill("admin");
    await expect(component.getByTestId(TEST_ID.inboxItem)).toHaveCount(1);
    await expect(component).toContainText("users");
  });

  test("opens a single review from an inbox item", async ({ mount, page }) => {
    await mockApi(page, [[INBOX_ENDPOINT, REVIEW_INBOX_RESPONSE]]);

    const component = await mount("views/InboxView/Inbox");

    await component.getByTestId(TEST_ID.inboxItem).first().click();

    await page.waitForURL(
      (url) =>
        url.pathname === "/projects/checkout-ui/tests/checkout-flow" &&
        url.searchParams.get("from") === "inbox",
    );
  });

  test("keeps the full project review count and start under filters", async ({
    mount,
    page,
  }) => {
    await mockApi(page, [[INBOX_ENDPOINT, REVIEW_INBOX_MULTI_RESPONSE]]);

    const component = await mount("views/InboxView/Inbox");

    await component.getByTestId(TEST_ID.inboxFilterKind).click();
    await page.getByRole("option", { name: "PDFs" }).click();

    const section = component
      .getByTestId(TEST_ID.inboxProjectSection)
      .filter({ hasText: "checkout-ui" });
    await expect(section.getByTestId(TEST_ID.inboxItem)).toHaveCount(1);
    await expect(section).toContainText("checkout-pdf");

    const review = section.getByTestId(TEST_ID.reviewProjectButton);
    await expect(review).toHaveText("Review 2");
    await review.click();

    await page.waitForURL(
      (url) => url.pathname === "/projects/checkout-ui/tests/checkout-flow",
    );
    expect(new URL(page.url()).searchParams.get("from")).toBeNull();
  });

  test("starts the project review loop without the inbox marker", async ({
    mount,
    page,
  }) => {
    await mockApi(page, [[INBOX_ENDPOINT, REVIEW_INBOX_RESPONSE]]);

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
    await mockApi(page, [[INBOX_ENDPOINT, REVIEW_INBOX_RESPONSE]]);

    const component = await mount("views/InboxView/Inbox");

    await component.getByTestId(TEST_ID.inboxFilterKind).click();
    await page.getByRole("option", { name: "PDFs" }).click();
    await component.getByTestId(TEST_ID.inboxSearch).fill("checkout");

    await expect(component.getByTestId(TEST_ID.inboxItem)).toHaveCount(0);
    await expect(component).toContainText(
      "No pending reviews match these filters.",
    );
  });
});

import { test, expect } from "@playwright/test";
import { mockReviewBackend } from "./routes/api.routes";
import {
  makeConflictError,
  makePdfKind,
  makePendingItem,
  makePdfReviewableDetails,
} from "./mocks/reviewLoop.mocks";
import { CHROME_1920_1080_STAGING } from "./mocks/variants";
import type { AppShell } from "../../src/AppShell.story";
import { TEST_ID } from "@/lib/test-ids";

const PROJECT = "checkout-ui";
const testUrl = (name: string) =>
  `/projects/${PROJECT}/tests/${name}?${CHROME_1920_1080_STAGING}`;

const TWO_PENDING = {
  details: new Map([
    ["invoice", makePdfReviewableDetails("invoice")],
    ["receipt", makePdfReviewableDetails("receipt")],
  ]),
  kind: new Map([
    ["invoice", makePdfKind()],
    ["receipt", makePdfKind()],
  ]),
  pending: [makePendingItem("invoice"), makePendingItem("receipt")],
};

const ONE_PENDING = {
  details: new Map([["invoice", makePdfReviewableDetails("invoice")]]),
  kind: new Map([["invoice", makePdfKind()]]),
  pending: [makePendingItem("invoice")],
};

test.describe("PDF approval loop", () => {
  test("approves through two pending PDF tests and lands on all-caught-up", async ({
    mount,
    page,
  }) => {
    await mockReviewBackend(page, { projectName: PROJECT, ...TWO_PENDING });

    const component = await mount<typeof AppShell>("AppShell/AppShell", {
      initialRoute: testUrl("invoice"),
    });

    await expect(component.getByTestId(TEST_ID.mismatchInfo)).toContainText(
      "1 of 3 pages differ",
    );
    await expect(component.getByTestId(TEST_ID.approveChanges)).toBeVisible();

    await component.getByTestId(TEST_ID.approveChanges).click();

    await expect(page).toHaveURL(/tests\/receipt/);
    await expect(component.getByTestId(TEST_ID.mismatchInfo)).toContainText(
      "1 of 3 pages differ",
    );

    await component.getByTestId(TEST_ID.approveChanges).click();

    await expect(page).toHaveURL(/\/done/);
    await expect(component.getByTestId(TEST_ID.doneHeading)).toContainText(
      "All comparisons reviewed",
    );
  });

  test("renders the diff panel and download actions", async ({
    mount,
    page,
  }) => {
    await mockReviewBackend(page, { projectName: PROJECT, ...ONE_PENDING });

    const component = await mount<typeof AppShell>("AppShell/AppShell", {
      initialRoute: testUrl("invoice"),
    });

    await expect(component.getByTestId(TEST_ID.modeSidebyside)).toBeVisible();
    await expect(component.getByTestId(TEST_ID.modeDiff)).toBeVisible();
    await expect(component.getByTestId(TEST_ID.downloadBaseline)).toBeVisible();
    await expect(
      component.getByTestId(TEST_ID.downloadCandidate),
    ).toBeVisible();
    await expect(component.getByTestId(TEST_ID.downloadDiff)).toBeVisible();

    await component.getByTestId(TEST_ID.modeDiff).click();
    await expect(component.getByTestId(TEST_ID.downloadBaseline)).toHaveCount(
      0,
    );
    await expect(component.getByTestId(TEST_ID.downloadDiff)).toBeVisible();
  });

  test("skip navigates to the next pending PDF test without approving", async ({
    mount,
    page,
  }) => {
    const approved: string[] = [];
    await mockReviewBackend(page, {
      projectName: PROJECT,
      ...TWO_PENDING,
      onApprove: (name) => approved.push(name),
    });

    const component = await mount<typeof AppShell>("AppShell/AppShell", {
      initialRoute: testUrl("invoice"),
    });

    await expect(component.getByTestId(TEST_ID.mismatchInfo)).toBeVisible();
    await component.getByTestId(TEST_ID.skip).click();

    await expect(page).toHaveURL(/tests\/receipt/);
    expect(approved).toEqual([]);
  });

  test("a CONFLICT on PDF approve keeps the reviewer on the test", async ({
    mount,
    page,
  }) => {
    await mockReviewBackend(page, {
      projectName: PROJECT,
      ...ONE_PENDING,
      approve: makeConflictError(),
    });

    const component = await mount<typeof AppShell>("AppShell/AppShell", {
      initialRoute: testUrl("invoice"),
    });

    await expect(component.getByTestId(TEST_ID.mismatchInfo)).toBeVisible();
    await component.getByTestId(TEST_ID.approveChanges).click();

    await expect(page).toHaveURL(/tests\/invoice/);
    await expect(page.getByTestId(TEST_ID.toaster)).toContainText(
      /Could not approve .* "invoice"/,
    );
    await expect(component.getByTestId(TEST_ID.approveChanges)).toBeEnabled();
  });
});

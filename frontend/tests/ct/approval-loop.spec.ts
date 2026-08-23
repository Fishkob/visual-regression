import { test, expect } from "@playwright/test";
import { mockReviewBackend } from "./routes/api.routes";
import {
  makeConflictError,
  makeImageKind,
  makePendingItem,
  makeReviewableDetails,
} from "./mocks/reviewLoop.mocks";
import { CHROME_1920_1080_STAGING } from "./mocks/variants";
import type { AppShell } from "../../src/AppShell.story";

const PROJECT = "checkout-ui";

const testUrl = (name: string) =>
  `/projects/${PROJECT}/tests/${name}?${CHROME_1920_1080_STAGING}`;

const TWO_PENDING = {
  details: new Map([
    ["login-form", makeReviewableDetails("login-form")],
    ["checkout-flow", makeReviewableDetails("checkout-flow")],
  ]),
  kind: new Map([
    ["login-form", makeImageKind()],
    ["checkout-flow", makeImageKind()],
  ]),
  pending: [makePendingItem("login-form"), makePendingItem("checkout-flow")],
};

const ONE_PENDING = {
  details: new Map([["login-form", makeReviewableDetails("login-form")]]),
  kind: new Map([["login-form", makeImageKind()]]),
  pending: [makePendingItem("login-form")],
};

test.describe("Approval loop (image)", () => {
  test("approves through two pending tests and lands on all-caught-up", async ({
    mount,
    page,
  }) => {
    await mockReviewBackend(page, { projectName: PROJECT, ...TWO_PENDING });

    const component = await mount<typeof AppShell>("AppShell/AppShell", {
      initialRoute: testUrl("login-form"),
    });

    await expect(component.getByTestId("comparison-view")).toBeVisible();
    await expect(component.getByTestId("badge-mismatch")).toContainText("157");

    await component.getByTestId("approve-changes").click();

    await expect(page).toHaveURL(/tests\/checkout-flow/);
    await expect(component.getByTestId("comparison-view")).toBeVisible();
    await expect(component.getByTestId("badge-mismatch")).toContainText("157");

    await component.getByTestId("approve-changes").click();

    await expect(page).toHaveURL(/\/done/);
    await expect(
      component.getByRole("heading", { name: "All comparisons reviewed" }),
    ).toBeVisible();
  });

  test("approving the only pending test lands directly on done", async ({
    mount,
    page,
  }) => {
    await mockReviewBackend(page, { projectName: PROJECT, ...ONE_PENDING });

    const component = await mount<typeof AppShell>("AppShell/AppShell", {
      initialRoute: testUrl("login-form"),
    });

    await expect(component.getByTestId("comparison-view")).toBeVisible();
    await component.getByTestId("approve-changes").click();

    await expect(page).toHaveURL(/\/done/);
    await expect(
      component.getByRole("heading", { name: "All comparisons reviewed" }),
    ).toBeVisible();
  });

  test("skip navigates to the next pending test without approving", async ({
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
      initialRoute: testUrl("login-form"),
    });

    await expect(component.getByTestId("comparison-view")).toBeVisible();
    await component.getByTestId("skip").click();

    await expect(page).toHaveURL(/tests\/checkout-flow/);
    await expect(component.getByTestId("comparison-view")).toBeVisible();
    expect(approved).toEqual([]);
  });

  test("a CONFLICT on approve keeps the reviewer on the test", async ({
    mount,
    page,
  }) => {
    await mockReviewBackend(page, {
      projectName: PROJECT,
      ...ONE_PENDING,
      approve: makeConflictError(),
    });

    const component = await mount<typeof AppShell>("AppShell/AppShell", {
      initialRoute: testUrl("login-form"),
    });

    await expect(component.getByTestId("comparison-view")).toBeVisible();
    await component.getByTestId("approve-changes").click();

    await expect(page).toHaveURL(/tests\/login-form/);
    await expect(component.getByTestId("comparison-view")).toBeVisible();
    await expect(
      page.getByText(/Could not approve .* "login-form"/),
    ).toBeVisible();
    await expect(component.getByTestId("approve-changes")).toBeEnabled();
  });

  test("after a CONFLICT the reviewer can skip to the next test", async ({
    mount,
    page,
  }) => {
    await mockReviewBackend(page, {
      projectName: PROJECT,
      ...TWO_PENDING,
      approve: makeConflictError(),
    });

    const component = await mount<typeof AppShell>("AppShell/AppShell", {
      initialRoute: testUrl("login-form"),
    });

    await expect(component.getByTestId("comparison-view")).toBeVisible();
    await component.getByTestId("approve-changes").click();
    await expect(
      page.getByText(/Could not approve .* "login-form"/),
    ).toBeVisible();

    await component.getByTestId("skip").click();

    await expect(page).toHaveURL(/tests\/checkout-flow/);
    await expect(component.getByTestId("comparison-view")).toBeVisible();
  });
});

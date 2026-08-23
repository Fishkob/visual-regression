import { test, expect } from "@playwright/test";
import { mockApi, mockThresholdBackend } from "./routes/api.routes";
import {
  PROJECT_TEST_DETAILS_ONLY_BASELINE_RESPONSE,
  VISUAL_TEST_DETAILS_PENDING,
  VISUAL_TEST_PENDING_META,
} from "./mocks/visualTest.mocks";
import { makeImageKind } from "./mocks/reviewLoop.mocks";
import {
  CHROME_1920_1080_STAGING,
  SAFARI_1366_768_STAGING,
} from "./mocks/variants";
import type { Routed } from "../../src/views/VisualTestDetailsView.story";
import type { AppShell } from "../../src/AppShell.story";

const BASELINE_ONLY_ROUTE = `/projects/checkout-ui/tests/checkout-flow?${SAFARI_1366_768_STAGING}`;
const PENDING_ROUTE = `/projects/checkout-ui/tests/checkout-flow?${CHROME_1920_1080_STAGING}`;
const DETAILS_GLOB = `**/api/v1/projects/checkout-ui/tests/checkout-flow?${CHROME_1920_1080_STAGING}`;
const KIND_GLOB = `**/api/v1/projects/checkout-ui/tests/checkout-flow/kind`;
const PENDING_META_GLOB = `**/api/v1/projects/checkout-ui/tests/meta/pending*`;

test.describe("VisualTestDetails", () => {
  test("shows baseline-only state", async ({ mount, page }) => {
    await mockApi(page, [
      [
        `**/api/v1/projects/checkout-ui/tests/checkout-flow?${SAFARI_1366_768_STAGING}`,
        PROJECT_TEST_DETAILS_ONLY_BASELINE_RESPONSE,
      ],
    ]);

    const component = await mount<typeof Routed>(
      "views/VisualTestDetailsView/Routed",
      { initialRoute: BASELINE_ONLY_ROUTE },
    );

    await expect(component).toContainText("Only baseline available");
    await expect(component).toContainText("checkout-ui");
    await expect(component).toContainText("checkout-flow");

    await expect(component.getByTestId("badge-viewport")).toContainText(
      "1366x768",
    );
    await expect(component.getByTestId("badge-browser")).toContainText(
      "Safari",
    );
    await expect(component.getByTestId("badge-environment")).toContainText(
      "staging",
    );
    await expect(component.getByTestId("threshold-input")).toHaveValue("0");
  });

  test("renders pending comparison correctly", async ({ mount, page }) => {
    await mockApi(page, [
      [DETAILS_GLOB, VISUAL_TEST_DETAILS_PENDING],
      [PENDING_META_GLOB, VISUAL_TEST_PENDING_META],
    ]);

    const component = await mount<typeof Routed>(
      "views/VisualTestDetailsView/Routed",
      { initialRoute: PENDING_ROUTE },
    );

    await expect(component.getByTestId("approve-changes")).toBeVisible();
    await expect(component.getByTestId("skip")).toBeVisible();
    await expect(component.getByTestId("panel-baseline")).toBeVisible();
    await expect(component.getByTestId("panel-candidate")).toBeVisible();
    await expect(component.getByTestId("badge-viewport")).toBeVisible();
    await expect(component.getByTestId("badge-browser")).toBeVisible();
    await expect(component.getByTestId("badge-environment")).toBeVisible();
    await expect(component.getByTestId("badge-mismatch")).toContainText("157");
  });

  test("commits a new threshold directly when nothing auto-accepts", async ({
    mount,
    page,
  }) => {
    await mockApi(page, [
      [KIND_GLOB, makeImageKind()],
      [DETAILS_GLOB, VISUAL_TEST_DETAILS_PENDING],
      [PENDING_META_GLOB, VISUAL_TEST_PENDING_META],
    ]);
    await mockThresholdBackend(page, {
      projectName: "checkout-ui",
      testName: "checkout-flow",
      previewAutoAcceptedCount: 0,
      commitThreshold: 10,
    });

    // AppShell carries the Toaster so the success toast is observable.
    const component = await mount<typeof AppShell>("AppShell/AppShell", {
      initialRoute: PENDING_ROUTE,
    });

    const input = component.getByTestId("threshold-input");
    await expect(input).toHaveValue("0");

    await input.fill("10");
    await input.press("Enter");

    await expect(input).toHaveValue("10");
    await expect(page.getByText(/Threshold updated/)).toBeVisible();
  });

  test("asks for confirmation when a threshold would auto-accept", async ({
    mount,
    page,
  }) => {
    await mockApi(page, [
      [DETAILS_GLOB, VISUAL_TEST_DETAILS_PENDING],
      [PENDING_META_GLOB, VISUAL_TEST_PENDING_META],
    ]);
    await mockThresholdBackend(page, {
      projectName: "checkout-ui",
      testName: "checkout-flow",
      previewAutoAcceptedCount: 2,
      commitThreshold: 200,
    });

    const component = await mount<typeof Routed>(
      "views/VisualTestDetailsView/Routed",
      { initialRoute: PENDING_ROUTE },
    );

    const input = component.getByTestId("threshold-input");
    await input.fill("200");
    await input.press("Enter");

    await expect(
      page.getByRole("heading", { name: "Replace comparison?" }),
    ).toBeVisible();
    await expect(page.getByText(/New threshold: 200 px/)).toBeVisible();

    await page.getByRole("button", { name: "Yes, continue" }).click();

    await expect(input).toHaveValue("200");
    await expect(
      page.getByRole("heading", { name: "Replace comparison?" }),
    ).toHaveCount(0);
  });
});

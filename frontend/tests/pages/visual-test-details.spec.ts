import { test, expect } from "@playwright/test";
import { mockApi } from "../ct/routes/api.routes";
import {
  PROJECT_TEST_DETAILS_ONLY_BASELINE_RESPONSE,
  VISUAL_TEST_DETAILS_PENDING,
  VISUAL_TEST_PENDING_META,
} from "../ct/mocks/visualTest.mocks";
import type { Routed } from "../../src/views/VisualTestDetailsView.story";

const BASELINE_ONLY_ROUTE =
  "/projects/checkout-ui/tests/checkout-flow?viewport=1366x768&browser=Safari&environment=staging";
const PENDING_ROUTE =
  "/projects/checkout-ui/tests/checkout-flow?viewport=1920x1080&browser=Chrome&environment=staging";

test.describe("VisualTestDetails", () => {
  test("shows baseline-only state", async ({ mount, page }) => {
    await mockApi(page, [
      [
        "**/api/v1/projects/checkout-ui/tests/checkout-flow?viewport=1366x768&browser=Safari&environment=staging",
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
      [
        "**/api/v1/projects/checkout-ui/tests/checkout-flow?viewport=1920x1080&browser=Chrome&environment=staging",
        VISUAL_TEST_DETAILS_PENDING,
      ],
      [
        "**/api/v1/projects/checkout-ui/tests/meta/pending",
        VISUAL_TEST_PENDING_META,
      ],
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
});

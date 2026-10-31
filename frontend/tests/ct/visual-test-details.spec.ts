import { test, expect } from "@playwright/test";
import { mockApi, mockThresholdBackend } from "./routes/api.routes";
import {
  PROJECT_TEST_DETAILS_ONLY_BASELINE_RESPONSE,
  VISUAL_TEST_DETAILS_PENDING,
  VISUAL_TEST_PENDING_META,
  VISUAL_TEST_VARIANTS,
  VISUAL_TEST_VARIANTS_SINGLE,
} from "./mocks/visualTest.mocks";
import {
  makeImageKind,
  makeReviewableDetailsWithRegions,
} from "./mocks/reviewLoop.mocks";
import {
  CHROME_1920_1080_STAGING,
  SAFARI_1366_768_STAGING,
} from "./mocks/variants";
import type { Routed } from "../../src/views/VisualTestDetailsView.story";
import type { AppShell } from "../../src/AppShell.story";
import { TEST_ID } from "@/lib/test-ids";

const BASELINE_ONLY_ROUTE = `/projects/checkout-ui/tests/checkout-flow?${SAFARI_1366_768_STAGING}`;
const PENDING_ROUTE = `/projects/checkout-ui/tests/checkout-flow?${CHROME_1920_1080_STAGING}`;
const DETAILS_GLOB = `**/api/v1/projects/checkout-ui/tests/checkout-flow?${CHROME_1920_1080_STAGING}`;
const KIND_GLOB = `**/api/v1/projects/checkout-ui/tests/checkout-flow/kind`;
const PENDING_META_GLOB = `**/api/v1/projects/checkout-ui/tests/meta/pending*`;
const VARIANTS_GLOB = `**/api/v1/projects/checkout-ui/tests/checkout-flow/variants*`;

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

    await expect(component.getByTestId(TEST_ID.badgeViewport)).toContainText(
      "1366x768",
    );
    await expect(component.getByTestId(TEST_ID.badgeBrowser)).toContainText(
      "Safari",
    );
    await expect(component.getByTestId(TEST_ID.badgeEnvironment)).toContainText(
      "staging",
    );
    await expect(component.getByTestId(TEST_ID.thresholdInput)).toHaveValue(
      "0",
    );
  });

  test("opens on the marked diff and lists the changed areas", async ({
    mount,
    page,
  }) => {
    const route = `/projects/checkout-ui/tests/checkout-flow-areas?${CHROME_1920_1080_STAGING}`;
    await mockApi(page, [
      [
        "**/api/v1/projects/checkout-ui/tests/checkout-flow-areas?*",
        makeReviewableDetailsWithRegions("checkout-flow-areas", [
          { x: 40, y: 60, width: 320, height: 120, pixelCount: 157 },
          { x: 40, y: 400, width: 160, height: 80, pixelCount: 64 },
        ]),
      ],
      [PENDING_META_GLOB, VISUAL_TEST_PENDING_META],
      [VARIANTS_GLOB, VISUAL_TEST_VARIANTS_SINGLE],
    ]);

    const component = await mount<typeof Routed>(
      "views/VisualTestDetailsView/Routed",
      { initialRoute: route },
    );

    await expect(component.getByTestId(TEST_ID.panelHighlight)).toBeVisible();
    await expect(
      component.getByTestId(TEST_ID.changedRegionList),
    ).toBeVisible();
    await expect(
      component.getByTestId(TEST_ID.changedRegionCount),
    ).toContainText("2");
    await expect(component.getByTestId(TEST_ID.changedRegionItem)).toHaveCount(
      2,
    );

    await component.getByTestId(TEST_ID.changedRegionItem).nth(1).click();

    await expect(
      component.getByTestId(TEST_ID.changedRegionItem).nth(1),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      component.getByTestId(TEST_ID.changedRegionFocus),
    ).toContainText("2");
  });

  test("renders pending comparison correctly", async ({ mount, page }) => {
    await mockApi(page, [
      [DETAILS_GLOB, VISUAL_TEST_DETAILS_PENDING],
      [PENDING_META_GLOB, VISUAL_TEST_PENDING_META],
      [VARIANTS_GLOB, VISUAL_TEST_VARIANTS],
    ]);

    const component = await mount<typeof Routed>(
      "views/VisualTestDetailsView/Routed",
      { initialRoute: PENDING_ROUTE },
    );

    await expect(component.getByTestId(TEST_ID.approveChanges)).toBeVisible();
    await expect(component.getByTestId(TEST_ID.skip)).toBeVisible();
    await expect(component.getByTestId(TEST_ID.panelBaseline)).toBeVisible();
    await expect(component.getByTestId(TEST_ID.panelCandidate)).toBeVisible();
    await expect(component.getByTestId(TEST_ID.badgeViewport)).toBeVisible();
    await expect(component.getByTestId(TEST_ID.badgeBrowser)).toBeVisible();
    await expect(component.getByTestId(TEST_ID.badgeEnvironment)).toBeVisible();
    await expect(component.getByTestId(TEST_ID.badgeMismatch)).toContainText(
      "157",
    );
    await expect(component.getByTestId(TEST_ID.reviewProgress)).toContainText(
      "1 of 2",
    );
    await expect(component.getByTestId(TEST_ID.shortcutsHint)).toBeVisible();
  });

  test("keeps the variants on their own page and links to them", async ({
    mount,
    page,
  }) => {
    await mockApi(page, [
      [DETAILS_GLOB, VISUAL_TEST_DETAILS_PENDING],
      [PENDING_META_GLOB, VISUAL_TEST_PENDING_META],
      [VARIANTS_GLOB, VISUAL_TEST_VARIANTS],
    ]);

    const component = await mount<typeof Routed>(
      "views/VisualTestDetailsView/Routed",
      { initialRoute: PENDING_ROUTE },
    );

    // One comparison per page: the variant tiles live on the overview, so the
    // comparison must not carry them.
    await expect(component.getByTestId(TEST_ID.testOverviewCard)).toHaveCount(
      0,
    );
    await expect(component.getByTestId(TEST_ID.comparisonView)).toBeVisible();

    await component.getByTestId(TEST_ID.testOverviewLink).click();

    await expect
      .poll(() => page.url())
      .toContain("/projects/checkout-ui/tests/checkout-flow/overview");
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

    const input = component.getByTestId(TEST_ID.thresholdInput);
    await expect(input).toHaveValue("0");

    await input.fill("10");
    await input.press("Enter");

    await expect(input).toHaveValue("10");
    await expect(page.getByTestId(TEST_ID.toaster)).toContainText(
      /Threshold updated/,
    );
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

    const input = component.getByTestId(TEST_ID.thresholdInput);
    await input.fill("200");
    await input.press("Enter");

    await expect(page.getByTestId(TEST_ID.dialogTitle)).toContainText(
      "Replace comparison?",
    );
    await expect(page.getByTestId(TEST_ID.dialogDescription)).toContainText(
      /New threshold: 200 px/,
    );

    await page.getByTestId(TEST_ID.dialogConfirm).click();

    await expect(input).toHaveValue("200");
    await expect(page.getByTestId(TEST_ID.dialogTitle)).toHaveCount(0);
  });

  test("keeps discussion, history and approvals in one block below the comparison", async ({
    mount,
    page,
  }) => {
    await mockApi(page, [
      [DETAILS_GLOB, VISUAL_TEST_DETAILS_PENDING],
      [PENDING_META_GLOB, VISUAL_TEST_PENDING_META],
      [VARIANTS_GLOB, VISUAL_TEST_VARIANTS],
    ]);

    const component = await mount<typeof Routed>(
      "views/VisualTestDetailsView/Routed",
      { initialRoute: PENDING_ROUTE },
    );

    // The three trailing sections share one tabbed block below the comparison,
    // so the diff keeps the full width of the page.
    await expect(component.getByTestId(TEST_ID.activityRail)).toBeVisible();
    await expect(component.getByTestId(TEST_ID.commentsPanel)).toBeVisible();

    await component.getByTestId(TEST_ID.activityTabHistory).click();
    await expect(
      component.getByTestId(TEST_ID.baselineHistoryEmpty),
    ).toBeVisible();
    await expect(component.getByTestId(TEST_ID.commentsPanel)).toBeHidden();

    await component.getByTestId(TEST_ID.activityTabApprovals).click();
    await expect(component.getByTestId(TEST_ID.approvalHistoryRow)).toHaveCount(
      0,
    );
    await expect(component.getByTestId(TEST_ID.activityRail)).toContainText(
      "No approvals yet",
    );

    await component.getByTestId(TEST_ID.activityTabComments).click();
    await expect(component.getByTestId(TEST_ID.commentsPanel)).toBeVisible();
  });
});

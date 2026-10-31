import { test, expect, type Page } from "@playwright/test";
import { mockApi, type FulfillResponse } from "./routes/api.routes";
import { PROJECT_CHECKOUT_UI_RESPONSE } from "./mocks/projects.mocks";
import { makeImageKind, makePdfKind } from "./mocks/reviewLoop.mocks";
import {
  VISUAL_TEST_VARIANTS,
  VISUAL_TEST_VARIANTS_BROWSERS,
} from "./mocks/visualTest.mocks";
import type { Routed } from "../../src/views/TestOverviewView.story";
import { TEST_ID } from "@/lib/test-ids";

const OVERVIEW_ROUTE = "/projects/checkout-ui/tests/checkout-flow/overview";
const PROJECT_GLOB = "**/api/v1/projects/checkout-ui";
const KIND_GLOB = "**/api/v1/projects/checkout-ui/tests/checkout-flow/kind";
const VARIANTS_GLOB =
  "**/api/v1/projects/checkout-ui/tests/checkout-flow/variants*";

async function mockOverview(page: Page, variants: FulfillResponse) {
  await mockApi(page, [
    [PROJECT_GLOB, PROJECT_CHECKOUT_UI_RESPONSE],
    [KIND_GLOB, makeImageKind()],
    [VARIANTS_GLOB, variants],
  ]);
}

test.describe("TestOverview", () => {
  test("groups by viewport and labels every browser of a section", async ({
    mount,
    page,
  }) => {
    await mockOverview(page, VISUAL_TEST_VARIANTS_BROWSERS);

    const component = await mount<typeof Routed>(
      "views/TestOverviewView/Routed",
      { initialRoute: OVERVIEW_ROUTE },
    );
    await expect(component.getByTestId(TEST_ID.testOverview)).toBeVisible();

    // One section per viewport, ordered small → large. The section owns the
    // resolution; the browser is what the tiles of one section are for.
    const groups = component.getByTestId(TEST_ID.testOverviewViewportGroup);
    await expect(groups).toHaveCount(2);
    await expect(groups.nth(0)).toContainText("1366x768");
    await expect(groups.nth(1)).toContainText("1920x1080");

    // Cards follow the section order (small → large), and inside the desktop
    // section the gallery order Chrome → Firefox → Safari.
    const cards = component.getByTestId(TEST_ID.testOverviewCard);
    await expect(cards).toHaveCount(4);
    await expect(cards.nth(0)).toContainText("Chrome");
    await expect(cards.nth(1)).toContainText("Chrome");
    await expect(cards.nth(2)).toContainText("Firefox");
    await expect(cards.nth(3)).toContainText("Safari");

    // One compare toolbar for the whole page; the pair selection stays in the
    // section it belongs to.
    await expect(component.getByTestId(TEST_ID.modeOverlay)).toHaveCount(1);

    await expect(
      component.getByTestId(TEST_ID.testOverviewVariantCount),
    ).toContainText("4");

    // The overview is a reading surface: no review actions on it.
    await expect(component.getByTestId(TEST_ID.approveChanges)).toHaveCount(0);
    await expect(component.getByTestId(TEST_ID.skip)).toHaveCount(0);
  });

  test("renders a narrow viewport smaller than a wide one", async ({
    mount,
    page,
  }) => {
    await mockOverview(page, VISUAL_TEST_VARIANTS);

    const component = await mount<typeof Routed>(
      "views/TestOverviewView/Routed",
      { initialRoute: OVERVIEW_ROUTE },
    );

    // Every viewport captured in one browser: there is nothing to layer, so the
    // page offers no compare toolbar at all.
    await expect(component.getByTestId(TEST_ID.modeOverlay)).toHaveCount(0);

    const cards = component.getByTestId(TEST_ID.testOverviewCard);
    const mobile = await cards.nth(0).boundingBox();
    const desktop = await cards.nth(2).boundingBox();

    // The sections are scaled relative to the widest viewport, so the size
    // difference is visible instead of every screenshot filling its card.
    expect(mobile?.width ?? 0).toBeLessThan((desktop?.width ?? 0) * 0.6);
  });

  test("overlays one browser over another of the same viewport", async ({
    mount,
    page,
  }) => {
    await mockOverview(page, VISUAL_TEST_VARIANTS_BROWSERS);

    const component = await mount<typeof Routed>(
      "views/TestOverviewView/Routed",
      { initialRoute: OVERVIEW_ROUTE },
    );
    await expect(component.getByTestId(TEST_ID.testOverview)).toBeVisible();

    await component.getByTestId(TEST_ID.modeOverlay).click();

    const stage = component.getByTestId(TEST_ID.testOverviewStage);
    await expect(stage).toBeVisible();

    // The pair starts on the gallery order: Chrome is the ground, Firefox the
    // layer that carries the opacity.
    await expect(
      component.getByTestId(TEST_ID.testOverviewReferencePane),
    ).toContainText("Chrome");
    await expect(
      component.getByTestId(TEST_ID.testOverviewTargetPane),
    ).toContainText("Firefox");

    const images = stage.locator("img");
    await expect(images).toHaveCount(2);
    await expect(images.nth(0)).toHaveAttribute("src", /baseline-chrome\.png$/);
    await expect(images.nth(1)).toHaveAttribute(
      "src",
      /baseline-firefox\.png$/,
    );

    // The opacity slider belongs to the overlay mode only.
    const slider = component.getByTestId(TEST_ID.testOverviewOverlayOpacity);
    await expect(slider).toBeVisible();
    await slider.fill("80");

    // Switching the comparison target re-layers the stage without leaving it.
    await component.getByTestId(TEST_ID.testOverviewTarget).click();
    await page.getByRole("option", { name: "Safari", exact: true }).click();
    await expect(
      component.getByTestId(TEST_ID.testOverviewTargetPane),
    ).toContainText("Safari");
    await expect(images.nth(1)).toHaveAttribute("src", /baseline-safari\.png$/);
  });

  test("turns the pair around when the reference becomes the target", async ({
    mount,
    page,
  }) => {
    await mockOverview(page, VISUAL_TEST_VARIANTS_BROWSERS);

    const component = await mount<typeof Routed>(
      "views/TestOverviewView/Routed",
      { initialRoute: OVERVIEW_ROUTE },
    );
    await expect(component.getByTestId(TEST_ID.testOverview)).toBeVisible();

    await component.getByTestId(TEST_ID.modeOverlay).click();

    await component.getByTestId(TEST_ID.testOverviewReference).click();
    await page.getByRole("option", { name: "Firefox", exact: true }).click();

    // Picking the comparison target as the new reference swaps the sides; the
    // pair must never collapse into one browser compared with itself.
    await expect(
      component.getByTestId(TEST_ID.testOverviewReferencePane),
    ).toContainText("Firefox");
    await expect(
      component.getByTestId(TEST_ID.testOverviewTargetPane),
    ).toContainText("Chrome");
  });

  test("wipes between two browsers", async ({ mount, page }) => {
    await mockOverview(page, VISUAL_TEST_VARIANTS_BROWSERS);

    const component = await mount<typeof Routed>(
      "views/TestOverviewView/Routed",
      { initialRoute: OVERVIEW_ROUTE },
    );
    await expect(component.getByTestId(TEST_ID.testOverview)).toBeVisible();

    await component.getByTestId(TEST_ID.modeWipe).click();

    const handle = component.getByTestId(TEST_ID.testOverviewWipeHandle);
    await expect(handle).toBeVisible();
    await expect(handle).toHaveAttribute("aria-valuenow", "50");

    await handle.press("End");
    await expect(handle).toHaveAttribute("aria-valuenow", "100");
    await handle.press("Home");
    await expect(handle).toHaveAttribute("aria-valuenow", "0");
    await handle.press("ArrowRight");
    await expect(handle).toHaveAttribute("aria-valuenow", "2");
  });

  test("blinks between two browsers", async ({ mount, page }) => {
    await mockOverview(page, VISUAL_TEST_VARIANTS_BROWSERS);

    const component = await mount<typeof Routed>(
      "views/TestOverviewView/Routed",
      { initialRoute: OVERVIEW_ROUTE },
    );
    await expect(component.getByTestId(TEST_ID.testOverview)).toBeVisible();

    await component.getByTestId(TEST_ID.modeBlink).click();

    const stage = component.getByTestId(TEST_ID.testOverviewStage);
    await expect(stage).toBeVisible();
    // No diff artifact exists between two browsers, so the stage stacks the two
    // screenshots and alternates them instead of painting a diff.
    await expect(stage.locator("img")).toHaveCount(2);
    await expect(stage.locator("img").nth(1)).toHaveClass(/variant-blink/);
  });

  test("opens the comparison for the clicked variant", async ({
    mount,
    page,
  }) => {
    await mockOverview(page, VISUAL_TEST_VARIANTS);

    const component = await mount<typeof Routed>(
      "views/TestOverviewView/Routed",
      { initialRoute: OVERVIEW_ROUTE },
    );
    await expect(component.getByTestId(TEST_ID.testOverview)).toBeVisible();

    await component
      .locator('[data-variant-key="375x667|Chrome|staging"]')
      .click();

    await expect
      .poll(() => page.url())
      .toContain("viewport=375x667&browser=Chrome&environment=staging");
    await expect.poll(() => page.url()).not.toContain("/overview");
  });

  test("opens the comparison for the variant waiting on review", async ({
    mount,
    page,
  }) => {
    await mockOverview(page, VISUAL_TEST_VARIANTS);

    const component = await mount<typeof Routed>(
      "views/TestOverviewView/Routed",
      { initialRoute: OVERVIEW_ROUTE },
    );
    await expect(component.getByTestId(TEST_ID.testOverview)).toBeVisible();

    await component.getByTestId(TEST_ID.testOverviewBack).click();

    // The pending variant (1920x1080 in the fixture) is the review target; the
    // details endpoint rejects a call without a concrete variant.
    await expect.poll(() => page.url()).toContain("viewport=1920x1080");
    await expect.poll(() => page.url()).not.toContain("/overview");
  });

  test("opens the comparison of a layered pane's browser", async ({
    mount,
    page,
  }) => {
    await mockOverview(page, VISUAL_TEST_VARIANTS_BROWSERS);

    const component = await mount<typeof Routed>(
      "views/TestOverviewView/Routed",
      { initialRoute: OVERVIEW_ROUTE },
    );
    await expect(component.getByTestId(TEST_ID.testOverview)).toBeVisible();

    await component.getByTestId(TEST_ID.modeOverlay).click();
    await component.getByTestId(TEST_ID.testOverviewTargetPane).click();

    await expect.poll(() => page.url()).toContain("browser=Firefox");
    await expect.poll(() => page.url()).not.toContain("/overview");
  });

  test("sends a PDF test back to its comparison", async ({ mount, page }) => {
    await mockApi(page, [
      [PROJECT_GLOB, PROJECT_CHECKOUT_UI_RESPONSE],
      [KIND_GLOB, makePdfKind()],
    ]);

    const component = await mount<typeof Routed>(
      "views/TestOverviewView/Routed",
      { initialRoute: OVERVIEW_ROUTE },
    );

    await expect(
      component.getByTestId(TEST_ID.testOverviewPdfNote),
    ).toBeVisible();
    await expect(component.getByTestId(TEST_ID.testOverviewCard)).toHaveCount(
      0,
    );
  });
});

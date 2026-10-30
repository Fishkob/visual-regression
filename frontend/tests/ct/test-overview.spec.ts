import { test, expect } from "@playwright/test";
import { mockApi } from "./routes/api.routes";
import { PROJECT_CHECKOUT_UI_RESPONSE } from "./mocks/projects.mocks";
import { makeImageKind, makePdfKind } from "./mocks/reviewLoop.mocks";
import { VISUAL_TEST_VARIANTS } from "./mocks/visualTest.mocks";
import type { Routed } from "../../src/views/TestOverviewView.story";
import { TEST_ID } from "@/lib/test-ids";

const OVERVIEW_ROUTE = "/projects/checkout-ui/tests/checkout-flow/overview";
const PROJECT_GLOB = "**/api/v1/projects/checkout-ui";
const KIND_GLOB = "**/api/v1/projects/checkout-ui/tests/checkout-flow/kind";
const VARIANTS_GLOB =
  "**/api/v1/projects/checkout-ui/tests/checkout-flow/variants*";

test.describe("TestOverview", () => {
  test("shows every variant of the test as a baseline thumbnail", async ({
    mount,
    page,
  }) => {
    await mockApi(page, [
      [PROJECT_GLOB, PROJECT_CHECKOUT_UI_RESPONSE],
      [KIND_GLOB, makeImageKind()],
      [VARIANTS_GLOB, VISUAL_TEST_VARIANTS],
    ]);

    const component = await mount<typeof Routed>(
      "views/TestOverviewView/Routed",
      { initialRoute: OVERVIEW_ROUTE },
    );

    await expect(component.getByTestId(TEST_ID.testOverview)).toBeVisible();
    const cards = component.getByTestId(TEST_ID.testOverviewCard);
    await expect(cards).toHaveCount(3);

    // One section per viewport, ordered small → large, like the gallery. The
    // viewport label belongs to the section; a tile is the bare baseline image,
    // and the variant it belongs to rides on its accessible name.
    const groups = component.getByTestId(TEST_ID.testOverviewViewportGroup);
    await expect(groups).toHaveCount(3);
    await expect(groups.nth(0)).toContainText("375x667");
    await expect(groups.nth(1)).toContainText("768x1024");
    await expect(groups.nth(2)).toContainText("1920x1080");

    await expect(cards.nth(0)).toHaveAccessibleName("375x667, Chrome, staging");

    // The variant count is a badge next to the page title, not a header line.
    await expect(
      component.getByTestId(TEST_ID.testOverviewVariantCount),
    ).toContainText("3");

    // The overview is a reading surface: no review actions on it.
    await expect(component.getByTestId(TEST_ID.approveChanges)).toHaveCount(0);
    await expect(component.getByTestId(TEST_ID.skip)).toHaveCount(0);

    // It shows the baseline even for a variant that has a pending candidate.
    const desktopImage = cards.nth(2).locator("img");
    await expect(desktopImage).toHaveAttribute("src", /baseline\.png$/);
  });

  test("renders a narrow viewport smaller than a wide one", async ({
    mount,
    page,
  }) => {
    await mockApi(page, [
      [PROJECT_GLOB, PROJECT_CHECKOUT_UI_RESPONSE],
      [KIND_GLOB, makeImageKind()],
      [VARIANTS_GLOB, VISUAL_TEST_VARIANTS],
    ]);

    const component = await mount<typeof Routed>(
      "views/TestOverviewView/Routed",
      { initialRoute: OVERVIEW_ROUTE },
    );

    const cards = component.getByTestId(TEST_ID.testOverviewCard);
    const mobile = await cards.nth(0).boundingBox();
    const desktop = await cards.nth(2).boundingBox();

    // The tiles are scaled relative to the widest viewport, so the size
    // difference is visible instead of every screenshot filling its card.
    expect(mobile?.width ?? 0).toBeLessThan((desktop?.width ?? 0) * 0.6);
  });

  test("opens the comparison for the clicked variant", async ({
    mount,
    page,
  }) => {
    await mockApi(page, [
      [PROJECT_GLOB, PROJECT_CHECKOUT_UI_RESPONSE],
      [KIND_GLOB, makeImageKind()],
      [VARIANTS_GLOB, VISUAL_TEST_VARIANTS],
    ]);

    const component = await mount<typeof Routed>(
      "views/TestOverviewView/Routed",
      { initialRoute: OVERVIEW_ROUTE },
    );

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
    await mockApi(page, [
      [PROJECT_GLOB, PROJECT_CHECKOUT_UI_RESPONSE],
      [KIND_GLOB, makeImageKind()],
      [VARIANTS_GLOB, VISUAL_TEST_VARIANTS],
    ]);

    const component = await mount<typeof Routed>(
      "views/TestOverviewView/Routed",
      { initialRoute: OVERVIEW_ROUTE },
    );

    await component.getByTestId(TEST_ID.testOverviewBack).click();

    // The pending variant (1920x1080 in the fixture) is the review target; the
    // details endpoint rejects a call without a concrete variant.
    await expect.poll(() => page.url()).toContain("viewport=1920x1080");
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

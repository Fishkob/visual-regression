import { test, expect } from "@playwright/test";
import { mockApi, mockReviewBackend } from "./routes/api.routes";
import {
  PDF_TEST_DETAILS_EMPTY,
  PDF_TEST_DETAILS_BASELINE_NO_PAGE_COUNT,
} from "./mocks/pdfTest.mocks";
import {
  makePendingItem,
  makePdfReviewableDetails,
} from "./mocks/reviewLoop.mocks";
import { CHROME_1920_1080_STAGING } from "./mocks/variants";
import type { Routed } from "../../src/views/PdfTestDetailsView.story";
import { TEST_ID } from "@/lib/test-ids";

const ROUTE = `/projects/checkout-ui/tests/invoice?${CHROME_1920_1080_STAGING}`;
const PDF_DETAILS_GLOB = `**/api/v1/projects/checkout-ui/tests/invoice/pdf-details?${CHROME_1920_1080_STAGING}`;

test.describe("PdfTestDetails", () => {
  test("shows the empty state when the test has no data", async ({
    mount,
    page,
  }) => {
    await mockApi(page, [[PDF_DETAILS_GLOB, PDF_TEST_DETAILS_EMPTY]]);

    const component = await mount<typeof Routed>(
      "views/PdfTestDetailsView/Routed",
      { initialRoute: ROUTE },
    );

    await expect(component).toContainText("No PDF test data available");
  });

  test("shows review progress for a pending PDF comparison", async ({
    mount,
    page,
  }) => {
    await mockReviewBackend(page, {
      projectName: "checkout-ui",
      details: new Map([["invoice", makePdfReviewableDetails("invoice")]]),
      pending: [makePendingItem("invoice"), makePendingItem("receipt")],
    });

    const component = await mount<typeof Routed>(
      "views/PdfTestDetailsView/Routed",
      { initialRoute: ROUTE },
    );

    await expect(component.getByTestId(TEST_ID.reviewProgress)).toContainText(
      "1 of 2",
    );
    await expect(component.getByTestId(TEST_ID.pdfComparisonAge)).toBeVisible();
    await expect(component.getByTestId(TEST_ID.shortcutsHint)).toBeVisible();
  });

  test("shows the unknown-page-count hint when the baseline has none", async ({
    mount,
    page,
  }) => {
    await mockApi(page, [
      [PDF_DETAILS_GLOB, PDF_TEST_DETAILS_BASELINE_NO_PAGE_COUNT],
    ]);

    const component = await mount<typeof Routed>(
      "views/PdfTestDetailsView/Routed",
      { initialRoute: ROUTE },
    );

    await expect(component).toContainText(
      "Page count unknown — upload a comparison",
    );
  });
});

import { test, expect } from "@playwright/test";
import { mockApi } from "./routes/api.routes";
import {
  PDF_TEST_DETAILS_EMPTY,
  PDF_TEST_DETAILS_BASELINE_NO_PAGE_COUNT,
} from "./mocks/pdfTest.mocks";
import type { Routed } from "../../src/views/PdfTestDetailsView.story";

const ROUTE =
  "/projects/checkout-ui/tests/invoice?viewport=1920x1080&browser=Chrome&environment=staging";
const PDF_DETAILS_GLOB =
  "**/api/v1/projects/checkout-ui/tests/invoice/pdf-details?viewport=1920x1080&browser=Chrome&environment=staging";

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

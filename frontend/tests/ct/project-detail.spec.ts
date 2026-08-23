import { test, expect } from "@playwright/test";
import { mockApi } from "./routes/api.routes";
import {
  PROJECT_CHECKOUT_UI_RESPONSE,
  PROJECT_EMPTY_RESPONSE,
} from "./mocks/projects.mocks";
import type { Routed } from "../../src/views/ProjectDetailView.story";
import { TEST_ID } from "@/lib/test-ids";

test.describe("ProjectDetail", () => {
  test("shows details", async ({ mount, page }) => {
    await mockApi(page, [
      ["**/api/v1/projects/checkout-ui", PROJECT_CHECKOUT_UI_RESPONSE],
    ]);

    const component = await mount<typeof Routed>(
      "views/ProjectDetailView/Routed",
      { initialRoute: "/projects/checkout-ui" },
    );

    await expect(component).toContainText("Project: checkout-ui");
    await expect(component.getByTestId("table-row")).toHaveCount(9);
  });

  test("filters by viewport and reset", async ({ mount, page }) => {
    await mockApi(page, [
      ["**/api/v1/projects/checkout-ui", PROJECT_CHECKOUT_UI_RESPONSE],
    ]);

    const component = await mount<typeof Routed>(
      "views/ProjectDetailView/Routed",
      { initialRoute: "/projects/checkout-ui" },
    );

    await component.getByTestId(TEST_ID.filterViewport).click();
    await page.getByRole("option", { name: "1920x1080" }).click();

    await expect(component.getByTestId("table-row")).toHaveCount(5);

    await component.getByTestId("reset-filter").click();
    await expect(component.getByTestId("table-row")).toHaveCount(9);
  });

  test("filters by search", async ({ mount, page }) => {
    await mockApi(page, [
      ["**/api/v1/projects/checkout-ui", PROJECT_CHECKOUT_UI_RESPONSE],
    ]);

    const component = await mount<typeof Routed>(
      "views/ProjectDetailView/Routed",
      { initialRoute: "/projects/checkout-ui" },
    );

    await component.getByTestId(TEST_ID.testSearch).fill("checkout");
    await expect(component.getByTestId("table-row")).toHaveCount(6);
  });

  test("shows the empty state for a project without tests", async ({
    mount,
    page,
  }) => {
    await mockApi(page, [
      ["**/api/v1/projects/checkout-ui", PROJECT_EMPTY_RESPONSE],
    ]);

    const component = await mount<typeof Routed>(
      "views/ProjectDetailView/Routed",
      { initialRoute: "/projects/checkout-ui" },
    );

    await expect(component).toContainText("No tests found");

    await component.getByTestId(TEST_ID.tabPdfs).click();
    await expect(component).toContainText("No PDF tests found");
  });

  test("shows an error with retry when loading fails", async ({
    mount,
    page,
  }) => {
    await mockApi(page, [
      [
        "**/api/v1/projects/checkout-ui",
        { status: 500, contentType: "application/json", body: "{}" },
      ],
    ]);

    const component = await mount<typeof Routed>(
      "views/ProjectDetailView/Routed",
      { initialRoute: "/projects/checkout-ui" },
    );

    // The mapper throws on a missing payload, but the query retries with
    // backoff before the error state surfaces, so allow a generous wait.
    await expect(component.getByTestId(TEST_ID.retry)).toBeVisible({ timeout: 15_000 });
    await expect(component).toContainText("Failed to load project");
  });
});

import { test, expect } from "@playwright/test";
import { mockApi } from "./routes/api.routes";
import { PROJECT_CHECKOUT_UI_RESPONSE } from "./mocks/projects.mocks";
import type { Routed } from "../../src/views/ProjectDetailView.story";

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

    await component
      .getByRole("combobox")
      .filter({ hasText: "Viewports" })
      .click();
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

    await component.getByPlaceholder("Search test name…").fill("checkout");
    await expect(component.getByTestId("table-row")).toHaveCount(6);
  });
});

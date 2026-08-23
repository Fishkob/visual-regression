import { test, expect } from "@playwright/test";
import { TEST_ID } from "@/lib/test-ids";

test.describe("NotFound", () => {
  test("shows the 404 state", async ({ mount }) => {
    const component = await mount("views/NotFoundView/NotFound");

    await expect(component).toContainText("404");
  });

  test("shows the back-to-project-list action", async ({ mount }) => {
    const component = await mount("views/NotFoundView/NotFound");

    await expect(
      component.getByTestId(TEST_ID.backToProjectList),
    ).toBeVisible();
  });
});

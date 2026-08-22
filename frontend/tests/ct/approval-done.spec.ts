import { test, expect } from "@playwright/test";

test.describe("ApprovalDone", () => {
  test("shows the completion state", async ({ mount }) => {
    const component = await mount("views/ApprovalDoneView/ApprovalDone");

    await expect(component).toContainText("All comparisons reviewed");
  });

  test("shows the back-to-project-list action", async ({ mount }) => {
    const component = await mount("views/ApprovalDoneView/ApprovalDone");

    await expect(component.getByRole("button")).toContainText(
      "Back to project list",
    );
  });
});

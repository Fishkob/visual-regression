import { expect, test } from "@playwright/test";
import { createProject, deleteProject } from "./fixtures/api";
import { TEST_ID } from "@/lib/test-ids";

let projectName: string;

test.describe("Project webhooks", () => {
  test.beforeEach(async () => {
    projectName = `e2e-webhook-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await createProject(projectName);
  });

  test.afterEach(async () => {
    await deleteProject(projectName);
  });

  test("creates, edits, tests, replays and deletes an endpoint", async ({
    page,
  }) => {
    await page.goto(`/projects/${encodeURIComponent(projectName)}/webhooks`);
    await expect(page.getByTestId(TEST_ID.webhooksView)).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId(TEST_ID.webhooksEmpty)).toBeVisible();

    const url = "https://example.com/e2e-hook";
    await page.getByTestId(TEST_ID.webhookAdd).click();
    await page.getByTestId(TEST_ID.webhookUrlInput).fill(url);
    await page.getByTestId(TEST_ID.webhookEventCheckbox).first().check();
    await page.getByTestId(TEST_ID.webhookSubmit).click();

    await expect(page.getByTestId(TEST_ID.toaster)).toContainText(
      "Webhook endpoint created",
      { timeout: 10000 },
    );
    await expect(page.getByTestId(TEST_ID.webhookSecretDialog)).toBeVisible();
    const secret = (
      (await page.getByTestId(TEST_ID.webhookSecretValue).textContent()) ?? ""
    ).trim();
    expect(secret.length).toBeGreaterThan(10);
    await page.getByTestId(TEST_ID.webhookSecretDone).click({ force: true });

    const row = page.getByTestId(TEST_ID.webhookRow).filter({ hasText: url });
    await expect(row).toBeVisible({ timeout: 10000 });
    await expect(row.getByTestId(TEST_ID.webhookEndpointUrl)).toContainText(
      url,
    );
    await expect(row.getByTestId(TEST_ID.webhookActiveToggle)).toBeChecked();

    const edited = "https://example.com/e2e-hook-edited";
    await row.getByTestId(TEST_ID.webhookEdit).click();
    await page.getByTestId(TEST_ID.webhookUrlInput).fill(edited);
    await page.getByTestId(TEST_ID.webhookSubmit).click();
    await expect(page.getByTestId(TEST_ID.toaster)).toContainText(
      "Webhook endpoint updated",
      { timeout: 10000 },
    );
    const editedRow = page
      .getByTestId(TEST_ID.webhookRow)
      .filter({ hasText: edited });
    await expect(editedRow).toBeVisible({ timeout: 10000 });

    await editedRow.getByTestId(TEST_ID.webhookTest).click();
    await expect(page.getByTestId(TEST_ID.toaster)).toContainText(
      "Test delivery queued",
      { timeout: 10000 },
    );

    await editedRow.getByTestId(TEST_ID.webhookDeliveries).click();
    const delivery = page.getByTestId(TEST_ID.webhookDeliveryRow);
    await expect(delivery.first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId(TEST_ID.webhookDeliveryStatus)).toBeVisible();
    await page.getByTestId(TEST_ID.webhookDeliveriesRefresh).click();
    await expect(delivery.first()).toBeVisible({ timeout: 10000 });

    await delivery.first().getByTestId(TEST_ID.webhookReplay).click();
    await expect(page.getByTestId(TEST_ID.toaster)).toContainText(
      "Delivery replayed",
      { timeout: 10000 },
    );

    await editedRow
      .getByTestId(TEST_ID.webhookActiveToggle)
      .click({ force: true });
    await expect(page.getByTestId(TEST_ID.toaster)).toContainText(
      "Webhook endpoint updated",
      { timeout: 10000 },
    );
    await expect(editedRow).toContainText("Inactive");

    await editedRow.getByTestId(TEST_ID.webhookDelete).click();
    await page.getByTestId(TEST_ID.dialogConfirm).click();
    await expect(page.getByTestId(TEST_ID.toaster)).toContainText(
      "Webhook endpoint deleted",
      { timeout: 10000 },
    );
    await expect(page.getByTestId(TEST_ID.webhooksEmpty)).toBeVisible({
      timeout: 10000,
    });
  });

  test("rejects a loopback endpoint URL", async ({ page }) => {
    await page.goto(`/projects/${encodeURIComponent(projectName)}/webhooks`);
    await page.getByTestId(TEST_ID.webhookAdd).click();
    await page
      .getByTestId(TEST_ID.webhookUrlInput)
      .fill("http://127.0.0.1:9999/hook");
    await page.getByTestId(TEST_ID.webhookEventCheckbox).first().check();
    await page.getByTestId(TEST_ID.webhookSubmit).click();

    await expect(page.getByTestId(TEST_ID.toaster)).toContainText(
      "Could not create webhook endpoint",
      { timeout: 10000 },
    );
    await expect(page.getByTestId(TEST_ID.webhookRow)).toHaveCount(0);
  });
});

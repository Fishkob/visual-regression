import { expect, test } from "@playwright/test";
import { TEST_ID } from "@/lib/test-ids";
import { byText, confirmDialog, expectToast } from "./fixtures/ui";

const API_BASE = "http://localhost:3000/api/v1";

let keyName: string;

test.describe("API keys", () => {
  test.beforeEach(() => {
    keyName = `e2e-key-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  });

  test("creates, uses and deletes a key", async ({ page }) => {
    await page.goto("/api-keys");

    await page.getByTestId(TEST_ID.newApiKey).click();
    await page.getByTestId(TEST_ID.createApiKeyName).fill(keyName);
    // Scope order is upload, read, approve, admin. "read" lets the probe below
    // list projects; "upload" is preselected.
    await page.getByTestId(TEST_ID.apiKeyScope).nth(1).check();
    await page.getByTestId(TEST_ID.createApiKeySubmit).click();

    await expectToast(page, "API key created");
    await expect(page.getByTestId(TEST_ID.apiKeyReveal)).toBeVisible();
    const rawKey = (
      (await page.getByTestId(TEST_ID.apiKeyRevealValue).textContent()) ?? ""
    ).trim();
    expect(rawKey.length).toBeGreaterThan(10);
    await page.getByTestId(TEST_ID.apiKeyCopy).click();
    await page.getByTestId(TEST_ID.apiKeyRevealDone).click({ force: true });

    const row = byText(page, TEST_ID.apiKeyRow, keyName);
    await expect(row).toBeVisible();
    await expect(row.getByTestId(TEST_ID.apiKeyStatus)).toContainText("Active");
    await expect(row.getByTestId(TEST_ID.apiKeyScopes)).toContainText("upload");
    await expect(row.getByTestId(TEST_ID.apiKeyScopes)).toContainText("read");

    // The reveal dialog is the only place the raw key exists; it must work.
    const authorized = await fetch(`${API_BASE}/projects`, {
      headers: { "x-api-key": rawKey },
    });
    expect(authorized.status).toBe(200);

    // Delete is the only action and applies to a used key as well: the
    // credential is gone at once instead of staying as a revoked audit row.
    await row.getByTestId(TEST_ID.deleteApiKey).click();
    await confirmDialog(page);
    await expectToast(page, "API key deleted");
    await expect(byText(page, TEST_ID.apiKeyRow, keyName)).toHaveCount(0);

    const unauthorized = await fetch(`${API_BASE}/projects`, {
      headers: { "x-api-key": rawKey },
    });
    expect(unauthorized.status).toBe(401);
  });

  test("deletes a key that was never used", async ({ page }) => {
    await page.goto("/api-keys");
    await page.getByTestId(TEST_ID.newApiKey).click();
    await page.getByTestId(TEST_ID.createApiKeyName).fill(keyName);
    await page.getByTestId(TEST_ID.createApiKeySubmit).click();
    await expect(page.getByTestId(TEST_ID.apiKeyReveal)).toBeVisible();
    await page.getByTestId(TEST_ID.apiKeyRevealDone).click({ force: true });

    const row = byText(page, TEST_ID.apiKeyRow, keyName);
    await expect(row).toBeVisible();
    await row.getByTestId(TEST_ID.deleteApiKey).click();
    await confirmDialog(page);
    await expectToast(page, "API key deleted");
    await expect(byText(page, TEST_ID.apiKeyRow, keyName)).toHaveCount(0);
  });

  test("refuses to create a key without a name or scope", async ({ page }) => {
    await page.goto("/api-keys");
    await page.getByTestId(TEST_ID.newApiKey).click();
    await expect(page.getByTestId(TEST_ID.createApiKeySubmit)).toBeDisabled();

    await page.getByTestId(TEST_ID.createApiKeyName).fill(keyName);
    // Uncheck the default "upload" scope again: a key needs at least one.
    const upload = page.getByTestId(TEST_ID.apiKeyScope).first();
    await upload.uncheck();
    await expect(page.getByTestId(TEST_ID.createApiKeySubmit)).toBeDisabled();
    await expect(page.getByTestId(TEST_ID.apiKeyAdminWarning)).toHaveCount(0);
  });
});

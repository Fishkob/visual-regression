import { expect, test } from "@playwright/test";
import { TEST_ID } from "@/lib/test-ids";

const API_BASE = "http://localhost:3000/api/v1";

let keyName: string;

test.describe("API keys", () => {
  test.beforeEach(() => {
    keyName = `e2e-key-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  });

  test("creates, uses, rotates and revokes a key", async ({ page }) => {
    await page.goto("/api-keys");

    await page.getByTestId(TEST_ID.newApiKey).click();
    await page.getByTestId(TEST_ID.createApiKeyName).fill(keyName);
    // Scope order is upload, read, approve, admin. "read" lets the probe below
    // list projects; "upload" is preselected.
    await page.getByTestId(TEST_ID.apiKeyScope).nth(1).check();
    await page.getByTestId(TEST_ID.createApiKeySubmit).click();

    await expect(page.getByTestId(TEST_ID.toaster)).toContainText(
      "API key created",
      { timeout: 10000 },
    );
    await expect(page.getByTestId(TEST_ID.apiKeyReveal)).toBeVisible();
    const rawKey = (
      (await page.getByTestId(TEST_ID.apiKeyRevealValue).textContent()) ?? ""
    ).trim();
    expect(rawKey.length).toBeGreaterThan(10);
    await page.getByTestId(TEST_ID.apiKeyCopy).click();
    await page.getByTestId(TEST_ID.apiKeyRevealDone).click({ force: true });

    const row = page
      .getByTestId(TEST_ID.apiKeyRow)
      .filter({ hasText: keyName });
    await expect(row).toBeVisible({ timeout: 10000 });
    await expect(row.getByTestId(TEST_ID.apiKeyStatus)).toContainText("Active");
    await expect(row.getByTestId(TEST_ID.apiKeyScopes)).toContainText("upload");
    await expect(row.getByTestId(TEST_ID.apiKeyScopes)).toContainText("read");
    await expect(row.getByTestId(TEST_ID.apiKeyHint)).toContainText("…");

    // The reveal dialog is the only place the raw key exists; it must work.
    const authorized = await fetch(`${API_BASE}/projects`, {
      headers: { "x-api-key": rawKey },
    });
    expect(authorized.status).toBe(200);

    // Rotate: the new key is revealed once and replaces the old one.
    await row.getByTestId(TEST_ID.rotateApiKey).click();
    await page.getByTestId(TEST_ID.rotateApiKeySubmit).click();
    await expect(page.getByTestId(TEST_ID.toaster)).toContainText(
      "API key rotated",
      { timeout: 10000 },
    );
    const rotatedKey = (
      (await page.getByTestId(TEST_ID.apiKeyRevealValue).textContent()) ?? ""
    ).trim();
    expect(rotatedKey.length).toBeGreaterThan(10);
    expect(rotatedKey).not.toBe(rawKey);
    await page.getByTestId(TEST_ID.apiKeyRevealDone).click({ force: true });

    // Revoke the unused replacement (the row still offers delete while unused).
    // Rotation keeps the predecessor as a second, revoked row with the same
    // name, so the target is the one that is still active.
    const namedRows = page
      .getByTestId(TEST_ID.apiKeyRow)
      .filter({ hasText: keyName });
    await expect(namedRows).toHaveCount(2, { timeout: 10000 });
    const activeRow = namedRows.filter({ hasText: "Active" });
    await activeRow.getByTestId(TEST_ID.revokeApiKey).click();
    await page
      .getByTestId(TEST_ID.revokeApiKeyReason)
      .fill("e2e: replaced by a fresh key");
    await page.getByTestId(TEST_ID.revokeApiKeySubmit).click();
    await expect(page.getByTestId(TEST_ID.toaster)).toContainText(
      "API key revoked",
      { timeout: 10000 },
    );
    const revokedRow = namedRows.filter({
      hasText: "e2e: replaced by a fresh key",
    });
    await expect(revokedRow.getByTestId(TEST_ID.apiKeyStatus)).toContainText(
      "Revoked",
    );

    const unauthorized = await fetch(`${API_BASE}/projects`, {
      headers: { "x-api-key": rotatedKey },
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

    const row = page
      .getByTestId(TEST_ID.apiKeyRow)
      .filter({ hasText: keyName });
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.getByTestId(TEST_ID.deleteApiKey).click();
    await page.getByTestId(TEST_ID.dialogConfirm).click();
    await expect(page.getByTestId(TEST_ID.toaster)).toContainText(
      "API key deleted",
      { timeout: 10000 },
    );
    await expect(
      page.getByTestId(TEST_ID.apiKeyRow).filter({ hasText: keyName }),
    ).toHaveCount(0, { timeout: 10000 });
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

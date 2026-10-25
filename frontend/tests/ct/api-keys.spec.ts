import { expect, test, type Page } from "@playwright/test";
import {
  API_KEYS_EMPTY_RESPONSE,
  API_KEYS_RESPONSE,
  CREATED_API_KEY_RESPONSE,
  REVOKED_API_KEY_RESPONSE,
  ROTATED_API_KEY_RESPONSE,
} from "./mocks/apiKeys.mocks";
import { TEST_ID } from "@/lib/test-ids";

const API_KEYS_PATH = "/api/v1/api-keys";

// The collection endpoint serves the list (GET) and the create (POST), so the
// mock dispatches on the method instead of on the URL.
async function mockApiKeysBackend(
  page: Page,
  list = API_KEYS_RESPONSE,
): Promise<void> {
  await page.route(`**${API_KEYS_PATH}`, (route) => {
    const isCreate = route.request().method() === "POST";
    return route.fulfill(isCreate ? CREATED_API_KEY_RESPONSE : list);
  });
  await page.route(`**${API_KEYS_PATH}/*/rotate`, (route) =>
    route.fulfill(ROTATED_API_KEY_RESPONSE),
  );
  await page.route(`**${API_KEYS_PATH}/*/revoke`, (route) =>
    route.fulfill(REVOKED_API_KEY_RESPONSE),
  );
  await page.route(`**${API_KEYS_PATH}/*`, (route) =>
    route.request().method() === "DELETE"
      ? route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true }),
        })
      : route.continue(),
  );
}

test.describe("API keys", () => {
  test("lists keys with status, hint and last use", async ({ mount, page }) => {
    await mockApiKeysBackend(page);

    const component = await mount("views/ApiKeysView/ApiKeys");
    const rows = component.getByTestId(TEST_ID.apiKeyRow);

    await expect(rows).toHaveCount(4);

    const neverUsed = rows.filter({ hasText: "design-review" });
    await expect(neverUsed.getByTestId(TEST_ID.apiKeyStatus)).toHaveText(
      "Active",
    );
    await expect(neverUsed.getByTestId(TEST_ID.apiKeyHint)).toHaveText("…ab12");
    await expect(neverUsed.getByTestId(TEST_ID.apiKeyLastUsed)).toContainText(
      "Never used",
    );

    const retiring = rows.filter({ hasText: "release-check" });
    await expect(retiring.getByTestId(TEST_ID.apiKeyStatus)).toHaveText(
      "Retiring",
    );

    const retired = rows.filter({ hasText: "retired-ci" });
    await expect(retired.getByTestId(TEST_ID.apiKeyStatus)).toHaveText(
      "Revoked",
    );
    await expect(retired.getByTestId(TEST_ID.apiKeyLastUsed)).toContainText(
      "rotated",
    );
  });

  test("shows the empty state when no key exists", async ({ mount, page }) => {
    await mockApiKeysBackend(page, API_KEYS_EMPTY_RESPONSE);

    const component = await mount("views/ApiKeysView/ApiKeys");

    await expect(component).toContainText("No API keys yet");
  });

  test("offers delete only for keys that were never used", async ({
    mount,
    page,
  }) => {
    await mockApiKeysBackend(page);

    const component = await mount("views/ApiKeysView/ApiKeys");
    const rows = component.getByTestId(TEST_ID.apiKeyRow);

    await expect(
      rows
        .filter({ hasText: "design-review" })
        .getByTestId(TEST_ID.deleteApiKey),
    ).toBeVisible();
    await expect(
      rows.filter({ hasText: "ci-upload" }).getByTestId(TEST_ID.deleteApiKey),
    ).toHaveCount(0);
  });

  test("creates a key and reveals it exactly once", async ({ mount, page }) => {
    await mockApiKeysBackend(page);

    const component = await mount("views/ApiKeysView/ApiKeys");

    await component.getByTestId(TEST_ID.newApiKey).click();

    const nameInput = page.getByTestId(TEST_ID.createApiKeyName);
    const submit = page.getByTestId(TEST_ID.createApiKeySubmit);

    await expect(nameInput).toBeVisible();
    await expect(submit).toBeDisabled();

    await nameInput.fill("nightly");

    const request = page.waitForRequest(
      (candidate) =>
        candidate.method() === "POST" &&
        new URL(candidate.url()).pathname === API_KEYS_PATH,
    );
    await submit.click();

    const body = JSON.parse((await request).postData() ?? "{}");
    expect(body).toEqual({ name: "nightly" });

    await expect(page.getByTestId(TEST_ID.apiKeyReveal)).toBeVisible();
    await expect(page.getByTestId(TEST_ID.apiKeyRevealValue)).toHaveText(
      "raw-secret-value-7f3a",
    );
  });

  test("rotates a key and reveals the successor", async ({ mount, page }) => {
    await mockApiKeysBackend(page);

    const component = await mount("views/ApiKeysView/ApiKeys");
    const row = component
      .getByTestId(TEST_ID.apiKeyRow)
      .filter({ hasText: "design-review" });

    await row.getByTestId(TEST_ID.rotateApiKey).click();

    const request = page.waitForRequest(
      (candidate) =>
        candidate.method() === "POST" &&
        new URL(candidate.url()).pathname === `${API_KEYS_PATH}/k2/rotate`,
    );

    await page.getByTestId(TEST_ID.rotateApiKeySubmit).click();

    expect(JSON.parse((await request).postData() ?? "{}")).toEqual({});

    await expect(page.getByTestId(TEST_ID.apiKeyRevealValue)).toHaveText(
      "rotated-secret-value-ab12",
    );
  });

  test("rotates with an explicit lifetime", async ({ mount, page }) => {
    await mockApiKeysBackend(page);

    const component = await mount("views/ApiKeysView/ApiKeys");
    const row = component
      .getByTestId(TEST_ID.apiKeyRow)
      .filter({ hasText: "design-review" });

    await row.getByTestId(TEST_ID.rotateApiKey).click();
    await page.getByTestId(TEST_ID.rotateApiKeyExpiry).click();
    await page.getByRole("option", { name: "90 days" }).click();

    const request = page.waitForRequest(
      (candidate) =>
        candidate.method() === "POST" &&
        new URL(candidate.url()).pathname === `${API_KEYS_PATH}/k2/rotate`,
    );
    await page.getByTestId(TEST_ID.rotateApiKeySubmit).click();

    expect(JSON.parse((await request).postData() ?? "{}")).toEqual({
      expiresInDays: 90,
    });
  });

  test("rotates into a key that never expires", async ({ mount, page }) => {
    await mockApiKeysBackend(page);

    const component = await mount("views/ApiKeysView/ApiKeys");
    const row = component
      .getByTestId(TEST_ID.apiKeyRow)
      .filter({ hasText: "design-review" });

    await row.getByTestId(TEST_ID.rotateApiKey).click();
    await page.getByTestId(TEST_ID.rotateApiKeyExpiry).click();
    await page.getByRole("option", { name: "Never" }).click();

    const request = page.waitForRequest(
      (candidate) =>
        candidate.method() === "POST" &&
        new URL(candidate.url()).pathname === `${API_KEYS_PATH}/k2/rotate`,
    );
    await page.getByTestId(TEST_ID.rotateApiKeySubmit).click();

    // An explicit null is what turns the expiry off; omitting the field would
    // mean "inherit the previous key's remaining lifetime" instead.
    expect(JSON.parse((await request).postData() ?? "{}")).toEqual({
      expiresInDays: null,
    });
  });

  test("revokes a key with the entered reason", async ({ mount, page }) => {
    await mockApiKeysBackend(page);

    const component = await mount("views/ApiKeysView/ApiKeys");
    const row = component
      .getByTestId(TEST_ID.apiKeyRow)
      .filter({ hasText: "design-review" });

    await row.getByTestId(TEST_ID.revokeApiKey).click();
    await page.getByTestId(TEST_ID.revokeApiKeyReason).fill("leaked");

    const request = page.waitForRequest(
      (candidate) =>
        candidate.method() === "POST" &&
        new URL(candidate.url()).pathname === `${API_KEYS_PATH}/k2/revoke`,
    );

    await page.getByTestId(TEST_ID.revokeApiKeySubmit).click();

    expect(JSON.parse((await request).postData() ?? "{}")).toEqual({
      reason: "leaked",
    });
    await expect(page.getByTestId(TEST_ID.revokeApiKeyReason)).toBeHidden();
  });
});

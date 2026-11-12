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
  // The create dialog's project allowlist picker reads the project list when it
  // opens; the mock keeps that request off the Vite proxy.
  await page.route("**/api/v1/projects/pending*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          { id: "p1", name: "checkout-ui" },
          { id: "p2", name: "admin-ui" },
        ],
      }),
    }),
  );
  // One row action per lifecycle step: delete removes, rotate answers with the
  // successor's one-time key, revoke returns the row it retired.
  await page.route(`**${API_KEYS_PATH}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "DELETE") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
      return;
    }
    if (request.method() === "POST" && path.endsWith("/rotate")) {
      await route.fulfill(ROTATED_API_KEY_RESPONSE);
      return;
    }
    if (request.method() === "POST" && path.endsWith("/revoke")) {
      await route.fulfill(REVOKED_API_KEY_RESPONSE);
      return;
    }
    await route.continue();
  });
}

test.describe("API keys", () => {
  test("lists keys with status and last use", async ({ mount, page }) => {
    await mockApiKeysBackend(page);

    const component = await mount("views/ApiKeysView/ApiKeys");
    const rows = component.getByTestId(TEST_ID.apiKeyRow);

    await expect(rows).toHaveCount(4);

    const neverUsed = rows.filter({ hasText: "design-review" });
    await expect(neverUsed.getByTestId(TEST_ID.apiKeyStatus)).toHaveText(
      "Active",
    );
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

  test("offers delete on every row", async ({ mount, page }) => {
    await mockApiKeysBackend(page);

    const component = await mount("views/ApiKeysView/ApiKeys");
    const rows = component.getByTestId(TEST_ID.apiKeyRow);

    await expect(rows).toHaveCount(4);
    await expect(
      rows
        .filter({ hasText: "design-review" })
        .getByTestId(TEST_ID.deleteApiKey),
    ).toBeVisible();
    await expect(
      rows.filter({ hasText: "ci-upload" }).getByTestId(TEST_ID.deleteApiKey),
    ).toBeVisible();
    // A revoked key can be removed as well: the row is not the audit trail.
    await expect(
      rows.filter({ hasText: "retired-ci" }).getByTestId(TEST_ID.deleteApiKey),
    ).toBeVisible();
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
    expect(body).toEqual({
      name: "nightly",
      scopes: ["upload"],
      projectNames: [],
    });

    await expect(page.getByTestId(TEST_ID.apiKeyReveal)).toBeVisible();
    await expect(page.getByTestId(TEST_ID.apiKeyRevealValue)).toHaveText(
      "raw-secret-value-7f3a",
    );
  });

  test("caps the key name at 50 characters", async ({ mount, page }) => {
    await mockApiKeysBackend(page);

    const component = await mount("views/ApiKeysView/ApiKeys");
    await component.getByTestId(TEST_ID.newApiKey).click();

    const nameInput = page.getByTestId(TEST_ID.createApiKeyName);
    await expect(nameInput).toHaveAttribute("maxlength", "50");

    // The browser cuts typed and pasted input at maxlength, so the request can
    // never carry a longer name.
    await nameInput.fill("x".repeat(60));
    await expect(nameInput).toHaveValue("x".repeat(50));
  });

  test("deletes a used key after confirming", async ({ mount, page }) => {
    await mockApiKeysBackend(page);

    const component = await mount("views/ApiKeysView/ApiKeys");
    const row = component
      .getByTestId(TEST_ID.apiKeyRow)
      .filter({ hasText: "ci-upload" });

    await row.getByTestId(TEST_ID.deleteApiKey).click();

    await expect(page.getByTestId(TEST_ID.dialogDescription)).toContainText(
      "ci-upload is deleted permanently",
    );

    const request = page.waitForRequest(
      (candidate) =>
        candidate.method() === "DELETE" &&
        new URL(candidate.url()).pathname === `${API_KEYS_PATH}/k1`,
    );
    await page.getByTestId(TEST_ID.dialogConfirm).click();

    expect((await request).method()).toBe("DELETE");
  });

  test("offers rotate only for active keys and revoke for every live key", async ({
    mount,
    page,
  }) => {
    await mockApiKeysBackend(page);

    const component = await mount("views/ApiKeysView/ApiKeys");
    const rows = component.getByTestId(TEST_ID.apiKeyRow);
    await expect(rows).toHaveCount(4);

    const active = rows.filter({ hasText: "ci-upload" });
    await expect(active.getByTestId(TEST_ID.rotateApiKey)).toBeVisible();
    await expect(active.getByTestId(TEST_ID.revokeApiKey)).toBeVisible();

    // A retiring key is already replaced: revoking it early is useful, a second
    // rotation would mint another successor.
    const retiring = rows.filter({ hasText: "release-check" });
    await expect(retiring.getByTestId(TEST_ID.rotateApiKey)).toHaveCount(0);
    await expect(retiring.getByTestId(TEST_ID.revokeApiKey)).toBeVisible();

    // A revoked key authenticates nothing; only the hard delete remains.
    const revoked = rows.filter({ hasText: "retired-ci" });
    await expect(revoked.getByTestId(TEST_ID.rotateApiKey)).toHaveCount(0);
    await expect(revoked.getByTestId(TEST_ID.revokeApiKey)).toHaveCount(0);
  });

  test("rotates a key after a grace window and reveals the successor", async ({
    mount,
    page,
  }) => {
    await mockApiKeysBackend(page);

    const component = await mount("views/ApiKeysView/ApiKeys");
    const row = component
      .getByTestId(TEST_ID.apiKeyRow)
      .filter({ hasText: "ci-upload" });
    await row.getByTestId(TEST_ID.rotateApiKey).click();

    const grace = page.getByTestId(TEST_ID.rotateApiKeyGrace);
    await expect(grace).toHaveValue("60");
    await grace.fill("15");

    const request = page.waitForRequest(
      (candidate) =>
        candidate.method() === "POST" &&
        new URL(candidate.url()).pathname === `${API_KEYS_PATH}/k1/rotate`,
    );
    await page.getByTestId(TEST_ID.rotateApiKeySubmit).click();

    expect(JSON.parse((await request).postData() ?? "{}")).toEqual({
      graceMinutes: 15,
    });
    await expect(page.getByTestId(TEST_ID.apiKeyReveal)).toBeVisible();
    await expect(page.getByTestId(TEST_ID.apiKeyRevealValue)).toHaveText(
      "rotated-secret-value-9c1d",
    );
  });

  test("revokes a key with a reason and keeps the row", async ({
    mount,
    page,
  }) => {
    await mockApiKeysBackend(page);

    const component = await mount("views/ApiKeysView/ApiKeys");
    const row = component
      .getByTestId(TEST_ID.apiKeyRow)
      .filter({ hasText: "ci-upload" });
    await row.getByTestId(TEST_ID.revokeApiKey).click();

    const reason = page.getByTestId(TEST_ID.revokeApiKeyReason);
    await reason.fill("compromised in CI");

    const request = page.waitForRequest(
      (candidate) =>
        candidate.method() === "POST" &&
        new URL(candidate.url()).pathname === `${API_KEYS_PATH}/k1/revoke`,
    );
    await page.getByTestId(TEST_ID.revokeApiKeySubmit).click();

    expect(JSON.parse((await request).postData() ?? "{}")).toEqual({
      reason: "compromised in CI",
    });
    await expect(reason).toBeHidden();
    // Revoking keeps the row; only Delete removes it.
    await expect(component.getByTestId(TEST_ID.apiKeyRow)).toHaveCount(4);
  });
});

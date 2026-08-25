import { Page } from "@playwright/test";
import { TEST_ID } from "@/lib/test-ids";

const ADMIN_USER = process.env.E2E_ADMIN_USERNAME ?? "admin";
const ADMIN_PASS = process.env.E2E_ADMIN_PASSWORD ?? "admin-secret";

// Logs in through the UI so the browser has a session cookie. Requires the
// backend to have a bootstrapped admin (BOOTSTRAP_ADMIN_USERNAME/PASSWORD)
// or a pre-created user matching E2E_ADMIN_USERNAME/E2E_ADMIN_PASSWORD.
export async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByTestId(TEST_ID.loginUsername).fill(ADMIN_USER);
  await page.getByTestId(TEST_ID.loginPassword).fill(ADMIN_PASS);
  await page.getByTestId(TEST_ID.loginSubmit).click();
  await page.waitForURL(/\/$/);
}

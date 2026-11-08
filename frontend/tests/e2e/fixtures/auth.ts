import { Page } from "@playwright/test";
import { TEST_ID } from "@/lib/test-ids";

const ADMIN_USER = process.env.E2E_ADMIN_USERNAME ?? "admin";
const ADMIN_PASS = process.env.E2E_ADMIN_PASSWORD ?? "admin-secret";

export async function loginAs(
  page: Page,
  username: string,
  password: string,
): Promise<void> {
  await page.goto("/login");
  await page.getByTestId(TEST_ID.loginUsername).fill(username);
  await page.getByTestId(TEST_ID.loginPassword).fill(password);
  await page.getByTestId(TEST_ID.loginSubmit).click();
}

// Logs in through the UI so the browser has a session cookie. Requires the
// backend to have a bootstrapped admin (BOOTSTRAP_ADMIN_USERNAME/PASSWORD)
// or a pre-created user matching E2E_ADMIN_USERNAME/E2E_ADMIN_PASSWORD.
//
// A freshly bootstrapped admin carries a temporary password and is sent to
// /change-password on first login; the CI workflow replaces that password
// before the suite runs, so landing there means the environment still holds the
// temporary one. Say so instead of waiting out the navigation timeout.
export async function loginAsAdmin(page: Page): Promise<void> {
  await loginAs(page, ADMIN_USER, ADMIN_PASS);
  await page.waitForURL(/\/(change-password)?$/, { waitUntil: "load" });
  if (page.url().includes("/change-password")) {
    throw new Error(
      `"${ADMIN_USER}" still has a temporary password: complete the first-login change once (the CI workflow does) so E2E_ADMIN_PASSWORD is the current password`,
    );
  }
}

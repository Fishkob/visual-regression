import { Page } from "@playwright/test";
import { TEST_ID } from "@/lib/test-ids";

const ADMIN_USER = process.env.E2E_ADMIN_USERNAME ?? "admin";
const ADMIN_PASS = process.env.E2E_ADMIN_PASSWORD ?? "admin-secret";
// A bootstrapped admin starts with a temporary password and must change it on
// first login (CONTEXT: the session only unlocks /auth/* until then). The
// fixture completes that step once and keeps using the final password, so a
// retried setup or a re-run against the same database still logs in.
const ADMIN_PASS_FINAL = `${ADMIN_PASS}-changed`;

type LoginState = "app" | "change-password" | "rejected";

async function attemptLogin(page: Page, password: string): Promise<LoginState> {
  await page.goto("/login");
  await page.getByTestId(TEST_ID.loginUsername).fill(ADMIN_USER);
  await page.getByTestId(TEST_ID.loginPassword).fill(password);
  await page.getByTestId(TEST_ID.loginSubmit).click();

  try {
    await page.waitForURL(/\/(change-password)?$/, {
      timeout: 10_000,
      waitUntil: "load",
    });
  } catch {
    return "rejected";
  }
  return page.url().includes("/change-password") ? "change-password" : "app";
}

// Logs in through the UI so the browser has a session cookie. Requires the
// backend to have a bootstrapped admin (BOOTSTRAP_ADMIN_USERNAME/PASSWORD)
// or a pre-created user matching E2E_ADMIN_USERNAME/E2E_ADMIN_PASSWORD.
export async function loginAsAdmin(page: Page): Promise<void> {
  const state = await attemptLogin(page, ADMIN_PASS);

  if (state === "app") {
    return;
  }

  if (state === "rejected") {
    // The temporary password was already replaced by an earlier run.
    if ((await attemptLogin(page, ADMIN_PASS_FINAL)) === "app") {
      return;
    }
    throw new Error(
      `Cannot log in as "${ADMIN_USER}": neither the temporary nor the changed password was accepted`,
    );
  }

  await page.getByTestId(TEST_ID.changePasswordCurrent).fill(ADMIN_PASS);
  await page.getByTestId(TEST_ID.changePasswordNew).fill(ADMIN_PASS_FINAL);
  await page.getByTestId(TEST_ID.changePasswordConfirm).fill(ADMIN_PASS_FINAL);
  await page.getByTestId(TEST_ID.changePasswordSubmit).click();
  await page.waitForURL(/\/$/, { waitUntil: "load" });
}

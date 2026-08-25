import { fileURLToPath } from "url";
import { test as setup } from "@playwright/test";
import { loginAsAdmin } from "../fixtures/auth";

// Frontend dir is three levels up (tests/e2e/setup -> frontend). The config
// references the same file via a config-relative path (playwright/.auth/user.json).
export const AUTH_STATE_PATH = fileURLToPath(
  new URL("../../../playwright/.auth/user.json", import.meta.url),
);

setup("authenticate as admin", async ({ page }) => {
  await loginAsAdmin(page);
  await page.context().storageState({ path: AUTH_STATE_PATH });
});

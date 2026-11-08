import { expect, type Locator, type Page } from "@playwright/test";
import { TEST_ID } from "@/lib/test-ids";

// Assertions carry no timeout of their own: playwright-e2e.config.ts sets a
// single 10s expect timeout for the suite.
export async function expectToast(
  page: Page,
  text: string | RegExp,
): Promise<void> {
  await expect(page.getByTestId(TEST_ID.toaster)).toContainText(text);
}

export async function confirmDialog(page: Page): Promise<void> {
  await page.getByTestId(TEST_ID.dialogConfirm).click();
}

// A row, card or section located by its test id and a data value in its text.
export function byText(
  scope: Page | Locator,
  testId: string,
  text: string,
): Locator {
  return scope.getByTestId(testId).filter({ hasText: text });
}

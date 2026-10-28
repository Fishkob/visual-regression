import { expect, type Page } from "@playwright/test";
import { TEST_ID } from "@/lib/test-ids";

export interface ApprovalOptions {
  reason?: "INTENDED_CHANGE" | "FLAKE" | "INFRA";
  note?: string;
}

// Approving always passes through the decision dialog (reason + note). Tests
// that only care about the state change use this helper instead of re-deriving
// the dialog's two steps.
export async function approveCurrentComparison(
  page: Page,
  options: ApprovalOptions = {},
): Promise<void> {
  await page.getByTestId(TEST_ID.approveChanges).click();
  await expect(page.getByTestId(TEST_ID.approveConfirm)).toBeVisible({
    timeout: 10000,
  });
  if (options.reason) {
    const labels = {
      INTENDED_CHANGE: "Intended change",
      FLAKE: "Flake",
      INFRA: "Infra",
    } as const;
    await page.getByTestId(TEST_ID.approveReason).click();
    await page.getByRole("option", { name: labels[options.reason] }).click();
  }
  if (options.note) {
    await page.getByTestId(TEST_ID.approveNote).fill(options.note);
  }
  await page.getByTestId(TEST_ID.approveConfirm).click();
}

export function variantQuery(
  viewport = "1920x1080",
  browser = "Chrome",
  environment = "staging",
): string {
  return `?viewport=${encodeURIComponent(viewport)}&browser=${encodeURIComponent(browser)}&environment=${encodeURIComponent(environment)}`;
}

export function testUrl(
  project: string,
  testName: string,
  viewport = "1920x1080",
  browser = "Chrome",
  environment = "staging",
  extra: Record<string, string> = {},
): string {
  const query = new URLSearchParams({
    viewport,
    browser,
    environment,
    ...extra,
  });
  return `/projects/${encodeURIComponent(project)}/tests/${encodeURIComponent(testName)}?${query.toString()}`;
}

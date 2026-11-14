import { expect, type Page } from "@playwright/test";

import { mockApi } from "../ct/routes/api.routes";
import type { QualityCase, Theme } from "./cases";

const DISABLE_ANIMATIONS =
  "*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important;caret-color:transparent!important}";

export async function preparePage(page: Page, theme: Theme): Promise<void> {
  await page.addInitScript(
    ({ nextTheme, css }) => {
      const apply = () => {
        localStorage.setItem("theme", nextTheme);
        document.documentElement.classList.toggle("dark", nextTheme === "dark");
        const style = document.createElement("style");
        style.textContent = css;
        document.documentElement.appendChild(style);
      };
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", apply, { once: true });
      } else {
        apply();
      }
    },
    { nextTheme: theme, css: DISABLE_ANIMATIONS },
  );
  await page.evaluate((nextTheme) => {
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
  }, theme);
  await page.addStyleTag({ content: DISABLE_ANIMATIONS });
  await page.clock.setFixedTime(new Date("2026-10-22T12:00:00Z"));
}

export async function waitForReady(
  page: Page,
  testId: string,
  theme: Theme,
): Promise<void> {
  await expect(page.getByTestId(testId).first()).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  const isDark = await page.evaluate(() =>
    document.documentElement.classList.contains("dark"),
  );
  expect(isDark).toBe(theme === "dark");
}

// An uncaught exception during render leaves the DOM plausible enough for a
// screenshot and for an axe scan: the case "passes" while the page is broken in
// a tab or a dialog nobody opened. Collecting them turns that into a failure
// with the message, for every case the gallery mounts.
export function collectPageErrors(page: Page): string[] {
  const messages: string[] = [];
  page.on("pageerror", (error) => messages.push(error.message));
  return messages;
}

// The string a gallery case is mounted by. Structural on purpose: the specs get
// Playwright's `mount` fixture, and this file does not need to import the CT
// types to take it.
export type MountStory = (
  story: string,
  props?: Record<string, unknown>,
) => Promise<unknown>;

// The single place that turns a case into a page: mocks, theme, mount, wait,
// and — when the case is about an overlay — the interaction that opens it. Both
// quality specs call this, so a case cannot be prepared one way for the shot and
// another for the scan.
export async function mountQualityCase(
  page: Page,
  mount: MountStory,
  qualityCase: QualityCase,
  theme: Theme,
): Promise<string[]> {
  const pageErrors = collectPageErrors(page);

  if (qualityCase.routes) {
    await mockApi(page, qualityCase.routes);
  }
  await preparePage(page, theme);
  await mount(qualityCase.story, qualityCase.props);
  await waitForReady(page, qualityCase.readyTestId, theme);
  if (qualityCase.readyAlsoTestId) {
    for (const testId of [qualityCase.readyAlsoTestId].flat()) {
      await expect(page.getByTestId(testId).first()).toBeVisible();
    }
  }
  if (qualityCase.openTestId) {
    await page.getByTestId(qualityCase.openTestId).first().click();
    await expect(
      page.getByTestId(qualityCase.overlayTestId).first(),
    ).toBeVisible();
  }

  return pageErrors;
}

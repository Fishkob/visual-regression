import { expect, type Page } from "@playwright/test";

import type { Theme } from "./cases";

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

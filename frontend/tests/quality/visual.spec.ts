import { expect, test } from "@playwright/test";

import { mockApi } from "../ct/routes/api.routes";
import { QUALITY_CASES, THEMES } from "./cases";
import { preparePage, waitForReady } from "./theme";

for (const qualityCase of QUALITY_CASES) {
  for (const theme of THEMES) {
    test(`${qualityCase.name} (${theme})`, async ({ mount, page }) => {
      if (qualityCase.routes) {
        await mockApi(page, qualityCase.routes);
      }
      await preparePage(page, theme);
      await mount(qualityCase.story, qualityCase.props);
      await waitForReady(page, qualityCase.readyTestId, theme);
      if (qualityCase.readyAlsoTestId) {
        await expect(
          page.getByTestId(qualityCase.readyAlsoTestId).first(),
        ).toBeVisible();
      }

      const mask = qualityCase.maskTestIds?.map((id) => page.getByTestId(id));

      await expect(page).toHaveScreenshot(`${qualityCase.name}-${theme}.png`, {
        fullPage: true,
        ...(mask && mask.length > 0 ? { mask } : {}),
      });
    });
  }
}

import { expect, test } from "@playwright/test";

import { QUALITY_CASES, THEMES } from "./cases";
import { mountQualityCase } from "./theme";

// A case that carries a `scanOnly` reason is reached and scanned by the a11y
// spec but not photographed: it is an overlay, and the page beneath it already
// has a baseline. The reason is required by `gallery-coverage.test.ts`, so a
// case cannot quietly drop out of the shot.
const PHOTOGRAPHED = QUALITY_CASES.filter(
  (qualityCase) => qualityCase.scanOnly === undefined,
);

for (const qualityCase of PHOTOGRAPHED) {
  for (const theme of THEMES) {
    test(`${qualityCase.name} (${theme})`, async ({ mount, page }) => {
      const pageErrors = await mountQualityCase(
        page,
        mount,
        qualityCase,
        theme,
      );

      const mask = qualityCase.maskTestIds?.map((id) => page.getByTestId(id));

      await expect(page).toHaveScreenshot(`${qualityCase.name}-${theme}.png`, {
        fullPage: true,
        ...(mask && mask.length > 0 ? { mask } : {}),
      });
      expect(pageErrors, pageErrors.join("\n")).toEqual([]);
    });
  }
}

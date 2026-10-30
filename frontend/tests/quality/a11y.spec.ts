import AxeBuilder from "@axe-core/playwright";
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
        for (const testId of [qualityCase.readyAlsoTestId].flat()) {
          await expect(page.getByTestId(testId).first()).toBeVisible();
        }
      }

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();

      // axe files low-contrast text over tinted/translucent backgrounds as
      // `incomplete` (it cannot always resolve the composited colour). Those
      // are exactly the cases this gate exists for, so they block too.
      const unverifiedContrast = results.incomplete.filter(
        (result) => result.id === "color-contrast",
      );
      const blocking = [
        ...results.violations.filter(
          (violation) =>
            violation.impact === "serious" || violation.impact === "critical",
        ),
        ...unverifiedContrast,
      ];

      const messages = blocking.map(
        (violation) =>
          `${violation.id} (${violation.impact}): ${violation.help}\n  ${violation.nodes
            .map((node) => node.target.join(" "))
            .join("\n  ")}`,
      );

      expect(messages, messages.join("\n\n")).toEqual([]);
    });
  }
}

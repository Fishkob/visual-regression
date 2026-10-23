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
        await expect(
          page.getByTestId(qualityCase.readyAlsoTestId).first(),
        ).toBeVisible();
      }

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();

      const blocking = results.violations.filter(
        (violation) =>
          violation.impact === "serious" || violation.impact === "critical",
      );

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

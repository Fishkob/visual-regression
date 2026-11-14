import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { QUALITY_CASES, THEMES } from "./cases";
import { overlayContrastReport } from "./contrast";
import { mountQualityCase } from "./theme";

for (const qualityCase of QUALITY_CASES) {
  for (const theme of THEMES) {
    test(`${qualityCase.name} (${theme})`, async ({ mount, page }) => {
      // Mounting is shared with the visual spec, including the click that opens
      // an overlay case: the scan must read the same page the shot photographs.
      const pageErrors = await mountQualityCase(
        page,
        mount,
        qualityCase,
        theme,
      );
      const isOverlay = qualityCase.openTestId !== undefined;

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();

      // axe files low-contrast text over tinted/translucent backgrounds as
      // `incomplete` (it cannot always resolve the composited colour). On a page
      // at rest those are exactly the cases this gate exists for, so they block.
      //
      // Inside a dialog the same rule is filed for *every* text node — the
      // content is `position: fixed` over the page, so axe reports "background
      // color could not be determined because it partially overlaps other
      // elements" no matter how good the contrast is. Keeping it blocking there
      // would make an overlay un-scannable rather than safe, so the overlay
      // cases answer the question directly instead: `overlayContrastFailures`
      // resolves the opaque background behind each text node and measures the
      // WCAG ratio against it. That is the same property, measured where axe
      // gives up, and it is not a blanket exemption — a real `violation` still
      // blocks, and the measured ratio blocks below 4.5:1 (3:1 for large text).
      const unverifiedContrast = results.incomplete.filter(
        (result) => result.id === "color-contrast",
      );
      const blocking = [
        ...results.violations.filter(
          (violation) =>
            violation.impact === "serious" || violation.impact === "critical",
        ),
        ...(isOverlay ? [] : unverifiedContrast),
      ];

      const messages = blocking.map(
        (violation) =>
          `${violation.id} (${violation.impact}): ${violation.help}\n  ${violation.nodes
            .map((node) => node.target.join(" "))
            .join("\n  ")}`,
      );

      expect(messages, messages.join("\n\n")).toEqual([]);

      if (isOverlay) {
        const report = await overlayContrastReport(
          page,
          qualityCase.overlayTestId,
        );
        const contrastMessages = report.failures.map(
          (failure) =>
            `${failure.target}: ${failure.ratio}:1 < ${failure.required}:1 — "${failure.text}"`,
        );
        // The measured check is the gate for contrast inside an overlay, so it
        // has to prove it looked at something: a report that inspected nothing
        // (or could not resolve a background) would pass every dialog.
        expect(
          report.inspected,
          "text nodes measured for contrast",
        ).toBeGreaterThan(0);
        expect(report.unresolvable, report.unresolvable.join("\n")).toEqual([]);
        expect(contrastMessages, contrastMessages.join("\n")).toEqual([]);
      }

      expect(pageErrors, pageErrors.join("\n")).toEqual([]);
    });
  }
}

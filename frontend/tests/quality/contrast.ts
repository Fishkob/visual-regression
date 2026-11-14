import type { Page } from "@playwright/test";

// Contrast inside an overlay, measured instead of inferred.
//
// axe cannot answer the question there: a dialog is `position: fixed` over the
// page, so its text "partially overlaps other elements" and the rule is filed as
// `incomplete` with "background color could not be determined" — for every text
// node in every dialog, no matter how good the contrast is. Since the a11y gate
// treats an unresolvable contrast as a failure, overlays could either stay
// unscanned or be scanned by a rule that cannot see them.
//
// This resolves the question the way a browser would: walk to the nearest
// ancestor with a *fully opaque* background, then compute the WCAG 2.1 relative
// luminance ratio. It is the same property axe checks, measured where axe gives
// up.
//
// Two details that make it real rather than decorative:
//
// 1. Colours are resolved through a canvas, not a regex. Tailwind v4 emits
//    `oklch(...)` and `getComputedStyle` keeps that notation, so a parser that
//    only understands `rgb()` finds no background at all and silently passes
//    every overlay. The canvas normalises any CSS colour to sRGB bytes.
// 2. A text node with no opaque background behind it is *reported*, not skipped:
//    "I could not tell" is what made the axe rule useless here, and skipping it
//    would repeat the same mistake one level down.

export interface ContrastFailure {
  target: string;
  text: string;
  ratio: number;
  required: number;
}

export interface ContrastReport {
  /** Text nodes whose contrast was measured. */
  inspected: number;
  /** Text nodes with no opaque background behind them — unverifiable. */
  unresolvable: string[];
  failures: ContrastFailure[];
}

/** WCAG 2.1 AA: 4.5:1 for body text, 3:1 for large text. */
const BODY_RATIO = 4.5;
const LARGE_RATIO = 3;
/** Large text per WCAG: 24px, or 18.66px when bold. */
const LARGE_PX = 24;
const LARGE_BOLD_PX = 18.66;

export async function overlayContrastReport(
  page: Page,
  overlayTestId: string,
): Promise<ContrastReport> {
  return page.evaluate(
    ({ testId, bodyRatio, largeRatio, largePx, largeBoldPx }) => {
      const marker = document.querySelector(`[data-testid="${testId}"]`);
      if (!marker) {
        throw new Error(`overlay marker "${testId}" is not in the DOM`);
      }
      // The marker is whatever proves the overlay is open — an input, a list, a
      // description. The dialog is the nearest role="dialog" above it.
      const root = marker.closest('[role="dialog"]') ?? marker;

      type Rgba = [number, number, number, number];

      // A 1x1 canvas is the browser's own colour parser: it accepts every
      // notation `getComputedStyle` can return and yields sRGB bytes.
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("no 2d context to resolve colours");
      const cache = new Map<string, Rgba>();

      const parseColor = (value: string): Rgba | null => {
        const cached = cache.get(value);
        if (cached) return cached;
        // Reset first: an unparseable value would leave the previous fillStyle.
        context.fillStyle = "#000000";
        context.fillStyle = value;
        context.clearRect(0, 0, 1, 1);
        context.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
        const parsed: Rgba = [r, g, b, a / 255];
        cache.set(value, parsed);
        return parsed;
      };

      const channel = (value: number): number => {
        const scaled = value / 255;
        return scaled <= 0.03928
          ? scaled / 12.92
          : ((scaled + 0.055) / 1.055) ** 2.4;
      };

      const luminance = ([r, g, b]: Rgba): number =>
        0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

      const contrastRatio = (a: Rgba, b: Rgba): number => {
        const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
        return (high + 0.05) / (low + 0.05);
      };

      // The first background that is not see-through. A translucent surface is
      // not an answer: what sits behind it belongs to another element.
      const opaqueBackground = (element: Element): Rgba | null => {
        let node: Element | null = element;
        while (node) {
          const parsed = parseColor(getComputedStyle(node).backgroundColor);
          if (parsed && parsed[3] === 1) return parsed;
          node = node.parentElement;
        }
        return null;
      };

      const ownsText = (element: Element): boolean =>
        Array.from(element.childNodes).some(
          (node) =>
            node.nodeType === Node.TEXT_NODE &&
            (node.textContent ?? "").trim() !== "",
        );

      const describe = (element: Element): string => {
        const name = element.tagName.toLowerCase();
        const id = element.getAttribute("data-testid");
        return id ? `${name}[${id}]` : name;
      };

      const report = {
        inspected: 0,
        unresolvable: [] as string[],
        failures: [] as {
          target: string;
          text: string;
          ratio: number;
          required: number;
        }[],
      };

      for (const element of Array.from(root.querySelectorAll("*"))) {
        if (!ownsText(element)) continue;

        const style = getComputedStyle(element);
        if (style.visibility === "hidden" || style.display === "none") continue;
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;

        const text = (element.textContent ?? "").trim();
        const foreground = parseColor(style.color);
        const background = opaqueBackground(element);
        if (!foreground || !background) {
          report.unresolvable.push(
            `${describe(element)} "${text.slice(0, 40)}"`,
          );
          continue;
        }

        report.inspected += 1;

        const size = Number.parseFloat(style.fontSize);
        const weight = Number(style.fontWeight) || 400;
        const large = size >= largePx || (size >= largeBoldPx && weight >= 700);
        const required = large ? largeRatio : bodyRatio;
        const ratio = contrastRatio(foreground, background);

        if (ratio < required) {
          report.failures.push({
            target: describe(element),
            text: text.slice(0, 60),
            ratio: Math.round(ratio * 100) / 100,
            required,
          });
        }
      }

      return report;
    },
    {
      testId: overlayTestId,
      bodyRatio: BODY_RATIO,
      largeRatio: LARGE_RATIO,
      largePx: LARGE_PX,
      largeBoldPx: LARGE_BOLD_PX,
    },
  );
}

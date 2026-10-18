# Theme Quality Guardrails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Catch theme and contrast regressions with semantic colour tokens, Axe scans, and light/dark Playwright screenshots for every gallery story.

**Architecture:** Add semantic status/surface tokens and a lint rule that bans raw palette utilities, then add a Docker-run quality suite (`playwright-quality.config.ts`) with one visual spec and one Axe spec sharing a central list of seven gallery stories. Linux baselines are produced and checked in the same pinned image locally and in CI.

**Tech Stack:** Vue 3, Tailwind v4, ESLint 10 flat config, Vitest, Playwright 1.64, `@axe-core/playwright`, Docker, GitHub Actions.

---

### Task 1: Add semantic theme tokens

**Files:**

- Modify: `frontend/src/style.css:33-45` (`@theme inline`)
- Modify: `frontend/src/style.css:99-135` (`.dark`)
- Modify: `frontend/src/style.css:56-97` (`:root`)

- [ ] **Step 1: Expose the new tokens to Tailwind**

In the `@theme inline` block, after `--color-destructive-foreground`, add:

```css
--color-status-neutral: var(--status-neutral);
--color-status-success: var(--status-success);
--color-status-info: var(--status-info);
--color-status-warning: var(--status-warning);
--color-status-danger: var(--status-danger);
--color-image-canvas: var(--image-canvas);
--color-overlay: var(--overlay);
```

- [ ] **Step 2: Define light-mode values**

In `:root`, replace the existing `--destructive-foreground` line with:

```css
--destructive-foreground: oklch(0.985 0 0);
--status-neutral: oklch(0.446 0.043 257.281);
--status-success: oklch(0.508 0.118 165.612);
--status-info: oklch(0.5 0.134 242.749);
--status-warning: oklch(0.555 0.163 48.998);
--status-danger: oklch(0.505 0.213 27.518);
--image-canvas: oklch(1 0 0);
--overlay: oklch(0 0 0);
```

- [ ] **Step 3: Define dark-mode values**

In `.dark`, replace the existing `--destructive-foreground` line with:

```css
--destructive-foreground: oklch(0.985 0 0);
--status-neutral: oklch(0.869 0.022 252.894);
--status-success: oklch(0.845 0.143 164.978);
--status-info: oklch(0.827 0.111 230.318);
--status-warning: oklch(0.879 0.169 91.605);
--status-danger: oklch(0.808 0.114 19.571);
--image-canvas: oklch(1 0 0);
--overlay: oklch(0 0 0);
```

- [ ] **Step 4: Verify the frontend still builds**

Run:

```bash
pnpm --filter ./frontend build
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/style.css
git commit -m "feat(frontend): add semantic status and surface tokens"
```

---

### Task 2: Add the raw-colour detector

**Files:**

- Create: `frontend/src/lib/raw-color-utilities.ts`
- Test: `frontend/src/__tests__/raw-color-utilities.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/__tests__/raw-color-utilities.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { findRawColorUtilities } from "@/lib/raw-color-utilities";

describe("findRawColorUtilities", () => {
  it("finds raw background and text colours", () => {
    expect(findRawColorUtilities("bg-white text-gray-700")).toEqual([
      "bg-white",
      "text-gray-700",
    ]);
  });

  it("finds variants, opacity modifiers, and important modifiers", () => {
    expect(
      findRawColorUtilities(
        "hover:bg-slate-500 dark:text-white bg-black/80 !bg-red-600",
      ),
    ).toEqual([
      "hover:bg-slate-500",
      "dark:text-white",
      "bg-black/80",
      "!bg-red-600",
    ]);
  });

  it("finds border, ring, and gradient utilities", () => {
    expect(
      findRawColorUtilities(
        "border-t-gray-200 ring-offset-white from-blue-500 via-rose-400",
      ),
    ).toEqual([
      "border-t-gray-200",
      "ring-offset-white",
      "from-blue-500",
      "via-rose-400",
    ]);
  });

  it("allows semantic tokens", () => {
    expect(
      findRawColorUtilities(
        "bg-card text-foreground border-border bg-status-success text-status-danger bg-image-canvas bg-overlay/80 text-destructive-foreground",
      ),
    ).toEqual([]);
  });

  it("ignores non-colour utilities", () => {
    expect(
      findRawColorUtilities(
        "text-sm border-2 bg-transparent shadow-lg divide-y",
      ),
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm --filter ./frontend test src/__tests__/raw-color-utilities.test.ts
```

Expected: FAIL with `Cannot find module '@/lib/raw-color-utilities'`.

- [ ] **Step 3: Implement the detector**

Create `frontend/src/lib/raw-color-utilities.ts`:

```ts
const COLOR_PREFIXES = [
  "bg",
  "text",
  "border",
  "border-x",
  "border-y",
  "border-t",
  "border-r",
  "border-b",
  "border-l",
  "ring",
  "ring-offset",
  "outline",
  "fill",
  "stroke",
  "from",
  "via",
  "to",
  "divide",
  "divide-x",
  "divide-y",
  "decoration",
  "accent",
  "caret",
] as const;

const PALETTE_NAMES = [
  "white",
  "black",
  "slate",
  "gray",
  "zinc",
  "neutral",
  "stone",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
] as const;

const RAW_COLOR_UTILITY = new RegExp(
  `^(?:${COLOR_PREFIXES.join("|")})-(?:${PALETTE_NAMES.join("|")})(?:-\\d{2,3})?(?:\\/\\d{1,3})?$`,
);

// Splits on whitespace, strips every variant prefix (`hover:`, `dark:`), the
// important modifier (`!`), then matches the remaining utility against the
// palette. Semantic tokens such as `bg-card` and `bg-status-success` do not
// match because their names are not in PALETTE_NAMES.
export function findRawColorUtilities(className: string): string[] {
  return className
    .split(/\s+/)
    .filter(Boolean)
    .filter((part) => {
      const utility = part.slice(part.lastIndexOf(":") + 1).replace(/^!/, "");
      return RAW_COLOR_UTILITY.test(utility);
    });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
pnpm --filter ./frontend test src/__tests__/raw-color-utilities.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/raw-color-utilities.ts frontend/src/__tests__/raw-color-utilities.test.ts
git commit -m "feat(frontend): detect raw palette utilities in class names"
```

---

### Task 3: Enforce token discipline and migrate existing raw colours

**Files:**

- Modify: `frontend/eslint.config.ts`
- Modify: `frontend/src/domains/test-status/display.ts`
- Modify: `frontend/src/components/ImageDisplay.vue`
- Modify: `frontend/src/components/detail-panels/InteractiveImageViewer.vue`
- Modify: `frontend/src/components/TestComparisonInfo.vue`
- Modify: `frontend/src/components/ErrorBoundary.vue`
- Modify: `frontend/src/components/tables/RowActionsCell.vue`
- Modify: `frontend/src/components/pdf/PdfPageViewer.vue`
- Modify: `frontend/src/views/ApprovalDoneView.vue`
- Modify: `frontend/src/components/ConfirmDialog.vue`
- Modify: `frontend/src/components/ui/button/index.ts`
- Modify: `frontend/src/components/ui/badge/index.ts`
- Modify: `frontend/src/components/ui/alert-dialog/AlertDialogContent.vue`
- Test: `frontend/src/__tests__/useTestStatusBadge.test.ts`

- [ ] **Step 1: Add the custom rule to ESLint**

At the top of `frontend/eslint.config.ts`, add the import:

```ts
import { findRawColorUtilities } from "./src/lib/raw-color-utilities.ts";
```

After `const noTextSelectors: Rule.RuleModule = { ... };`, add:

```ts
const noRawColors: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require semantic theme tokens instead of raw palette utilities",
    },
    messages: {
      rawColor:
        "Raw colour utility '{{ utility }}' — use a semantic theme token (bg-card, text-foreground, border-border, …).",
    },
    schema: [],
  },
  create(context) {
    const reported = new Set<object>();

    const check = (node: Rule.Node, value: string) => {
      const utilities = findRawColorUtilities(value);
      if (utilities.length === 0 || reported.has(node)) return;
      reported.add(node);
      context.report({
        node,
        messageId: "rawColor",
        data: { utility: utilities.join(", ") },
      });
    };

    return {
      VAttribute(node) {
        const key = node.key;
        let name: string | undefined;
        if (key.type === "VIdentifier") {
          name = key.name;
        } else if (
          key.type === "VDirectiveKey" &&
          key.argument?.type === "VIdentifier"
        ) {
          name = key.argument.name;
        }
        if (name !== "class") return;
        if (node.value?.type === "VLiteral") {
          check(node.value as Rule.Node, node.value.value);
        }
      },
      Literal(node) {
        if (typeof node.value === "string") {
          check(node as Rule.Node, node.value);
        }
      },
      TemplateElement(node) {
        check(node as Rule.Node, node.value.cooked ?? node.value.raw);
      },
    };
  },
};
```

Then add this config block after the existing `files: ["**/*.ts"]` block:

```ts
  {
    files: ["src/**/*.vue", "src/**/*.ts"],
    ignores: [
      "src/**/__tests__/**",
      "src/**/*.test.ts",
      "src/lib/raw-color-utilities.ts",
    ],
    plugins: {
      theme: { rules: { "no-raw-colors": noRawColors } },
    },
    rules: {
      "theme/no-raw-colors": "error",
    },
  },
```

- [ ] **Step 2: Run lint to verify it goes red**

Run:

```bash
pnpm --filter ./frontend lint:check
```

Expected: FAIL with `Raw colour utility` messages in `display.ts`, `ImageDisplay.vue`, `InteractiveImageViewer.vue`, `TestComparisonInfo.vue`, `ErrorBoundary.vue`, `RowActionsCell.vue`, `PdfPageViewer.vue`, `ApprovalDoneView.vue`, `ConfirmDialog.vue`, `ui/button/index.ts`, `ui/badge/index.ts`, and `AlertDialogContent.vue`.

- [ ] **Step 3: Migrate status colours**

In `frontend/src/domains/test-status/display.ts`, replace the four class strings:

```ts
export const unknownStatusConfig: StatusConfig = {
  class: "border-status-neutral text-status-neutral",
  icon: "help-circle",
  label: "Baseline only",
};

const unchangedConfig: StatusConfig = {
  class: "border-status-success text-status-success",
  icon: "check",
  label: "Unchanged",
};

const statusConfig: Record<StatusValue, StatusConfig> = {
  [STATUS.PENDING]: {
    class: "border-status-info text-status-info",
    icon: "clock",
    label: "No baseline",
  },
  [STATUS.UNCHANGED]: unchangedConfig,
  [STATUS.PENDING_APPROVAL]: {
    class: "border-status-warning text-status-warning",
    icon: "clock",
    label: "Pending",
  },
  [STATUS.APPROVED]: {
    ...unchangedConfig,
    label: "Approved",
  },
};
```

- [ ] **Step 4: Migrate image surfaces and status dots**

In `frontend/src/components/ImageDisplay.vue`, replace the dot map and classes:

```ts
const dotColor = computed(() => {
  return (
    {
      green: "bg-status-success",
      blue: "bg-status-info",
      red: "bg-status-danger",
    } as const
  )[props.border];
});
```

```html
<div
  class="rounded-3xl border border-border bg-image-canvas shadow p-4 flex flex-col gap-4 w-full"
>
  <div
    class="flex items-center gap-2 text-sm font-medium text-foreground/80 pt-1"
  ></div>
</div>
```

In `frontend/src/components/detail-panels/InteractiveImageViewer.vue`, replace the three dots:

```ts
        dotClass: "bg-status-success",
```

```ts
        dotClass: "bg-status-info",
```

```ts
        dotClass: "bg-status-danger",
```

Replace the panel and label classes:

```html
class="rounded-3xl border border-border bg-image-canvas shadow p-4"
```

```html
class="flex items-center gap-2 text-sm font-medium text-foreground/80 mb-3"
```

- [ ] **Step 5: Migrate the comparison info and error colours**

In `frontend/src/components/TestComparisonInfo.vue`, replace:

```html
class="flex items-center gap-1 bg-muted border border-border px-2 py-1
rounded-md"
```

```html
<span class="text-muted-foreground text-xs">px</span>
```

```html
          <span class="font-bold text-status-danger"
```

```html
          <span class="font-bold text-status-danger"
```

In `frontend/src/components/ErrorBoundary.vue`, replace:

```html
<div class="text-status-danger text-lg font-semibold">Something went wrong</div>
```

In `frontend/src/components/tables/RowActionsCell.vue`, replace:

```html
class="text-status-danger focus:text-status-danger cursor-pointer"
```

In `frontend/src/components/pdf/PdfPageViewer.vue`, replace:

```html
<span class="text-sm text-status-danger">Failed to load page {{ page }}</span>
```

In `frontend/src/views/ApprovalDoneView.vue`, replace:

```html
<CheckCircle class="w-12 h-12 text-status-success" />
```

- [ ] **Step 6: Migrate destructive foreground and the modal overlay**

In `frontend/src/components/ConfirmDialog.vue`, replace:

```ts
return "bg-destructive text-destructive-foreground hover:bg-destructive/90";
```

In `frontend/src/components/ui/button/index.ts`, replace:

```ts
        destructive:
          "bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
```

In `frontend/src/components/ui/badge/index.ts`, replace:

```ts
        destructive:
          "border-transparent bg-destructive text-destructive-foreground [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
```

In `frontend/src/components/ui/alert-dialog/AlertDialogContent.vue`, replace:

```html
class="data-[state=open]:animate-in data-[state=closed]:animate-out
data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50
bg-overlay/80"
```

- [ ] **Step 7: Update the status badge assertions**

In `frontend/src/__tests__/useTestStatusBadge.test.ts`, replace the badge prop assertions:

```ts
it("includes pending styling for PENDING_APPROVAL", () => {
  const badge = getStatusBadge("PENDING_APPROVAL");

  expect(badge.props!.class).toContain("border-status-warning");
  expect(badge.props!.class).toContain("text-status-warning");
});

it("shows no-baseline styling for PENDING instead of the fallback", () => {
  const badge = getStatusBadge("PENDING");

  expect(badge.props!.class).toContain("border-status-info");
  expect(badge.props!.class).toContain("text-status-info");
  expect(badge.props!.class).not.toContain("text-status-neutral");
});

it("includes ok styling for non-pending statuses", () => {
  const badge = getStatusBadge("APPROVED");

  expect(badge.props!.class).toContain("border-status-success");
  expect(badge.props!.class).toContain("text-status-success");
});
```

- [ ] **Step 8: Verify lint and unit tests are green**

Run:

```bash
pnpm --filter ./frontend lint:check
pnpm --filter ./frontend test
```

Expected: both PASS. `rg` for raw colours in production files returns no matches:

```bash
rg -n "\b(bg|text|border|ring|outline|fill|stroke|from|via|to|divide|decoration|accent|caret)-(white|black|gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(-[0-9]{2,3})?\b" frontend/src --glob '*.vue' --glob '*.ts' --glob '!**/__tests__/**'
```

Expected: no output.

- [ ] **Step 9: Commit**

```bash
git add frontend/eslint.config.ts frontend/src
git commit -m "feat(frontend): enforce semantic colour tokens"
```

---

### Task 4: Add the quality suite infrastructure

**Files:**

- Modify: `frontend/package.json`
- Modify: `frontend/src/lib/test-ids.ts`
- Modify: `frontend/src/views/PdfTestDetailsView.vue`
- Create: `frontend/playwright-quality.config.ts`
- Create: `frontend/tests/quality/cases.ts`
- Create: `frontend/tests/quality/theme.ts`

- [ ] **Step 1: Install Axe**

Run:

```bash
pnpm --filter ./frontend add -D @axe-core/playwright
```

Expected: `frontend/package.json` and `pnpm-lock.yaml` updated.

- [ ] **Step 2: Add the quality scripts**

In `frontend/package.json`, after `"test-e2e"`, add:

```json
    "test-visual": "playwright test -c playwright-quality.config.ts visual.spec.ts",
    "test-a11y": "playwright test -c playwright-quality.config.ts a11y.spec.ts"
```

- [ ] **Step 3: Add the PDF readiness test id**

In `frontend/src/lib/test-ids.ts`, after `pdfPageNavigation`, add:

```ts
  pdfPageCountUnknown: "pdf-page-count-unknown",
```

In `frontend/src/views/PdfTestDetailsView.vue`, add the import:

```ts
import { TEST_ID } from "@/lib/test-ids";
```

Then add the test id to the unknown-page-count div:

```html
<div
  v-else-if="data?.baseline"
  class="flex items-center justify-center min-h-[200px] text-muted-foreground"
  :data-testid="TEST_ID.pdfPageCountUnknown"
>
  Page count unknown — upload a comparison
</div>
```

- [ ] **Step 4: Create the Playwright quality config**

Create `frontend/playwright-quality.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/quality",
  testMatch: ["**/*.spec.ts"],
  snapshotPathTemplate: "{testDir}/__screenshots__/{arg}{ext}",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://localhost:5173/playwright/gallery/index.html",
    viewport: { width: 1440, height: 900 },
    serviceWorkers: "block",
    reuseContext: true,
    reducedMotion: "reduce",
    trace: "retain-on-failure",
  },
  projects: [{ name: "quality" }],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:5173/playwright/gallery/index.html",
    reuseExistingServer: !process.env.CI,
  },
});
```

- [ ] **Step 5: Create the central case list**

Create `frontend/tests/quality/cases.ts`:

```ts
import { TEST_ID } from "@/lib/test-ids";

import {
  PROJECT_CHECKOUT_UI_RESPONSE,
  PROJECTS_PENDING_RESPONSE,
} from "../ct/mocks/projects.mocks";
import { PDF_TEST_DETAILS_BASELINE_NO_PAGE_COUNT } from "../ct/mocks/pdfTest.mocks";
import { CHROME_1920_1080_STAGING } from "../ct/mocks/variants";
import {
  VISUAL_TEST_DETAILS_PENDING,
  VISUAL_TEST_PENDING_META,
} from "../ct/mocks/visualTest.mocks";

type MockRoute = [
  glob: string,
  response: { status: number; contentType: string; body: string },
];

export type Theme = "light" | "dark";

export const THEMES: Theme[] = ["light", "dark"];

export interface QualityCase {
  name: string;
  story: string;
  props?: Record<string, unknown>;
  routes?: MockRoute[];
  readyTestId: string;
}

const PROJECTS_GLOB = "**/api/v1/projects/pending*";
const PROJECT_DETAILS_GLOB = "**/api/v1/projects/checkout-ui";
const VISUAL_DETAILS_ROUTE = `/projects/checkout-ui/tests/checkout-flow?${CHROME_1920_1080_STAGING}`;
const VISUAL_DETAILS_GLOB = `**/api/v1/projects/checkout-ui/tests/checkout-flow?${CHROME_1920_1080_STAGING}`;
const VISUAL_PENDING_GLOB =
  "**/api/v1/projects/checkout-ui/tests/meta/pending*";
const PDF_DETAILS_ROUTE = `/projects/checkout-ui/tests/invoice?${CHROME_1920_1080_STAGING}`;
const PDF_DETAILS_GLOB = `**/api/v1/projects/checkout-ui/tests/invoice/pdf-details?${CHROME_1920_1080_STAGING}`;

export const QUALITY_CASES: QualityCase[] = [
  {
    name: "projects",
    story: "views/ProjectsView/Projects",
    routes: [[PROJECTS_GLOB, PROJECTS_PENDING_RESPONSE]],
    readyTestId: TEST_ID.projectTable,
  },
  {
    name: "project-detail",
    story: "views/ProjectDetailView/Routed",
    props: { initialRoute: "/projects/checkout-ui" },
    routes: [[PROJECT_DETAILS_GLOB, PROJECT_CHECKOUT_UI_RESPONSE]],
    readyTestId: TEST_ID.tableRow,
  },
  {
    name: "visual-test-details",
    story: "views/VisualTestDetailsView/Routed",
    props: { initialRoute: VISUAL_DETAILS_ROUTE },
    routes: [
      [VISUAL_DETAILS_GLOB, VISUAL_TEST_DETAILS_PENDING],
      [VISUAL_PENDING_GLOB, VISUAL_TEST_PENDING_META],
    ],
    readyTestId: TEST_ID.comparisonView,
  },
  {
    name: "pdf-test-details",
    story: "views/PdfTestDetailsView/Routed",
    props: { initialRoute: PDF_DETAILS_ROUTE },
    routes: [[PDF_DETAILS_GLOB, PDF_TEST_DETAILS_BASELINE_NO_PAGE_COUNT]],
    readyTestId: TEST_ID.pdfPageCountUnknown,
  },
  {
    name: "approval-done",
    story: "views/ApprovalDoneView/ApprovalDone",
    readyTestId: TEST_ID.doneHeading,
  },
  {
    name: "not-found",
    story: "views/NotFoundView/NotFound",
    readyTestId: TEST_ID.backToProjectList,
  },
  {
    name: "app-shell",
    story: "AppShell/AppShell",
    props: { initialRoute: "/" },
    routes: [[PROJECTS_GLOB, PROJECTS_PENDING_RESPONSE]],
    readyTestId: TEST_ID.projectTable,
  },
];
```

- [ ] **Step 6: Create the theme and readiness helpers**

Create `frontend/tests/quality/theme.ts`:

```ts
import { expect, type Page } from "@playwright/test";

import type { Theme } from "./cases";

export async function preparePage(page: Page, theme: Theme): Promise<void> {
  await page.evaluate((nextTheme) => {
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
  }, theme);
  await page.addStyleTag({
    content:
      "*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important;caret-color:transparent!important}",
  });
}

export async function waitForReady(page: Page, testId: string): Promise<void> {
  await expect(page.getByTestId(testId).first()).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}
```

- [ ] **Step 7: Wire the new specs into lint and typecheck**

In `frontend/package.json`, extend both ESLint file globs with
`tests/quality/**/*.ts`:

```json
    "lint": "eslint \"src/**/*.{ts,vue}\" \"playwright/gallery/**/*.ts\" \"tests/ct/**/*.ts\" \"tests/e2e/**/*.ts\" \"tests/quality/**/*.ts\" \"playwright-ct.config.ts\" \"playwright-quality.config.ts\" --fix",
    "lint:check": "eslint \"src/**/*.{ts,vue}\" \"playwright/gallery/**/*.ts\" \"tests/ct/**/*.ts\" \"tests/e2e/**/*.ts\" \"tests/quality/**/*.ts\" \"playwright-ct.config.ts\" \"playwright-quality.config.ts\"",
```

In `frontend/tsconfig.playwright.json`, add `tests/quality/**/*.ts` to `include`:

```json
    "tests/ct/**/*.ts",
    "tests/quality/**/*.ts"
```

In `frontend/eslint.config.ts`, add the quality paths to the Playwright rules
block:

```ts
    files: [
      "playwright/**/*.ts",
      "tests/pages/**/*.ts",
      "tests/ct/**/*.ts",
      "tests/e2e/**/*.ts",
      "tests/quality/**/*.ts",
      "playwright-ct.config.ts",
      "playwright-quality.config.ts",
    ],
```

- [ ] **Step 8: Commit**

```bash
git add frontend/package.json pnpm-lock.yaml frontend/src/lib/test-ids.ts frontend/src/views/PdfTestDetailsView.vue frontend/playwright-quality.config.ts frontend/tests/quality/cases.ts frontend/tests/quality/theme.ts
git commit -m "test(frontend): scaffold theme quality suites"
```

---

### Task 5: Add visual and accessibility specs

**Files:**

- Create: `frontend/tests/quality/visual.spec.ts`
- Create: `frontend/tests/quality/a11y.spec.ts`
- Modify: `frontend/src/components/detail-panels/InteractiveImageViewer.vue`
- Modify: `frontend/src/components/TestComparisonInfo.vue`
- Modify: `frontend/src/views/ProjectsView.vue`
- Modify: `frontend/src/components/tables/TestFilterBar.vue`
- Modify: `frontend/src/components/tables/ProjectTable.vue`
- Modify: `frontend/src/components/tables/RowActionsCell.vue`

- [ ] **Step 1: Add the visual spec**

Create `frontend/tests/quality/visual.spec.ts`:

```ts
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
      await waitForReady(page, qualityCase.readyTestId);

      await expect(page).toHaveScreenshot(`${qualityCase.name}-${theme}.png`, {
        fullPage: true,
      });
    });
  }
}
```

- [ ] **Step 2: Add the Axe spec**

Create `frontend/tests/quality/a11y.spec.ts`:

```ts
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
      await waitForReady(page, qualityCase.readyTestId);

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();

      const blocking = results.violations.filter(
        (violation) =>
          violation.impact === "serious" || violation.impact === "critical",
      );

      expect(
        blocking,
        blocking
          .map(
            (violation) =>
              `${violation.id} (${violation.impact}): ${violation.help}\n  ${violation.nodes
                .map((node) => node.target.join(" "))
                .join("\n  ")}`,
          )
          .join("\n\n"),
      ).toEqual([]);
    });
  }
}
```

- [ ] **Step 3: Add the known accessible names**

These inputs/buttons have no text or label and will be reported by the `label` /
`button-name` rules:

In `frontend/src/views/ProjectsView.vue`, add:

```html
aria-label="Search projects"
```

In `frontend/src/components/tables/TestFilterBar.vue`, add to the search input:

```html
aria-label="Search tests"
```

And to each of the four `SelectTrigger` elements:

```html
aria-label="Filter by viewport"
```

```html
aria-label="Filter by browser"
```

```html
aria-label="Filter by environment"
```

```html
aria-label="Filter by status"
```

In `frontend/src/components/TestComparisonInfo.vue`, add to the number input:

```html
aria-label="Mismatch threshold in pixels"
```

In `frontend/src/components/detail-panels/InteractiveImageViewer.vue`, add to
the three zoom buttons:

```html
aria-label="Zoom out"
```

```html
aria-label="Zoom in"
```

```html
aria-label="Reset zoom"
```

In `frontend/src/components/tables/ProjectTable.vue`, add to the actions button:

```ts
              {
                variant: "ghost",
                size: "icon",
                class: "h-7 w-7 p-0",
                "aria-label": "Project actions",
              },
```

In `frontend/src/components/tables/RowActionsCell.vue`, make the default
trigger a real button with an accessible name:

```html
<button
  type="button"
  class="p-2 rounded-md hover:bg-muted cursor-pointer inline-flex items-center justify-center"
  aria-label="Row actions"
  :data-testid="testId"
>
  <MoreVertical class="w-4 h-4" />
</button>
```

- [ ] **Step 4: Typecheck the new specs**

Run:

```bash
pnpm --filter ./frontend typecheck
```

Expected: PASS.

- [ ] **Step 5: Verify both specs are discovered**

Run:

```bash
pnpm --filter ./frontend exec playwright test -c playwright-quality.config.ts --list
```

Expected: lists 28 tests (14 visual + 14 Axe).

- [ ] **Step 6: Commit**

```bash
git add frontend/tests/quality frontend/src
git commit -m "test(frontend): add light/dark visual and axe suites"
```

---

### Task 6: Run the quality suites in Docker

**Files:**

- Create: `frontend/Dockerfile.quality`
- Create: `scripts/quality.sh`

- [ ] **Step 1: Create the quality image**

Create `frontend/Dockerfile.quality`:

```dockerfile
FROM node:26-bookworm

WORKDIR /app

COPY package.json ./
RUN PNPM_VERSION="$(node -p "require('./package.json').packageManager.split('@').pop()")" && npm install -g "pnpm@${PNPM_VERSION}"

RUN npx --yes playwright@1.64.0 install --with-deps chromium

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY frontend/package.json ./frontend/
COPY client-sdk/package.json ./client-sdk/
COPY backend/package.json ./backend/

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY frontend ./frontend
COPY client-sdk ./client-sdk

WORKDIR /app/frontend
```

- [ ] **Step 2: Create the runner script**

Create `scripts/quality.sh`:

```bash
#!/bin/bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

MODE="${1:-}"
if [ "$MODE" != "visual" ] && [ "$MODE" != "a11y" ]; then
    echo "Usage: ./scripts/quality.sh [visual|a11y] [--update] [--no-build]"
    exit 1
fi
shift

UPDATE=0
NO_BUILD=0
for arg in "$@"; do
    case "$arg" in
        --update) UPDATE=1 ;;
        --no-build) NO_BUILD=1 ;;
        *)
            echo "Unknown option: $arg"
            echo "Usage: ./scripts/quality.sh [visual|a11y] [--update] [--no-build]"
            exit 1
            ;;
    esac
done

IMAGE="${QUALITY_IMAGE:-visual-regression-frontend-quality:local}"

if [ "$NO_BUILD" -eq 0 ]; then
    docker build -f frontend/Dockerfile.quality -t "$IMAGE" .
fi

if [ "$UPDATE" -eq 1 ]; then
    if [ "$MODE" != "visual" ]; then
        echo "--update is only supported for the visual suite"
        exit 1
    fi
    mkdir -p frontend/tests/quality/__screenshots__
    docker run --rm \
        -v "$PROJECT_ROOT/frontend/tests/quality/__screenshots__:/app/frontend/tests/quality/__screenshots__" \
        "$IMAGE" \
        pnpm "test-$MODE" --update-snapshots
else
    docker run --rm "$IMAGE" pnpm "test-$MODE"
fi
```

- [ ] **Step 3: Make the script executable**

Run:

```bash
chmod +x scripts/quality.sh
```

- [ ] **Step 4: Commit**

```bash
git add frontend/Dockerfile.quality scripts/quality.sh
git commit -m "test(frontend): run theme quality suites in docker"
```

---

### Task 7: Generate and verify the visual baselines

**Files:**

- Create: `frontend/tests/quality/__screenshots__/*.png` (14 files)

- [ ] **Step 1: Generate the baselines**

Run:

```bash
./scripts/quality.sh visual --update
```

Expected: 14 screenshots written to
`frontend/tests/quality/__screenshots__/` and all tests pass with
`--update-snapshots`.

- [ ] **Step 2: Verify the dark project list baseline**

Open `frontend/tests/quality/__screenshots__/projects-dark.png`. Expected: the
table container and sticky Project column share the same dark surface; no white
table body.

- [ ] **Step 3: Verify the baselines are stable**

Run:

```bash
./scripts/quality.sh visual
```

Expected: PASS, 14 tests. No `--update-snapshots`.

- [ ] **Step 4: Run again to prove determinism**

Run the same command a second time.

Expected: PASS again.

- [ ] **Step 5: Commit**

```bash
git add frontend/tests/quality/__screenshots__
git commit -m "test(frontend): add light/dark visual baselines"
```

---

### Task 8: Make the Axe suite green

**Files:**

- Modify: files reported by the failure (expected: contrast and accessible-name fixes in `style.css`, components, and views)

- [ ] **Step 1: Run the Axe suite**

Run:

```bash
./scripts/quality.sh a11y
```

Expected on the first run: FAIL with one or more `serious`/`critical`
violations. The failure message lists rule id, impact, and selectors.

- [ ] **Step 2: Fix contrast violations**

For every `color-contrast` violation, move the affected token one step towards
more contrast:

- light mode text on light surfaces: use a 700+ step
- dark mode text on dark surfaces: use a 300 or lighter step
- prefer changing the semantic token (`--status-*`, `--muted-foreground`) over
  adding per-component colour overrides

Re-run the suite after each change.

- [ ] **Step 3: Fix accessible-name violations**

For `label` and `button-name` violations, add `aria-label` (inputs, icon-only
buttons) or visible text. Use the names already added in Task 5 where the
violation points at those elements.

- [ ] **Step 4: Verify the suite passes for all 14 cases**

Run:

```bash
./scripts/quality.sh a11y
```

Expected: PASS, 14 tests, no serious/critical WCAG A/AA violations.

- [ ] **Step 5: Re-run the visual suite**

Any contrast token change can move pixels, so run:

```bash
./scripts/quality.sh visual --update
./scripts/quality.sh visual
```

Expected: baselines updated once, then PASS on the second run.

- [ ] **Step 6: Commit**

```bash
git add frontend/src frontend/tests/quality/__screenshots__
git commit -m "fix(frontend): resolve light/dark accessibility violations"
```

---

### Task 9: Add the CI job and document the commands

**Files:**

- Modify: `.github/workflows/ci-frontend.yml`
- Modify: `AGENTS.md`
- Modify: `frontend/AGENTS.md`

- [ ] **Step 1: Add the CI job**

In `.github/workflows/ci-frontend.yml`, after the `frontend-ct` job, add:

```yaml
frontend-quality:
  name: Frontend Theme Quality
  # The committed baselines are Linux arm64. This must stay a native arm64
  # runner: Chromium crashes under QEMU on amd64 (verified locally).
  runs-on: ubuntu-24.04-arm
  needs: [build]
  if: github.event.inputs.skipTests != 'true'

  steps:
    - uses: actions/checkout@v7
    - uses: ./.github/actions/setup
      with:
        generate-prisma: "false"

    - name: Verify arm64 runner
      run: test "$(uname -m)" = "aarch64"

    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v4

    - name: Build quality image
      run: >
        docker buildx build --load
        --platform linux/arm64
        --cache-from type=gha
        --cache-to type=gha,mode=max
        -f frontend/Dockerfile.quality
        -t visual-regression-frontend-quality:ci .

    - name: Verify image architecture
      run: test "$(docker image inspect --format '{{.Architecture}}' visual-regression-frontend-quality:ci)" = "arm64"

    - name: Visual regression (light + dark)
      run: ./scripts/quality.sh visual --no-build
      env:
        QUALITY_IMAGE: visual-regression-frontend-quality:ci
        QUALITY_PLATFORM: linux/arm64

    - name: Accessibility (light + dark)
      run: ./scripts/quality.sh a11y --no-build
      env:
        QUALITY_IMAGE: visual-regression-frontend-quality:ci
        QUALITY_PLATFORM: linux/arm64

    - name: Upload Playwright report
      if: failure()
      uses: actions/upload-artifact@v7
      with:
        name: frontend-quality-report
        path: frontend/playwright-report
        retention-days: 7
```

- [ ] **Step 2: Trigger the workflow when the runner or Dockerfile changes**

In both the `push` and `pull_request` `paths` lists, add:

```yaml
- "scripts/quality.sh"
- "frontend/Dockerfile.quality"
```

- [ ] **Step 3: Document the commands in the root AGENTS.md**

In the Testing table, after the frontend E2E line, add:

```markdown
| `./scripts/quality.sh visual` | Dark/light screenshot suite (Docker, Linux arm64 baselines) |
| `./scripts/quality.sh a11y` | Axe WCAG A/AA scan in both themes |
| `./scripts/quality.sh visual --update` | Regenerate visual baselines |
```

- [ ] **Step 4: Document the commands in frontend/AGENTS.md**

In the Testing section, add:

```markdown
- Theme quality suites run in Docker so local macOS arm64 and CI use one Linux
  arm64 baseline set: `./scripts/quality.sh visual`, `./scripts/quality.sh a11y`.
  Update baselines with `./scripts/quality.sh visual --update`. CI runs on
  `ubuntu-24.04-arm`; Chromium crashes under QEMU on amd64, so do not switch the
  job or `QUALITY_PLATFORM` to amd64 without regenerating the baselines.
- The quality suites cover every gallery story in light and dark mode. Add a
  case to `tests/quality/cases.ts` when you add a story.
```

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci-frontend.yml AGENTS.md frontend/AGENTS.md
git commit -m "ci(frontend): run theme quality suites"
```

---

### Task 10: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run lint, typecheck, and unit tests**

Run:

```bash
pnpm --filter ./frontend lint:check
pnpm --filter ./frontend typecheck
pnpm --filter ./frontend test
```

Expected: all PASS.

- [ ] **Step 2: Run both quality suites**

Run:

```bash
./scripts/quality.sh visual
./scripts/quality.sh a11y
```

Expected: both PASS, 14 tests each.

- [ ] **Step 3: Confirm the original bug is covered**

Run:

```bash
git log --oneline -- frontend/tests/quality/__screenshots__/projects-dark.png
```

Expected: the baseline is committed, and `projects-dark.png` shows the table
container and sticky column sharing the dark surface.

- [ ] **Step 4: Check formatting**

Run:

```bash
pnpm run format:check
```

Expected: PASS. If formatting fails, run `pnpm run format`, then re-run the
frontend tests and commit the formatting-only changes separately.

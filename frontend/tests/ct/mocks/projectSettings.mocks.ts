import type { Page } from "@playwright/test";
import type { RetentionPreviewDto } from "@sdk/models/RetentionPreviewDto.gen";
import { mockApi, type FulfillResponse } from "../routes/api.routes";
import { PROJECT_CHECKOUT_UI_RESPONSE } from "./projects.mocks";
import { WEBHOOKS_RESPONSE } from "./webhooks.mocks";

// The settings page is the home of the per-project admin surfaces: the name,
// the pixel threshold, the storage quota and the webhook endpoints. Three specs
// drive that page (the settings flow, the retention preview dialog and the
// keyboard contract), so the reads it makes are answered here instead of per
// spec.
export const SETTINGS_ROUTE = "/projects/checkout-ui/settings";
export const STORAGE_GLOB = "**/api/v1/projects/checkout-ui/storage";
// The dry-run the preview dialog fetches when it opens. Its own glob: the
// aggregate glob above does not match a further path segment.
export const STORAGE_PREVIEW_GLOB =
  "**/api/v1/projects/checkout-ui/storage/preview";
export const WEBHOOKS_GLOB = "**/api/v1/projects/checkout-ui/webhooks";

export const STORAGE_RESPONSE: FulfillResponse = {
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({
    usageBytes: "5242880",
    quotaBytes: "10485760",
    percent: 50,
    softPercent: 80,
    warning: false,
    fileCount: 12,
    diffCount: 3,
    baselineRevisionLimit: 5,
    runHistoryDays: 30,
    orphanGraceHours: 24,
  }),
};

// The settings *resolved* rather than echoed: `/storage` reports the stored
// override (null = "use the default"), this reports what the sweeps will apply.
export const RETENTION_PREVIEW_RESPONSE: FulfillResponse = {
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({
    baselineRevisions: { limit: 5, overflow: 2 },
    runs: { days: 30, eligible: 7 },
    branches: { days: 90, eligible: 1 },
    effectiveOrphanGraceHours: 24,
    storage: {
      usageBytes: "5242880",
      quotaBytes: "10485760",
      percent: 50,
      warning: true,
    },
  } satisfies RetentionPreviewDto),
};

export async function mockProjectSettings(page: Page): Promise<void> {
  await mockApi(page, [
    [STORAGE_GLOB, STORAGE_RESPONSE],
    [STORAGE_PREVIEW_GLOB, RETENTION_PREVIEW_RESPONSE],
    [WEBHOOKS_GLOB, WEBHOOKS_RESPONSE],
    ["**/api/v1/projects/checkout-ui*", PROJECT_CHECKOUT_UI_RESPONSE],
  ]);
}

// A rename answers with the renamed project, and the page continues under that
// name: every read after the write has to answer under it too.
export function renamedProject(name: string): FulfillResponse {
  return {
    ...PROJECT_CHECKOUT_UI_RESPONSE,
    body: JSON.stringify({
      ...JSON.parse(PROJECT_CHECKOUT_UI_RESPONSE.body),
      name,
    }),
  };
}

export async function mockRenamedProject(
  page: Page,
  name: string,
): Promise<void> {
  const renamed = renamedProject(name);
  await page.route("**/api/v1/projects/checkout-ui", (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill(renamed)
      : route.fulfill(PROJECT_CHECKOUT_UI_RESPONSE),
  );
  await mockApi(page, [
    [`**/api/v1/projects/${name}/storage`, STORAGE_RESPONSE],
    [`**/api/v1/projects/${name}/webhooks`, WEBHOOKS_RESPONSE],
    [`**/api/v1/projects/${name}*`, renamed],
  ]);
}

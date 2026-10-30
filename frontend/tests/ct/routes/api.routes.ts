import type { Page } from "@playwright/test";
import { ONE_PIXEL_PNG_DATA_URL } from "../mocks/projects.mocks";

export type FulfillResponse = {
  status: number;
  contentType: string;
  body: string;
};

export async function mockGet(
  page: Page,
  urlGlob: string,
  response: FulfillResponse,
) {
  await page.route(urlGlob, (route) => route.fulfill(response));
}

export async function mockApi(
  page: Page,
  routes: Array<[string, FulfillResponse]>,
) {
  await mockBaselineHistory(page);
  await mockEmptyThreads(page);
  for (const [glob, res] of routes) {
    await mockGet(page, glob, res);
  }
}

// The activity rail beside every detail view also reads the comment thread and
// the approval trail. Empty answers keep those reads off the dev server — an
// unmatched request there answers 401, which paints an error state into a tab
// the spec never opened.
export async function mockEmptyThreads(page: Page): Promise<void> {
  for (const section of ["comments", "approvals"]) {
    await mockGet(page, `**/api/v1/projects/*/tests/*/${section}*`, {
      status: 200,
      contentType: "application/json",
      body: "[]",
    });
  }
}

// Every detail view reads the baseline history of its resolved variant. Specs
// that assert the history register their own route afterwards (Playwright
// matches the most recently added handler first); every other spec gets an
// empty history instead of an unmocked request escaping to the dev server.
export async function mockBaselineHistory(
  page: Page,
  body: unknown = [],
): Promise<void> {
  await mockGet(page, "**/api/v1/projects/*/tests/*/baseline-history*", {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

// The threshold endpoint is one route with two modes split by the `preview`
// query param: the blur-time preview that asks how many comparisons a threshold
// would auto-accept, and the commit that actually writes it. Dispatched on the
// query so the two can't shadow each other through glob ordering.
export interface ThresholdBackendOptions {
  projectName: string;
  testName: string;
  previewAutoAcceptedCount: number;
  commitThreshold: number;
}

export async function mockThresholdBackend(
  page: Page,
  options: ThresholdBackendOptions,
) {
  const { projectName, testName, previewAutoAcceptedCount, commitThreshold } =
    options;
  await page.route(
    `**/api/v1/projects/${projectName}/tests/${testName}/threshold*`,
    (route) => {
      const url = new URL(route.request().url());
      const preview = url.searchParams.get("preview") === "true";
      const body = preview
        ? { autoAcceptedCount: previewAutoAcceptedCount }
        : { threshold: commitThreshold, autoAcceptedCount: 0 };
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    },
  );
}

export interface PendingItem {
  name: string;
}

export interface ReviewBackendOptions {
  projectName: string;
  details: Map<string, FulfillResponse>;
  kind?: Map<string, FulfillResponse>;
  pending?: PendingItem[];
  approve?: FulfillResponse;
  onApprove?: (testName: string) => void;
}

// A tiny stateful fake backend for review-loop specs: GET details/kind/pending
// read from the provided maps plus a mutable pending array; POST :name/approval
// answers with the approve result (or the provided error response) and removes
// the test from pending only on a successful approval — the real backend keeps
// the test pending on a failed one. An optional onApprove callback fires on
// every approval POST so specs can observe that the endpoint was hit. Dispatch
// happens on the URL pathname, so the single route glob needs no ordering
// tricks between `meta/pending`, `:name/kind` and `:name`. The secondary reads
// every reviewable details page makes (variants, metadata, comments, approvals)
// answer empty instead of escaping to the dev server: an unmatched request there
// returns 401, and because the variants key is shared with the variant resolver,
// that error replaced the whole details page with "Failed to load test".
export async function mockReviewBackend(
  page: Page,
  options: ReviewBackendOptions,
) {
  const pending = [...(options.pending ?? [])];
  const { details, kind, projectName, approve, onApprove } = options;
  const json = (status: number, data: unknown): FulfillResponse => ({
    status,
    contentType: "application/json",
    body: JSON.stringify(data),
  });
  const defaultApprove = json(201, {
    approved: true,
    newBaselineUrl: "http://localhost:9000/vrt/new-baseline.png",
  });

  // The review views all render the baseline history panel; an empty history
  // keeps that read off the dev server without a per-spec route.
  await mockBaselineHistory(page);

  await page.route(`**/api/v1/projects/${projectName}/**`, async (route) => {
    const url = new URL(route.request().url());
    const parts = url.pathname.split("/").filter(Boolean);
    const testsIndex = parts.indexOf("tests");
    const tail = testsIndex >= 0 ? parts.slice(testsIndex + 1) : [];
    const method = route.request().method();

    if (
      method === "POST" &&
      tail.length === 2 &&
      (tail[1] === "approval" || tail[1] === "pdf-approval")
    ) {
      onApprove?.(tail[0]);
      const result = approve ?? defaultApprove;
      if (result.status >= 200 && result.status < 300) {
        const index = pending.findIndex((item) => item.name === tail[0]);
        if (index >= 0) pending.splice(index, 1);
      }
      await route.fulfill(result);
      return;
    }

    if (method === "GET" && tail[0] === "meta" && tail[1] === "pending") {
      await route.fulfill(
        json(200, { data: pending, meta: { total: pending.length } }),
      );
      return;
    }

    if (method === "GET" && tail.length === 2 && tail[1] === "pdf-details") {
      const response = details.get(tail[0]);
      if (response) {
        await route.fulfill(response);
        return;
      }
    }

    if (method === "GET" && tail.length === 2 && tail[1] === "pdf-render") {
      await route.fulfill(
        json(200, { imageUrl: ONE_PIXEL_PNG_DATA_URL, pageCount: 1 }),
      );
      return;
    }

    if (method === "GET" && tail.length === 2 && tail[1] === "kind") {
      const response = kind?.get(tail[0]);
      if (response) {
        await route.fulfill(response);
        return;
      }
    }

    if (method === "GET" && tail.length === 2 && tail[1] === "variants") {
      await route.fulfill(
        json(200, { name: tail[0], kind: "image", variants: [] }),
      );
      return;
    }

    if (method === "GET" && tail.length === 2 && tail[1] === "metadata") {
      await route.fulfill(json(200, { id: tail[0], name: tail[0], tags: [] }));
      return;
    }

    if (
      method === "GET" &&
      tail.length === 2 &&
      (tail[1] === "comments" || tail[1] === "approvals")
    ) {
      await route.fulfill(json(200, []));
      return;
    }

    if (method === "GET" && tail.length === 1) {
      const response = details.get(tail[0]);
      if (response) {
        await route.fulfill(response);
        return;
      }
    }

    await route.fallback();
  });
}

import type { Page } from "@playwright/test";

type FulfillResponse = { status: number; contentType: string; body: string };

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
  for (const [glob, res] of routes) {
    await mockGet(page, glob, res);
  }
}

export async function mockPost(
  page: Page,
  urlGlob: string,
  response: FulfillResponse,
) {
  await page.route(urlGlob, (route) => {
    if (route.request().method() !== "POST") {
      route.fallback();
      return;
    }
    route.fulfill(response);
  });
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
// tricks between `meta/pending`, `:name/kind` and `:name`.
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

  await page.route(`**/api/v1/projects/${projectName}/**`, async (route) => {
    const url = new URL(route.request().url());
    const parts = url.pathname.split("/").filter(Boolean);
    const testsIndex = parts.indexOf("tests");
    const tail = testsIndex >= 0 ? parts.slice(testsIndex + 1) : [];
    const method = route.request().method();

    if (method === "POST" && tail.length === 2 && tail[1] === "approval") {
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

    if (method === "GET" && tail.length === 2 && tail[1] === "kind") {
      const response = kind?.get(tail[0]);
      if (response) {
        await route.fulfill(response);
        return;
      }
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

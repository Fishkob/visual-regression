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

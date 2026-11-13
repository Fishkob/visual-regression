import { expect, test } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import { TEST_ID } from "@/lib/test-ids";
import { createVrt } from "../../../client-sdk/src/playwright-capture";
import type { CaptureUploadResult } from "../../../client-sdk/src/upload-many";

// The capture path the README describes, run against our own instance: a real
// browser screenshot goes through createVrt().capture(), and the server decides
// between baseline, identical and review. The client is the product code users
// configure, so this spec is the one place its whole pipeline — the title path,
// the upload and the API key — runs for real.

const API = "/api/v1";
const TEST_FILE = "checkout.spec.ts";
const TEST_TITLE = "cart summary";
// What the client derives from `checkout.spec.ts / cart summary`: a test name
// the API accepts (letters, digits, hyphens, underscores).
const TEST_NAME = "checkout-spec-ts-cart-summary";
const VARIANT = {
  viewport: "1920x1080",
  browser: "chromium",
  environment: "staging",
} as const;
const TEST_INFO = { title: TEST_TITLE, titlePath: [TEST_FILE, TEST_TITLE] };

let projectName: string;
let keyId: string | undefined;

test.describe("Playwright capture upload", () => {
  test.beforeEach(() => {
    projectName = `e2e-capture-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  });

  test.afterEach(async ({ page }) => {
    // Session-authenticated cleanup: the key under test carries `upload` only,
    // exactly as the README tells a pipeline to scope it.
    await page.request.delete(
      `/api/v1/projects/${encodeURIComponent(projectName)}`,
    );
    if (keyId) await page.request.delete(`/api/v1/api-keys/${keyId}`);
    keyId = undefined;
  });

  test("uploads a screenshot and turns the next capture into a review", async ({
    page,
  }) => {
    await page.goto("/projects");
    // The SPA paints its shell before the view has data; a screenshot taken now
    // is the same empty frame on every route and would upload as "identical".
    await expect(page.getByTestId(TEST_ID.newProject)).toBeVisible();
    const apiUrl = new URL(API, page.url()).toString();

    const created = await page.request.post(`${API}/api-keys`, {
      data: { name: `${projectName}-upload`, scopes: ["upload"] },
    });
    expect(created.status()).toBe(201);
    const key = (await created.json()) as { id: string; rawKey: string };
    keyId = key.id;

    const vrt = createVrt({
      apiUrl,
      apiKey: key.rawKey,
      project: projectName,
      ...VARIANT,
    });

    const baseline = await vrt.capture(TEST_INFO, page);
    expect(
      baseline,
      `upload failed: ${String(baseline.status)} ${baseline.error ?? ""}`,
    ).toMatchObject({ ok: true });
    expect(statusOf(baseline)).toBe("baseline_created");

    // Same pixels, same variant: the upload is content-addressed and short-circuits.
    const repeated = await vrt.capture(TEST_INFO, page);
    expect(statusOf(repeated)).toBe("identical");

    await page.goto("/api-keys");
    await expect(page.getByTestId(TEST_ID.newApiKey)).toBeVisible();
    const queued = await vrt.capture(TEST_INFO, page);
    expect(statusOf(queued)).toBe("comparison_queued");

    const jobId = (queued.data as { jobId?: string }).jobId;
    if (!jobId) throw new Error("The queued comparison carried no job id");

    const comparison = await waitForComparison(page.request, jobId);
    expect(comparison.status).toBe("PENDING_APPROVAL");
    expect(comparison.mismatchPixelCount).toBeGreaterThan(0);

    await page.goto(
      `/projects/${encodeURIComponent(projectName)}/tests/${encodeURIComponent(TEST_NAME)}?viewport=${VARIANT.viewport}&browser=${VARIANT.browser}&environment=${VARIANT.environment}`,
    );
    await expect(page.getByTestId(TEST_ID.comparisonView)).toBeVisible();
    await expect(page.getByTestId(TEST_ID.badgeMismatch)).toBeVisible();
  });
});

function statusOf(result: CaptureUploadResult): string {
  const data = result.data as { status?: string } | undefined;
  return data?.status ?? "";
}

async function waitForComparison(
  request: APIRequestContext,
  jobId: string,
): Promise<{ status: string; mismatchPixelCount: number }> {
  const deadline = Date.now() + 30_000;
  const url = `${API}/projects/${encodeURIComponent(projectName)}/tests/${encodeURIComponent(TEST_NAME)}/jobs/${jobId}?wait=30`;

  while (Date.now() < deadline) {
    const res = await request.get(url);
    if (res.ok()) {
      const body = (await res.json()) as {
        status: string;
        error?: string;
        comparison?: { status: string; mismatchPixelCount: number } | null;
      };
      if (body.status === "FAILED") {
        throw new Error(`Comparison job failed: ${body.error ?? "unknown"}`);
      }
      if (body.status === "COMPLETED") {
        if (!body.comparison) {
          throw new Error("Comparison job completed without a comparison");
        }
        return body.comparison;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for comparison job ${jobId}`);
}

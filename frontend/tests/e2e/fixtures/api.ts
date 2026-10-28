import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const FIXTURES_DIR = path.join(__dirname, "../../fixtures");

const API_BASE = "http://localhost:3000/api/v1";

// The product API is authenticated. CI passes the provisioned e2e key via
// E2E_API_KEY; locally (or against a guard-less backend) requests go without it.
const AUTH_HEADERS: Record<string, string> = process.env.E2E_API_KEY
  ? { "x-api-key": process.env.E2E_API_KEY }
  : {};

export const DEFAULT_VARIANT = {
  viewport: "1920x1080",
  browser: "Chrome",
  environment: "staging",
} as const;

export interface Variant {
  viewport?: string;
  browser?: string;
  environment?: string;
}

export interface UploadOptions extends Variant {
  branch?: string;
  targetBranch?: string;
  runKey?: string;
  commitSha?: string;
  commitMessage?: string;
  ciUrl?: string;
}

async function apiFetch(pathname: string, init: RequestInit = {}) {
  return fetch(`${API_BASE}${pathname}`, {
    ...init,
    headers: { ...AUTH_HEADERS, ...init.headers },
  });
}

export async function createProject(
  name: string,
  groupId?: string,
): Promise<Response> {
  return apiFetch("/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, ...(groupId ? { groupId } : {}) }),
  }).catch(() => {
    throw new Error(`Could not create project ${name}`);
  });
}

export async function getProjectStatus(name: string): Promise<number> {
  const res = await apiFetch(`/projects/${encodeURIComponent(name)}`);
  return res.status;
}

export async function getProjects(
  query = "",
): Promise<{ data?: { name: string }[] }> {
  const res = await apiFetch(`/projects${query}`);
  if (!res.ok) return {};
  return (await res.json()) as { data?: { name: string }[] };
}

export async function deleteProject(name: string) {
  await apiFetch(`/projects/${encodeURIComponent(name)}`, {
    method: "DELETE",
  }).catch(() => {});
}

export async function createGroup(name: string): Promise<Response> {
  return apiFetch("/groups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export async function deleteGroup(id: string) {
  await apiFetch(`/groups/${encodeURIComponent(id)}`, {
    method: "DELETE",
  }).catch(() => {});
}

export async function getGroups(): Promise<
  { id: string; name: string; projectCount: number }[]
> {
  const res = await apiFetch("/groups");
  if (!res.ok) return [];
  return (await res.json()) as {
    id: string;
    name: string;
    projectCount: number;
  }[];
}

export async function uploadScreenshot(
  project: string,
  testName: string,
  imageFile: string,
  options: UploadOptions = {},
): Promise<Response> {
  const imagePath = path.join(FIXTURES_DIR, imageFile);
  const imageBuffer = fs.readFileSync(imagePath);

  const form = new FormData();
  form.append("viewport", options.viewport ?? DEFAULT_VARIANT.viewport);
  form.append("browser", options.browser ?? DEFAULT_VARIANT.browser);
  form.append(
    "environment",
    options.environment ?? DEFAULT_VARIANT.environment,
  );
  if (options.branch) form.append("branch", options.branch);
  if (options.targetBranch) form.append("targetBranch", options.targetBranch);
  if (options.runKey) form.append("runKey", options.runKey);
  if (options.commitSha) form.append("commitSha", options.commitSha);
  if (options.commitMessage)
    form.append("commitMessage", options.commitMessage);
  if (options.ciUrl) form.append("ciUrl", options.ciUrl);
  form.append(
    "file",
    new Blob([imageBuffer], { type: "image/png" }),
    "screenshot.png",
  );

  return apiFetch(
    `/projects/${encodeURIComponent(project)}/tests/${encodeURIComponent(testName)}/upload?testKind=image`,
    { method: "POST", body: form },
  ).catch(() => {
    throw new Error(`Could not upload screenshot for ${project}/${testName}`);
  });
}

export async function setupBaselines(
  project: string,
  testName: string,
  options: UploadOptions = {},
) {
  await createProject(project);
  await uploadScreenshot(
    project,
    testName + "_black",
    "baseline_black.png",
    options,
  );
  await uploadScreenshot(
    project,
    testName + "_blue",
    "baseline_blue.png",
    options,
  );
  await uploadScreenshot(
    project,
    testName + "_red",
    "baseline_blue.png",
    options,
  );
}

export async function uploadPdf(
  project: string,
  testName: string,
  pdfFile: string,
  options: UploadOptions = {},
): Promise<Response> {
  const pdfPath = path.join(FIXTURES_DIR, pdfFile);
  const pdfBuffer = fs.readFileSync(pdfPath);

  const form = new FormData();
  form.append("viewport", options.viewport ?? "A4");
  form.append("browser", options.browser ?? "pdf");
  form.append("environment", options.environment ?? "staging");
  if (options.branch) form.append("branch", options.branch);
  if (options.targetBranch) form.append("targetBranch", options.targetBranch);
  if (options.runKey) form.append("runKey", options.runKey);
  if (options.commitSha) form.append("commitSha", options.commitSha);
  if (options.commitMessage)
    form.append("commitMessage", options.commitMessage);
  if (options.ciUrl) form.append("ciUrl", options.ciUrl);
  form.append(
    "file",
    new Blob([pdfBuffer], { type: "application/pdf" }),
    "report.pdf",
  );

  return apiFetch(
    `/projects/${encodeURIComponent(project)}/tests/${encodeURIComponent(testName)}/upload?testKind=pdf`,
    { method: "POST", body: form },
  ).catch(() => {
    throw new Error(`Could not upload PDF for ${project}/${testName}`);
  });
}

export async function setupPdfBaselines(project: string, testName: string) {
  await createProject(project);
  await uploadPdf(project, testName + "_report", "sample-v1.pdf");
  await uploadPdf(project, testName + "_contract", "sample-v1.pdf");
}

export async function waitForPdfComparison(
  project: string,
  testName: string,
  timeoutMs = 30_000,
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await apiFetch(
        `/projects/${encodeURIComponent(project)}/tests/${encodeURIComponent(testName)}/pdf-details?viewport=A4&browser=pdf&environment=staging`,
      );
      if (res.ok) {
        const data = await res.json();
        if (data.comparison) {
          return data;
        }
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `Timed out waiting for PDF comparison (${project}/${testName})`,
  );
}

function variantQuery(variant: Variant = {}): string {
  return new URLSearchParams({
    viewport: variant.viewport ?? DEFAULT_VARIANT.viewport,
    browser: variant.browser ?? DEFAULT_VARIANT.browser,
    environment: variant.environment ?? DEFAULT_VARIANT.environment,
  }).toString();
}

export async function getTestDetails(
  project: string,
  testName: string,
  variant: Variant = {},
  branch?: string,
): Promise<Record<string, unknown>> {
  const query = new URLSearchParams(new URLSearchParams(variantQuery(variant)));
  if (branch) query.set("branch", branch);
  const res = await apiFetch(
    `/projects/${encodeURIComponent(project)}/tests/${encodeURIComponent(testName)}?${query.toString()}`,
  );
  if (!res.ok) {
    throw new Error(
      `Could not read ${project}/${testName}: ${String(res.status)}`,
    );
  }
  return (await res.json()) as Record<string, unknown>;
}

export async function waitForImageComparison(
  project: string,
  testName: string,
  timeoutMs = 30_000,
  variant: Variant = {},
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await apiFetch(
        `/projects/${encodeURIComponent(project)}/tests/${encodeURIComponent(testName)}?${variantQuery(variant)}`,
      );
      if (res.ok) {
        const data = await res.json();
        if (data.comparison) {
          return data;
        }
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `Timed out waiting for image comparison (${project}/${testName})`,
  );
}

export async function setupReviewableTest(
  project: string,
  testName: string,
  options: UploadOptions = {},
) {
  const existing = await createProject(project);
  if (!existing.ok && existing.status !== 409) {
    throw new Error(`Could not create project ${project}`);
  }
  await uploadScreenshot(project, testName, "baseline_black.png", options);
  await uploadScreenshot(project, testName, "baseline_blue.png", options);
  await waitForImageComparison(project, testName, 30_000, options);
}

export async function approveComparison(
  project: string,
  testName: string,
  variant: Variant = {},
  branch?: string,
): Promise<Response> {
  const details = await waitForImageComparison(
    project,
    testName,
    30_000,
    variant,
  );
  const comparison = details.comparison as { id?: string } | undefined;
  if (!comparison?.id) throw new Error("No comparison to approve");
  const query = branch ? `?branch=${encodeURIComponent(branch)}` : "";
  return apiFetch(
    `/projects/${encodeURIComponent(project)}/tests/${encodeURIComponent(testName)}/approval${query}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comparisonId: comparison.id }),
    },
  );
}

export async function getBaselineHistory(
  project: string,
  testName: string,
  variant: Variant = {},
  branch?: string,
): Promise<unknown[]> {
  const query = new URLSearchParams(variantQuery(variant));
  if (branch) query.set("branch", branch);
  const res = await apiFetch(
    `/projects/${encodeURIComponent(project)}/tests/${encodeURIComponent(testName)}/baseline-history?${query.toString()}`,
  );
  if (!res.ok) return [];
  return (await res.json()) as unknown[];
}

export async function getTestMetadata(
  project: string,
  testName: string,
  branch?: string,
): Promise<Record<string, unknown>> {
  const query = branch ? `?branch=${encodeURIComponent(branch)}` : "";
  const res = await apiFetch(
    `/projects/${encodeURIComponent(project)}/tests/${encodeURIComponent(testName)}/metadata${query}`,
  );
  if (!res.ok) return {};
  return (await res.json()) as Record<string, unknown>;
}

export async function getTestStatus(
  project: string,
  testName: string,
  variant: Variant = {},
  branch?: string,
): Promise<number> {
  const query = new URLSearchParams(variantQuery(variant));
  if (branch) query.set("branch", branch);
  const res = await apiFetch(
    `/projects/${encodeURIComponent(project)}/tests/${encodeURIComponent(testName)}?${query.toString()}`,
  );
  return res.status;
}

export async function getBranches(project: string): Promise<
  {
    name: string;
    isDefault: boolean;
    isArchived: boolean;
    targetBranchName: string | null;
    testCount?: number;
  }[]
> {
  const res = await apiFetch(
    `/projects/${encodeURIComponent(project)}/branches`,
  );
  if (!res.ok) return [];
  return (await res.json()) as {
    name: string;
    isDefault: boolean;
    isArchived: boolean;
    targetBranchName: string | null;
    testCount?: number;
  }[];
}

export async function getStorage(
  project: string,
): Promise<Record<string, unknown>> {
  const res = await apiFetch(
    `/projects/${encodeURIComponent(project)}/storage`,
  );
  if (!res.ok) return {};
  return (await res.json()) as Record<string, unknown>;
}

export async function getVariants(
  project: string,
  testName: string,
  branch?: string,
): Promise<unknown[]> {
  const query = branch ? `?branch=${encodeURIComponent(branch)}` : "";
  const res = await apiFetch(
    `/projects/${encodeURIComponent(project)}/tests/${encodeURIComponent(testName)}/variants${query}`,
  );
  if (!res.ok) return [];
  const body = (await res.json()) as { variants?: unknown[] };
  return body.variants ?? [];
}

// Session-authenticated helpers for setup that no UI path should perform
// (e.g. seeding a thread-level comment before exercising the comparison-only
// filter). Node's fetch sends no Origin header, so the backend's same-origin
// guard does not apply here.
export async function loginSession(
  username = process.env.E2E_ADMIN_USERNAME ?? "admin",
  password = process.env.E2E_ADMIN_PASSWORD ?? "admin-secret",
): Promise<string> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    throw new Error(`Could not log in as ${username}: ${String(res.status)}`);
  }
  const setCookies =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie") ?? ""];
  const cookie = setCookies[0]?.split(";")[0];
  if (!cookie) throw new Error("Login returned no session cookie");
  return cookie;
}

export async function createComment(
  cookie: string,
  project: string,
  testName: string,
  body: string,
  options: { comparisonId?: string; branch?: string } = {},
): Promise<Response> {
  return fetch(
    `${API_BASE}/projects/${encodeURIComponent(project)}/tests/${encodeURIComponent(testName)}/comments`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        body,
        ...(options.comparisonId ? { comparisonId: options.comparisonId } : {}),
        ...(options.branch ? { branch: options.branch } : {}),
      }),
    },
  );
}

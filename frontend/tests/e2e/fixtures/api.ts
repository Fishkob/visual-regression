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

export async function createProject(name: string) {
  await fetch(`${API_BASE}/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...AUTH_HEADERS },
    body: JSON.stringify({ name }),
  }).catch(() => {});
}

export async function deleteProject(name: string) {
  await fetch(`${API_BASE}/projects/${encodeURIComponent(name)}`, {
    method: "DELETE",
    headers: AUTH_HEADERS,
  }).catch(() => {});
}

export async function uploadScreenshot(
  project: string,
  testName: string,
  imageFile: string,
) {
  const imagePath = path.join(FIXTURES_DIR, imageFile);
  const imageBuffer = fs.readFileSync(imagePath);

  const form = new FormData();
  form.append("viewport", "1920x1080");
  form.append("browser", "Chrome");
  form.append("environment", "staging");
  form.append(
    "file",
    new Blob([imageBuffer], { type: "image/png" }),
    "screenshot.png",
  );

  try {
    await fetch(
      `${API_BASE}/projects/${encodeURIComponent(project)}/tests/${encodeURIComponent(testName)}/upload?testKind=image`,
      { method: "POST", headers: AUTH_HEADERS, body: form },
    );
  } catch {}
}

export async function setupBaselines(project: string, testName: string) {
  await createProject(project);
  await uploadScreenshot(project, testName + "_black", "baseline_black.png");
  await uploadScreenshot(project, testName + "_blue", "baseline_blue.png");
  await uploadScreenshot(project, testName + "_red", "baseline_blue.png");
}

export async function uploadPdf(
  project: string,
  testName: string,
  pdfFile: string,
) {
  const pdfPath = path.join(FIXTURES_DIR, pdfFile);
  const pdfBuffer = fs.readFileSync(pdfPath);

  const form = new FormData();
  form.append("viewport", "A4");
  form.append("browser", "pdf");
  form.append("environment", "staging");
  form.append(
    "file",
    new Blob([pdfBuffer], { type: "application/pdf" }),
    "report.pdf",
  );

  try {
    await fetch(
      `${API_BASE}/projects/${encodeURIComponent(project)}/tests/${encodeURIComponent(testName)}/upload?testKind=pdf`,
      { method: "POST", headers: AUTH_HEADERS, body: form },
    );
  } catch {}
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
      const res = await fetch(
        `${API_BASE}/projects/${encodeURIComponent(project)}/tests/${encodeURIComponent(testName)}/pdf-details?viewport=A4&browser=pdf&environment=staging`,
        { headers: AUTH_HEADERS },
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

export async function waitForImageComparison(
  project: string,
  testName: string,
  timeoutMs = 30_000,
) {
  const filters = "viewport=1920x1080&browser=Chrome&environment=staging";
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(
        `${API_BASE}/projects/${encodeURIComponent(project)}/tests/${encodeURIComponent(testName)}?${filters}`,
        { headers: AUTH_HEADERS },
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

export async function setupReviewableTest(project: string, testName: string) {
  await createProject(project);
  await uploadScreenshot(project, testName, "baseline_black.png");
  await uploadScreenshot(project, testName, "baseline_blue.png");
  await waitForImageComparison(project, testName);
}

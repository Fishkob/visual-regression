import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  VRT_CONFIG_FILE,
  parseVrtConfig,
  thresholdForTest,
  uploadMany,
  type CaptureKind,
  type CaptureUpload,
  type CaptureUploadResult,
  type VrtConfig,
} from './upload-many';

// Structural subsets of Playwright's types: the client reads a test's title
// path and takes one screenshot, so it needs no `@playwright/test` dependency.
export interface VrtTestInfo {
  title: string;
  /** `TestInfo.titlePath` (an array) or `Test.titlePath()` (a function). */
  titlePath: string[] | (() => string[]);
}

export interface VrtPage {
  screenshot(options?: { fullPage?: boolean }): Promise<Uint8Array>;
}

export interface VrtCaptureOptions {
  /** Defaults to `image`; a PDF buffer is recognised by its `%PDF-` header. */
  kind?: CaptureKind;
  /** Only for a page source: capture the whole page. Default true. */
  fullPage?: boolean;
  /** Pixel tolerance for this capture; overrides the `.vrt.json` entry. */
  pixelDiffThreshold?: number;
}

export interface VrtClientOptions {
  /** API root including the version segment, e.g. `https://vrt.example.com/api/v1`. */
  apiUrl: string;
  /** Key sent as `x-api-key`; needs the `upload` scope. */
  apiKey: string;
  /** Project name used for every capture of this client. */
  project: string;
  /** Branch that produced the capture; defaults to the project's default branch. */
  branch?: string;
  /** Variant environment, matched verbatim. Defaults to `default`. */
  environment?: string;
  /** Variant viewport, matched verbatim. Defaults to `default`. */
  viewport?: string;
  /** Variant browser, matched verbatim. Defaults to `chromium`. */
  browser?: string;
  /** Groups this pipeline's uploads into one run. */
  runKey?: string;
  /** Commit SHA of the run; only used together with `runKey`. */
  commitSha?: string;
  /** Commit message of the run; only used together with `runKey`. */
  commitMessage?: string;
  /** Link back to the CI job in the run; only used together with `runKey`. */
  ciUrl?: string;
  /**
   * Repository config with per-test pixel thresholds. Defaults to `.vrt.json`
   * in the process working directory; a missing file is not an error.
   */
  configPath?: string;
  /** Attempts per upload. Default 3. */
  maxAttempts?: number;
  /** Called after each upload; handy for logging. */
  onUpload?: (result: CaptureUploadResult) => void;
  /** Called when the config file exists but cannot be read or parsed. */
  onConfigError?: (error: unknown) => void;
}

export interface VrtClient {
  /**
   * Upload one capture for the test, under the project and branch of this
   * client. A page is screenshotted (`fullPage: true` unless overridden), a
   * buffer is uploaded as it is.
   *
   * Network and API failures come back as `ok: false` and never throw; a page
   * that cannot be screenshotted throws, because that is a test bug.
   */
  capture(
    testInfo: VrtTestInfo,
    source: VrtPage | Uint8Array | Blob,
    options?: VrtCaptureOptions,
  ): Promise<CaptureUploadResult>;
}

function isPage(source: VrtPage | Uint8Array | Blob): source is VrtPage {
  return typeof (source as VrtPage).screenshot === 'function';
}

function kindOf(source: Uint8Array | Blob): CaptureKind {
  if (source instanceof Blob) {
    return source.type.includes('pdf') ? 'pdf' : 'image';
  }
  return String.fromCharCode(...source.slice(0, 5)) === '%PDF-'
    ? 'pdf'
    : 'image';
}

function mimeFor(kind: CaptureKind): string {
  return kind === 'pdf' ? 'application/pdf' : 'image/png';
}

// The canonical name of a test is Playwright's title path (file, describes,
// title) joined with " / ". It is the key `.vrt.json` thresholds and the
// dashboard links are written in.
function canonicalTestName(testInfo: VrtTestInfo): string {
  const titlePath =
    typeof testInfo.titlePath === 'function'
      ? testInfo.titlePath()
      : testInfo.titlePath;
  const path = titlePath.filter((part) => part.length > 0);
  return path.length > 0 ? path.join(' / ') : testInfo.title;
}

// A UnifiedTest name is a path segment and the API accepts letters, digits,
// hyphens and underscores only (100 characters max), so a title path like
// "checkout.spec.ts / cart summary" cannot be uploaded verbatim. Reducing it
// keeps the dashboard readable; an over-long name keeps a stable hash of the
// canonical name so two tests that share a prefix stay two tests.
const INVALID_NAME_CHARS = /[^a-zA-Z0-9_-]+/g;
const MAX_TEST_NAME_LENGTH = 100;

export function toTestName(testInfo: VrtTestInfo): string {
  const canonical = canonicalTestName(testInfo);
  const reduced = canonical
    .replace(INVALID_NAME_CHARS, '-')
    .replace(/^-|-$/g, '');
  if (reduced.length === 0) return `test-${hashName(canonical)}`;
  if (reduced.length <= MAX_TEST_NAME_LENGTH) return reduced;
  const suffix = hashName(canonical);
  return `${reduced.slice(0, MAX_TEST_NAME_LENGTH - suffix.length - 1)}-${suffix}`;
}

function hashName(name: string): string {
  return createHash('sha256').update(name).digest('hex').slice(0, 8);
}

async function readConfig(options: VrtClientOptions): Promise<VrtConfig> {
  try {
    const text = await readFile(
      options.configPath ?? VRT_CONFIG_FILE,
      'utf8',
    );
    return parseVrtConfig(JSON.parse(text) as unknown);
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') {
      options.onConfigError?.(error);
    }
    return {};
  }
}

// `capture` is the one call a test makes; there is no reporter and no
// attachment, so the pixels never pass through Playwright's artifact store and
// nothing is inferred from an attachment name.
export function createVrt(options: VrtClientOptions): VrtClient {
  const configPromise = readConfig(options);
  return {
    async capture(testInfo, source, captureOptions = {}) {
      const raw = isPage(source)
        ? await source.screenshot({ fullPage: captureOptions.fullPage ?? true })
        : source;
      const kind = captureOptions.kind ?? kindOf(raw);
      const file =
        raw instanceof Blob
          ? raw.type
            ? raw
            : new Blob([raw], { type: mimeFor(kind) })
          : new Blob([new Uint8Array(raw)], { type: mimeFor(kind) });
      const config = await configPromise;
      const canonical = canonicalTestName(testInfo);
      const name = toTestName(testInfo);
      const threshold =
        captureOptions.pixelDiffThreshold ??
        thresholdForTest(config, [canonical, name, testInfo.title]);
      const capture: CaptureUpload = {
        projectName: options.project,
        testName: name,
        kind,
        file,
        viewport: options.viewport ?? 'default',
        browser: options.browser ?? 'chromium',
        environment: options.environment ?? 'default',
        ...(options.branch ? { branch: options.branch } : {}),
        ...(options.runKey ? { runKey: options.runKey } : {}),
        ...(options.commitSha ? { commitSha: options.commitSha } : {}),
        ...(options.commitMessage
          ? { commitMessage: options.commitMessage }
          : {}),
        ...(options.ciUrl ? { ciUrl: options.ciUrl } : {}),
        ...(threshold !== undefined
          ? { pixelDiffThreshold: threshold }
          : {}),
      };
      const [result] = await uploadMany([capture], {
        apiKey: options.apiKey,
        baseUrl: options.apiUrl,
        maxAttempts: options.maxAttempts ?? 3,
      });
      options.onUpload?.(result);
      return result;
    },
  };
}

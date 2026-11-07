import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  VRT_CONFIG_FILE,
  parseVrtConfig,
  thresholdForTest,
  uploadMany,
  type CaptureUpload,
  type CaptureUploadResult,
  type VrtConfig,
} from './upload-many';

// Structural subset of Playwright's reporter API. Deliberately no dependency on
// @playwright/test: the reporter is installed next to it in a user's project,
// and the SDK keeps its zero-runtime-dependency promise.
export interface PlaywrightAttachment {
  name: string;
  contentType?: string;
  path?: string;
  // `Uint8Array` rather than `Buffer`: Playwright passes a Buffer, which is
  // assignable here, and the published types stay free of Node globals.
  body?: Uint8Array;
}

export interface PlaywrightTestLike {
  title: string;
  titlePath(): string[];
  location?: { file?: string };
}

export interface PlaywrightTestResultLike {
  status: string;
  attachments: PlaywrightAttachment[];
  retry?: number;
}

export interface PlaywrightReporterOptions {
  apiUrl: string;
  apiKey: string;
  /** Project name used for every capture of this reporter. */
  project: string;
  branch?: string;
  environment?: string;
  viewport?: string;
  browser?: string;
  runKey?: string;
  commitSha?: string;
  commitMessage?: string;
  ciUrl?: string;
  /** Only upload failed (or timed-out) tests. Default false. */
  uploadOnFailureOnly?: boolean;
  /** Skip retries that Playwright itself already retried? Default false. */
  skipRetries?: boolean;
  concurrency?: number;
  maxAttempts?: number;
  /** Called after each upload; handy for logging. */
  onUpload?: (result: CaptureUploadResult) => void;
  /**
   * Repository config with per-test pixel thresholds. Defaults to `.vrt.json`
   * in the process working directory; a missing file is not an error.
   */
  configPath?: string;
  /** Called when the config file exists but cannot be read or parsed. */
  onConfigError?: (error: unknown) => void;
}

export interface VrtPlaywrightReporter {
  onTestEnd(
    test: PlaywrightTestLike,
    result: PlaywrightTestResultLike,
  ): void;
  onEnd(): Promise<void>;
  /** Test seam: results of the current run. */
  results(): CaptureUploadResult[];
}

function isScreenshot(attachment: PlaywrightAttachment): boolean {
  const name = attachment.name.toLowerCase();
  const path = attachment.path?.toLowerCase() ?? '';
  return (
    attachment.contentType === 'image/png' ||
    attachment.contentType === 'application/pdf' ||
    name.includes('screenshot') ||
    name.endsWith('.png') ||
    name.endsWith('.pdf') ||
    path.endsWith('.png') ||
    path.endsWith('.pdf')
  );
}

async function attachmentBody(
  attachment: PlaywrightAttachment,
): Promise<Uint8Array | undefined> {
  if (attachment.body) return attachment.body;
  if (attachment.path) return readFile(attachment.path);
  return undefined;
}

async function readConfig(
  options: PlaywrightReporterOptions,
): Promise<VrtConfig> {
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

// The canonical name of a test: Playwright's title path (file, describe blocks,
// title) joined with " / ". This is also what `.vrt.json` keys and the
// dashboard links are written in, so it stays the threshold lookup key.
function canonicalTestName(test: PlaywrightTestLike): string {
  const path = test.titlePath().filter((part) => part.length > 0);
  return path.length > 0 ? path.join(' / ') : test.title;
}

// A UnifiedTest name is a path segment and the API accepts letters, digits,
// hyphens and underscores only (100 characters max), so a title path like
// "checkout.spec.ts / cart summary" cannot be uploaded verbatim. Reducing it
// keeps the dashboard readable; an over-long name keeps a stable hash of the
// canonical name so two tests that share a prefix stay two tests.
const INVALID_NAME_CHARS = /[^a-zA-Z0-9_-]+/g;
const MAX_TEST_NAME_LENGTH = 100;

export function toTestName(test: PlaywrightTestLike): string {
  const canonical = canonicalTestName(test);
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

// Playwright loads a reporter configured by name, resolves the module and calls
// its default export with `new` — a named factory alone leaves
// `reporter: [['@fishkob/vrt/playwright', {...}]]` failing at startup with "file
// must export a single class". The class is therefore the integration; the
// factory stays as the programmatic entry point.
//
// It uploads the first screenshot/PDF attachment of each test into a VRT run,
// named after the test's title path.
export class VrtReporter implements VrtPlaywrightReporter {
  private readonly pending: Promise<void>[] = [];
  private readonly collected: CaptureUploadResult[] = [];

  // One read per reporter: every capture resolves its threshold against the
  // same config. A broken config must not silently drop uploads, so it is
  // reported and treated as "no thresholds".
  private readonly configPromise: Promise<VrtConfig>;

  constructor(private readonly options: PlaywrightReporterOptions) {
    this.configPromise = readConfig(options);
  }

  onTestEnd(test: PlaywrightTestLike, result: PlaywrightTestResultLike): void {
    const options = this.options;
    if (options.skipRetries && (result.retry ?? 0) > 0) return;
    const failed = result.status !== 'passed' && result.status !== 'skipped';
    if (options.uploadOnFailureOnly === true && !failed) return;

    const attachment = result.attachments.find(isScreenshot);
    if (!attachment) return;

    this.pending.push(
      (async () => {
        const body = await attachmentBody(attachment);
        if (!body) return;
        const config = await this.configPromise;
        const canonicalName = canonicalTestName(test);
        const name = toTestName(test);
        const threshold = thresholdForTest(config, [
          canonicalName,
          name,
          test.title,
        ]);
        const capture: CaptureUpload = {
          projectName: options.project,
          testName: name,
          kind: attachment.contentType === 'application/pdf' ? 'pdf' : 'image',
          file: new Blob([new Uint8Array(body)], {
            type: attachment.contentType ?? 'image/png',
          }),
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
        const [uploaded] = await uploadMany([capture], {
          apiKey: options.apiKey,
          baseUrl: options.apiUrl,
          concurrency: options.concurrency ?? 4,
          maxAttempts: options.maxAttempts ?? 3,
        });
        this.collected.push(uploaded);
        options.onUpload?.(uploaded);
      })(),
    );
  }

  async onEnd(): Promise<void> {
    // A reporter must never fail the test run because VRT was unreachable;
    // the upload results carry the failure for the caller/log.
    await Promise.allSettled(this.pending);
    this.pending.length = 0;
  }

  results(): CaptureUploadResult[] {
    return this.collected;
  }
}

export function createVrtReporter(
  options: PlaywrightReporterOptions,
): VrtPlaywrightReporter {
  return new VrtReporter(options);
}

export default VrtReporter;

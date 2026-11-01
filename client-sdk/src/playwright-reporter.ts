import { readFile } from 'node:fs/promises';
import {
  uploadMany,
  type CaptureUpload,
  type CaptureUploadResult,
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

// Playwright reporter that uploads the first screenshot/PDF attachment of each
// test into a VRT run. Test name defaults to the title path joined with " / ",
// which keeps tests from different files unique inside the project.
export function createVrtReporter(
  options: PlaywrightReporterOptions,
): VrtPlaywrightReporter {
  const pending: Promise<void>[] = [];
  const collected: CaptureUploadResult[] = [];

  function testName(test: PlaywrightTestLike): string {
    const path = test.titlePath().filter((part) => part.length > 0);
    return path.length > 0 ? path.join(' / ') : test.title;
  }

  return {
    onTestEnd(test, result) {
      if (options.skipRetries && (result.retry ?? 0) > 0) return;
      const failed = result.status !== 'passed' && result.status !== 'skipped';
      if (options.uploadOnFailureOnly === true && !failed) return;

      const attachment = result.attachments.find(isScreenshot);
      if (!attachment) return;

      pending.push(
        (async () => {
          const body = await attachmentBody(attachment);
          if (!body) return;
          const capture: CaptureUpload = {
            projectName: options.project,
            testName: testName(test),
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
          };
          const [uploaded] = await uploadMany([capture], {
            apiKey: options.apiKey,
            baseUrl: options.apiUrl,
            concurrency: options.concurrency ?? 4,
            maxAttempts: options.maxAttempts ?? 3,
          });
          collected.push(uploaded);
          options.onUpload?.(uploaded);
        })(),
      );
    },

    async onEnd() {
      // A reporter must never fail the test run because VRT was unreachable;
      // the upload results carry the failure for the caller/log.
      await Promise.allSettled(pending);
      pending.length = 0;
    },

    results() {
      return collected;
    },
  };
}

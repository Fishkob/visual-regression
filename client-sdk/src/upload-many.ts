import { createClient, createConfig, type Client } from '../client';
import { uploadControllerUpload } from '../sdk.gen';

export type CaptureKind = 'image' | 'pdf';

export interface CaptureUpload {
  projectName: string;
  testName: string;
  kind?: CaptureKind;
  file: Blob | File;
  viewport: string;
  browser: string;
  environment: string;
  branch?: string;
  targetBranch?: string;
  runKey?: string;
  commitSha?: string;
  commitMessage?: string;
  ciUrl?: string;
  /**
   * Pixel tolerance for this variant, usually resolved from `.vrt.json`. The
   * server applies it when the upload creates the baseline and can only
   * tighten an existing baseline (raising a threshold is an ADMIN action).
   */
  pixelDiffThreshold?: number;
}

export interface UploadManyOptions {
  apiKey: string;
  baseUrl?: string;
  /** Parallel uploads; the API caps uploads per key, so keep this modest. */
  concurrency?: number;
  /** Total attempts per capture (1 = no retry). */
  maxAttempts?: number;
  /** Base backoff for retryable failures (429, 5xx, network). */
  retryDelayMs?: number;
  /** Abort signal for the whole batch. */
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number) => void;
  /** Test seam: reuse a configured SDK client. */
  client?: Client;
}

export interface CaptureUploadResult {
  index: number;
  capture: CaptureUpload;
  ok: boolean;
  attempts: number;
  status?: number;
  data?: unknown;
  error?: string;
}

class UploadAttemptError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

const DEFAULT_CONCURRENCY = 4;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 500;

function abortError(): Error {
  const error = new Error('Upload batch aborted');
  error.name = 'AbortError';
  return error;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function isRetryable(status: number | undefined): boolean {
  return status === undefined || status === 429 || status >= 500;
}

function retryDelay(
  attempt: number,
  baseDelayMs: number,
  error: UploadAttemptError,
): number {
  if (error.retryAfterMs !== undefined) return error.retryAfterMs;
  return baseDelayMs * 2 ** (attempt - 1);
}

async function uploadOnce(
  client: Client,
  capture: CaptureUpload,
): Promise<unknown> {  const result = await uploadControllerUpload({
    client,
    path: {
      projectName: capture.projectName,
      testName: capture.testName,
    },
    query: { testKind: capture.kind ?? 'image' },
    body: {
      file: capture.file,
      viewport: capture.viewport,
      browser: capture.browser,
      environment: capture.environment,
      ...(capture.branch ? { branch: capture.branch } : {}),
      ...(capture.targetBranch
        ? { targetBranch: capture.targetBranch }
        : {}),
      ...(capture.runKey ? { runKey: capture.runKey } : {}),
      ...(capture.commitSha ? { commitSha: capture.commitSha } : {}),
      ...(capture.commitMessage
        ? { commitMessage: capture.commitMessage }
        : {}),
      ...(capture.ciUrl ? { ciUrl: capture.ciUrl } : {}),
      ...(capture.pixelDiffThreshold !== undefined
        ? { pixelDiffThreshold: capture.pixelDiffThreshold }
        : {}),
    },
  });

  const status = result.response?.status;
  if (result.error) {
    const retryAfter = result.response?.headers?.get('retry-after');
    const retryAfterSeconds = retryAfter ? Number(retryAfter) : NaN;
    const error = result.error;
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message: unknown }).message)
          : 'Upload failed';
    throw new UploadAttemptError(
      message,
      status,
      Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? retryAfterSeconds * 1000
        : undefined,
    );
  }
  return result.data;
}

async function uploadWithRetry(
  client: Client,
  capture: CaptureUpload,
  options: Required<Pick<UploadManyOptions, 'maxAttempts' | 'retryDelayMs'>>,
  signal?: AbortSignal,
): Promise<CaptureUploadResult> {
  let lastError: UploadAttemptError | undefined;
  let attempts = 0;
  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    attempts = attempt;
    if (signal?.aborted) throw abortError();
    try {
      const data = await uploadOnce(client, capture);
      return { index: -1, capture, ok: true, attempts: attempt, data };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      lastError =
        error instanceof UploadAttemptError
          ? error
          : new UploadAttemptError(
              error instanceof Error ? error.message : String(error),
            );
      if (!isRetryable(lastError.status) || attempt === options.maxAttempts) {
        break;
      }
      await sleep(
        retryDelay(attempt, options.retryDelayMs, lastError),
        signal,
      );
    }
  }
  return {
    index: -1,
    capture,
    ok: false,
    attempts,
    ...(lastError?.status !== undefined ? { status: lastError.status } : {}),
    ...(lastError ? { error: lastError.message } : {}),
  };
}

// Uploads a batch of captures into one run. Concurrency is bounded (the API
// rate-limits per key), retries back off on 429/5xx/network and honour
// Retry-After, and results keep the input order. A batch never rejects for a
// single capture's failure: callers decide what to do with `ok: false`.
export async function uploadMany(
  captures: CaptureUpload[],
  options: UploadManyOptions,
): Promise<CaptureUploadResult[]> {
  const concurrency = Math.max(
    1,
    Math.min(options.concurrency ?? DEFAULT_CONCURRENCY, 16),
  );
  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const retryDelayMs = Math.max(0, options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS);
  const client =
    options.client ??
    createClient(
      createConfig({
        baseUrl: options.baseUrl ?? 'http://localhost:3000/api/v1',
        headers: { 'x-api-key': options.apiKey },
      }),
    );

  const results = new Array<CaptureUploadResult>(captures.length);
  let next = 0;
  let completed = 0;

  async function worker(): Promise<void> {
    while (next < captures.length) {
      const index = next;
      next += 1;
      const result = await uploadWithRetry(
        client,
        captures[index],
        { maxAttempts, retryDelayMs },
        options.signal,
      );
      result.index = index;
      results[index] = result;
      completed += 1;
      options.onProgress?.(completed, captures.length);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, captures.length) }, () =>
      worker(),
    ),
  );
  return results;
}

// Repository config for CI uploads (`.vrt.json`). It is JSON on purpose: the
// SDK has zero runtime dependencies, and a YAML parser would be the first one.
export interface VrtConfig {
  /**
   * Pixel tolerance per test name, applied when the upload creates the
   * baseline. A value can tighten an existing baseline but never raise it —
   * raising a threshold auto-accepts pending comparisons and stays an ADMIN
   * action.
   */
  thresholds?: Record<string, number>;
}

export const VRT_CONFIG_FILE = '.vrt.json';

function isThreshold(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export function parseVrtConfig(value: unknown): VrtConfig {
  if (typeof value !== 'object' || value === null) return {};
  const raw = (value as { thresholds?: unknown }).thresholds;
  if (typeof raw !== 'object' || raw === null) return {};
  const thresholds: Record<string, number> = {};
  for (const [testName, threshold] of Object.entries(raw)) {
    if (testName.trim().length > 0 && isThreshold(threshold)) {
      thresholds[testName] = threshold;
    }
  }
  return Object.keys(thresholds).length > 0 ? { thresholds } : {};
}

/**
 * Resolve the configured tolerance for a test. The reporter's canonical name is
 * the joined title path (`checkout.spec.ts / cart summary`); a repository should
 * not have to guess that, so the bare title and the last path segment are also
 * accepted.
 */
export function thresholdForTest(
  config: VrtConfig,
  names: Array<string | undefined>,
): number | undefined {
  const thresholds = config.thresholds;
  if (!thresholds) return undefined;
  for (const name of names) {
    if (!name) continue;
    const exact = thresholds[name];
    if (exact !== undefined) return exact;
    const parts = name.split(' / ');
    const lastSegment = parts[parts.length - 1];
    if (lastSegment && thresholds[lastSegment] !== undefined) {
      return thresholds[lastSegment];
    }
  }
  return undefined;
}

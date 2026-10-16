const MAX_RATE_LIMIT_ATTEMPTS = 30;
const MAX_RETRY_DELAY_MS = 30_000;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function retryDelayMs(
  headers: Record<string, string | undefined>,
  attempt: number,
): number {
  const retryAfterSeconds = Number(headers['retry-after']);
  const delayMs =
    Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? retryAfterSeconds * 1000
      : 1000 * 2 ** (attempt - 1);
  return Math.min(delayMs, MAX_RETRY_DELAY_MS);
}

/**
 * Retry a seed request while the backend answers 429. A full demo seed uploads
 * far more screenshots per minute than UPLOAD_RATE_LIMIT_PER_MINUTE allows, and
 * a 429 used to be logged and then ignored — leaving half-seeded data behind a
 * "seeding complete" message.
 */
export async function withRateLimitRetry<
  T extends { status: number; headers?: Record<string, string | undefined> },
>(
  label: string,
  send: () => Promise<T>,
  options: { maxAttempts?: number } = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? MAX_RATE_LIMIT_ATTEMPTS;

  for (let attempt = 1; ; attempt += 1) {
    const res = await send();
    if (res.status !== 429) return res;
    if (attempt >= maxAttempts) {
      throw new Error(
        `${label} stayed rate limited (HTTP 429) after ${attempt} attempts — raise UPLOAD_RATE_LIMIT_PER_MINUTE or retry later.`,
      );
    }
    const delayMs = retryDelayMs(res.headers ?? {}, attempt);
    console.warn(
      `\n  ${label} hit the rate limit — retrying in ${Math.round(delayMs / 1000)}s (attempt ${attempt + 1}/${maxAttempts})`,
    );
    await sleep(delayMs);
  }
}

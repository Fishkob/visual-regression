import { withRateLimitRetry } from '@/scripts/seeds/rate-limit-retry';

describe('withRateLimitRetry', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns a successful response without retrying', async () => {
    const send = vi.fn().mockResolvedValue({ status: 201, headers: {} });

    await expect(withRateLimitRetry('upload', send)).resolves.toEqual({
      status: 201,
      headers: {},
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('passes non-429 failures back to the caller', async () => {
    const send = vi.fn().mockResolvedValue({ status: 500, headers: {} });

    await expect(withRateLimitRetry('upload', send)).resolves.toMatchObject({
      status: 500,
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('retries after a 429 until the request succeeds', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const send = vi
      .fn()
      .mockResolvedValueOnce({ status: 429, headers: {} })
      .mockResolvedValueOnce({ status: 201, headers: {} });

    const request = withRateLimitRetry('upload', send);
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(request).resolves.toMatchObject({ status: 201 });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('waits for retry-after before retrying', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const send = vi
      .fn()
      .mockResolvedValueOnce({ status: 429, headers: { 'retry-after': '5' } })
      .mockResolvedValueOnce({ status: 201, headers: {} });

    const request = withRateLimitRetry('upload', send);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(send).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    await expect(request).resolves.toMatchObject({ status: 201 });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('caps the retry delay at 30s', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const send = vi
      .fn()
      .mockResolvedValueOnce({ status: 429, headers: { 'retry-after': '600' } })
      .mockResolvedValueOnce({ status: 201, headers: {} });

    const request = withRateLimitRetry('upload', send);
    await vi.advanceTimersByTimeAsync(30_000);

    await expect(request).resolves.toMatchObject({ status: 201 });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('in 30s'));
  });

  it('gives up after the configured number of attempts', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const send = vi.fn().mockResolvedValue({ status: 429, headers: {} });

    const request = withRateLimitRetry('upload', send, { maxAttempts: 3 });
    const assertion = expect(request).rejects.toThrow(
      /stayed rate limited \(HTTP 429\) after 3 attempts/,
    );
    await vi.advanceTimersByTimeAsync(60_000);

    await assertion;
    expect(send).toHaveBeenCalledTimes(3);
  });
});

import {
  WEBHOOK_MAX_ATTEMPTS,
  nextAttemptAt,
} from '@internal/webhooks/webhook-backoff';

describe('nextAttemptAt', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');

  it.each([
    [1, 60_000],
    [2, 300_000],
    [3, 1_800_000],
    [4, 7_200_000],
  ])('backs off after attempt %i by %i ms', (attempts, delay) => {
    expect(nextAttemptAt(attempts, now)?.toISOString()).toBe(
      new Date(now.getTime() + delay).toISOString(),
    );
  });

  it('returns null once the attempt budget is exhausted', () => {
    expect(nextAttemptAt(WEBHOOK_MAX_ATTEMPTS, now)).toBeNull();
    expect(nextAttemptAt(WEBHOOK_MAX_ATTEMPTS + 1, now)).toBeNull();
  });
});

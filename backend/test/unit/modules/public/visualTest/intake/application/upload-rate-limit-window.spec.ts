import {
  computeWindowStart,
  retryAfterSeconds,
  RATE_LIMIT_WINDOW_MS,
} from '@public/visualTest/intake/application/upload-rate-limit-window';

describe('upload-rate-limit-window', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('computeWindowStart', () => {
    it('floors a timestamp to its minute boundary', () => {
      const now = new Date('2026-08-24T10:15:37.250Z').getTime();
      expect(computeWindowStart(now).toISOString()).toBe(
        '2026-08-24T10:15:00.000Z',
      );
    });

    it('keeps an exact minute boundary unchanged', () => {
      const now = new Date('2026-08-24T10:15:00.000Z').getTime();
      expect(computeWindowStart(now).toISOString()).toBe(
        '2026-08-24T10:15:00.000Z',
      );
    });
  });

  describe('retryAfterSeconds', () => {
    it('returns the seconds until the next minute boundary, min 1', () => {
      const now = new Date('2026-08-24T10:15:37.000Z').getTime();
      expect(retryAfterSeconds(now)).toBe(23);
    });

    it('returns 60 exactly at a boundary', () => {
      const now = new Date('2026-08-24T10:15:00.000Z').getTime();
      expect(retryAfterSeconds(now)).toBe(60);
    });

    it('returns 1 at the very end of the window (min-1 clamp)', () => {
      const now = new Date('2026-08-24T10:15:59.500Z').getTime();
      expect(retryAfterSeconds(now)).toBe(1);
    });

    it('window constant is 60 seconds', () => {
      expect(RATE_LIMIT_WINDOW_MS).toBe(60_000);
    });
  });
});

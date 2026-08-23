import { withTimeout } from '@common/utils/with-timeout';

describe('withTimeout', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('resolves with the work result when the work completes first', async () => {
    await expect(
      withTimeout(Promise.resolve('done'), 1000, () => new Error('timeout')),
    ).resolves.toBe('done');
  });

  it('rejects with the factory error and calls onTimeout when the work exceeds the deadline', async () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const promise = withTimeout(
      new Promise(() => {
        /* never settles */
      }),
      1000,
      () => new Error('timed out'),
      onTimeout,
    );

    const assertion = expect(promise).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;

    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('does not fire the timeout once the work already settled', async () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const promise = withTimeout(
      Promise.resolve('ok'),
      1000,
      () => new Error('timeout'),
      onTimeout,
    );

    await expect(promise).resolves.toBe('ok');
    await vi.advanceTimersByTimeAsync(2000);

    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('marks the losing promise handled so a late rejection is not an unhandled rejection', async () => {
    vi.useFakeTimers();
    const unhandled: unknown[] = [];
    const listener = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', listener);

    try {
      let rejectLate!: (error: Error) => void;
      const slow = new Promise((_resolve, reject) => {
        rejectLate = reject;
      });

      const promise = withTimeout(slow, 1000, () => new Error('timed out'));
      const assertion = expect(promise).rejects.toThrow('timed out');
      await vi.advanceTimersByTimeAsync(1000);
      await assertion;

      rejectLate(new Error('late failure'));
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();

      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', listener);
    }
  });
});

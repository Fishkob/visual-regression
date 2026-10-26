import { resolveRetention } from '@public/visualTest/core/domain/policies/retention-policy';

const defaults = {
  baselineRevisionLimit: 10,
  runHistoryDays: 90,
  orphanGraceHours: 24,
};

describe('RetentionPolicy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the project overrides when it has them', () => {
    expect(
      resolveRetention(
        {
          baselineRevisionLimit: 3,
          runHistoryDays: 7,
          orphanGraceHours: 168,
        },
        defaults,
      ),
    ).toEqual({
      baselineRevisionLimit: 3,
      runHistoryDays: 7,
      orphanGraceHours: 168,
    });
  });

  it('falls back to the deployment defaults for unset settings', () => {
    expect(resolveRetention({}, defaults)).toEqual(defaults);
    expect(
      resolveRetention(
        {
          baselineRevisionLimit: null,
          runHistoryDays: null,
          orphanGraceHours: null,
        },
        defaults,
      ),
    ).toEqual(defaults);
  });

  it('honours a stored zero instead of reading it as unset', () => {
    expect(
      resolveRetention(
        {
          baselineRevisionLimit: 0,
          runHistoryDays: 0,
          orphanGraceHours: 0,
        },
        defaults,
      ),
    ).toEqual({
      baselineRevisionLimit: 0,
      runHistoryDays: 0,
      orphanGraceHours: 0,
    });
  });

  it('resolves each setting independently', () => {
    expect(resolveRetention({ runHistoryDays: 30 }, defaults)).toEqual({
      baselineRevisionLimit: 10,
      runHistoryDays: 30,
      orphanGraceHours: 24,
    });
  });
});

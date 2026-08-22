import { vi } from 'vitest';
(globalThis as any).jest = {
  fn: vi.fn,
  spyOn: vi.spyOn,
  mock: vi.mock,
  clearAllMocks: vi.clearAllMocks,
  restoreAllMocks: vi.restoreAllMocks,
  resetAllMocks: vi.resetAllMocks,
  useFakeTimers: vi.useFakeTimers,
  useRealTimers: vi.useRealTimers,
  advanceTimersByTime: vi.advanceTimersByTime,
  setSystemTime: vi.setSystemTime,
  runOnlyPendingTimers: vi.runOnlyPendingTimers,
  runAllTimers: vi.runAllTimers,
  jest: undefined,
};

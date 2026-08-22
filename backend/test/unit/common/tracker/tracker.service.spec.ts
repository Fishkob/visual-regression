import { Test, TestingModule } from '@nestjs/testing';
import { Tracker } from '@common/tracker/tracker.service';
import {
  IMetricsRecorder,
  METRICS_RECORDER,
} from '@common/domain/metrics-recorder.interface';
import { AppLoggerService } from '@common/logging/app-logger.service';
import { createMock } from '@test/utils/create-mock';
import { createMockLogger } from '@test/utils/mocks';
describe('Tracker', () => {
  let tracker: Tracker;
  let metrics: jest.Mocked<IMetricsRecorder>;
  let logger: jest.Mocked<AppLoggerService>;

  beforeEach(async () => {
    metrics = createMock<IMetricsRecorder>();

    logger = createMockLogger();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        Tracker,
        { provide: METRICS_RECORDER, useValue: metrics },
        { provide: AppLoggerService, useValue: logger },
      ],
    }).compile();

    tracker = module.get(Tracker);
  });

  describe('track', () => {
    it('records metrics and logs on success', async () => {
      const fn = jest.fn().mockResolvedValue('result');

      const result = await tracker.track('test_op', fn, { foo: 'bar' });

      expect(result).toBe('result');
      expect(fn).toHaveBeenCalled();
      expect(metrics.observeHistogram).toHaveBeenCalledWith(
        'test_op_duration_ms',
        expect.any(Number),
      );
      expect(metrics.incrementCounter).toHaveBeenCalledWith('test_op_total', {
        status: 'success',
      });
      expect(logger.log).toHaveBeenCalledWith(
        'Operation test_op succeeded',
        expect.objectContaining({ foo: 'bar', duration: expect.any(Number) }),
      );
    });

    it('records metrics and logs on failure, re-throws error', async () => {
      const error = new Error('boom');
      const fn = jest.fn().mockRejectedValue(error);

      await expect(
        tracker.track('test_op', fn, { baz: 'qux' }),
      ).rejects.toThrow(error);

      expect(fn).toHaveBeenCalled();
      expect(metrics.observeHistogram).toHaveBeenCalledWith(
        'test_op_duration_ms',
        expect.any(Number),
      );
      expect(metrics.incrementCounter).toHaveBeenCalledWith('test_op_total', {
        status: 'failure',
      });
      expect(metrics.incrementCounter).toHaveBeenCalledWith(
        'test_op_errors_total',
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Operation test_op failed',
        expect.stringContaining('boom'),
        expect.objectContaining({ baz: 'qux', duration: expect.any(Number) }),
      );
    });

    it('works without meta', async () => {
      const fn = jest.fn().mockResolvedValue('ok');

      await tracker.track('no_meta', fn);

      expect(logger.log).toHaveBeenCalledWith(
        'Operation no_meta succeeded',
        expect.objectContaining({ duration: expect.any(Number) }),
      );
    });

    it('handles non-Error throws in catch', async () => {
      const fn = jest.fn().mockRejectedValue('string error');

      await expect(tracker.track('test_op', fn)).rejects.toBe('string error');

      expect(logger.error).toHaveBeenCalledWith(
        'Operation test_op failed',
        'string error',
        expect.any(Object),
      );
    });
  });
});

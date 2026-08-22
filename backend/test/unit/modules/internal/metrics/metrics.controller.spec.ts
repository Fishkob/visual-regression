import { Test, TestingModule } from '@nestjs/testing';
import { MetricsController } from '@internal/metrics/metrics.controller';
import { MetricsService } from '@internal/metrics/metrics.service';
import { MetricsAuthGuard } from '@internal/metrics/metrics-auth.guard';
import { createMock } from '@test/utils/create-mock';

describe('MetricsController', () => {
  let controller: MetricsController;
  let metrics: jest.Mocked<MetricsService>;

  beforeEach(async () => {
    metrics = createMock<MetricsService>();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetricsController],
      providers: [{ provide: MetricsService, useValue: metrics }],
    })
      .overrideGuard(MetricsAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(MetricsController);
  });

  describe('GET /metrics', () => {
    it('should return prometheus metrics text', async () => {
      metrics.getPrometheusMetrics.mockResolvedValue(
        '# HELP http_requests_total ...',
      );

      const result = await controller.getMetrics();

      expect(result).toBe('# HELP http_requests_total ...');
      expect(metrics.getPrometheusMetrics).toHaveBeenCalledTimes(1);
    });
  });
});

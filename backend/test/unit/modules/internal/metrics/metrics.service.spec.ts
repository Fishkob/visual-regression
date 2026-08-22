import { MetricsService } from '@internal/metrics/metrics.service';

type MockMetric = ReturnType<typeof createMockFn>;

const createMockFn = () => ({ inc: vi.fn(), set: vi.fn(), observe: vi.fn() });

const { mockMetrics, mockRegistry, collectDefaultMetrics, histogramBuckets } =
  vi.hoisted(() => {
    const metrics = new Map<string, ReturnType<typeof createMockFn>>();
    const buckets = new Map<string, number[] | null>();

    const registry = {
      getSingleMetric: vi.fn((name: string) => metrics.get(name) ?? null),
      metrics: vi.fn().mockResolvedValue('mock-prometheus-metrics'),
    };

    return {
      mockMetrics: metrics,
      mockRegistry: registry,
      collectDefaultMetrics: vi.fn(),
      histogramBuckets: buckets,
    };
  });

vi.mock('prom-client', () => ({
  default: {
    Registry: class {
      constructor() {
        return mockRegistry;
      }
    },
    collectDefaultMetrics,
    Counter: class {
      constructor(opts: { name: string }) {
        const m = createMockFn();
        mockMetrics.set(opts.name, m);
        return m;
      }
    },
    Gauge: class {
      constructor(opts: { name: string }) {
        const m = createMockFn();
        mockMetrics.set(opts.name, m);
        return m;
      }
    },
    Histogram: class {
      constructor(opts: { name: string; buckets?: number[] }) {
        const m = createMockFn();
        mockMetrics.set(opts.name, m);
        histogramBuckets.set(opts.name, opts.buckets ?? null);
        return m;
      }
    },
  },
}));

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(() => {
    mockMetrics.clear();
    histogramBuckets.clear();
    vi.clearAllMocks();
    service = new MetricsService();
  });

  describe('default metrics collection', () => {
    it('starts collecting default metrics when enabled', () => {
      expect(collectDefaultMetrics).toHaveBeenCalled();
    });
  });

  describe('incrementCounter', () => {
    it('should create and increment a counter on first call', () => {
      service.incrementCounter('test_counter', { env: 'prod' }, 5);

      const metric = mockMetrics.get('test_counter');
      expect(metric).toBeDefined();
      expect(metric!.inc).toHaveBeenCalledWith({ env: 'prod' }, 5);
    });

    it('should reuse existing counter on subsequent calls', () => {
      service.incrementCounter('test_counter', { env: 'prod' }, 5);
      service.incrementCounter('test_counter', { env: 'staging' }, 3);

      const metric = mockMetrics.get('test_counter');
      expect(metric!.inc).toHaveBeenCalledTimes(2);
    });

    it('should default value to 1', () => {
      service.incrementCounter('test_counter');

      const metric = mockMetrics.get('test_counter');
      expect(metric!.inc).toHaveBeenCalledWith({}, 1);
    });
  });

  describe('setGauge', () => {
    it('should create and set a gauge on first call', () => {
      service.setGauge('test_gauge', 42, { env: 'prod' });

      const metric = mockMetrics.get('test_gauge');
      expect(metric).toBeDefined();
      expect(metric!.set).toHaveBeenCalledWith({ env: 'prod' }, 42);
    });

    it('should reuse existing gauge', () => {
      service.setGauge('test_gauge', 42);
      service.setGauge('test_gauge', 10);

      expect(mockMetrics.get('test_gauge')!.set).toHaveBeenCalledTimes(2);
    });
  });

  describe('observeHistogram', () => {
    it('should create and observe a histogram on first call', () => {
      service.observeHistogram('test_histogram', 150, { env: 'prod' });

      const metric = mockMetrics.get('test_histogram');
      expect(metric).toBeDefined();
      expect(metric!.observe).toHaveBeenCalledWith({ env: 'prod' }, 150);
    });

    it('should reuse existing histogram', () => {
      service.observeHistogram('test_histogram', 150);
      service.observeHistogram('test_histogram', 200);

      expect(mockMetrics.get('test_histogram')!.observe).toHaveBeenCalledTimes(
        2,
      );
    });
  });

  describe('getPrometheusMetrics', () => {
    it('should return metrics from registry', async () => {
      const result = await service.getPrometheusMetrics();
      expect(result).toBe('mock-prometheus-metrics');
    });
  });

  describe('when disabled', () => {
    beforeEach(() => {
      service = new MetricsService(false);
      vi.clearAllMocks();
    });

    it('should not create or touch counters', () => {
      service.incrementCounter('test_counter', { env: 'prod' }, 5);

      expect(mockMetrics.get('test_counter')).toBeUndefined();
    });

    it('should not create or touch gauges', () => {
      service.setGauge('test_gauge', 42);

      expect(mockMetrics.get('test_gauge')).toBeUndefined();
    });

    it('should not create or touch histograms', () => {
      service.observeHistogram('test_histogram', 150);

      expect(mockMetrics.get('test_histogram')).toBeUndefined();
    });

    it('should not collect default metrics when disabled', () => {
      expect(collectDefaultMetrics).not.toHaveBeenCalled();
    });

    it('should not expose metrics when disabled', async () => {
      const result = await service.getPrometheusMetrics();
      expect(result).toBe('');
    });
  });

  describe('histogram buckets', () => {
    it('uses wide buckets for pixel diff histograms', () => {
      service.observeHistogram('comparison_pixel_diff', 5000000);

      expect(histogramBuckets.get('comparison_pixel_diff')).toEqual([
        0, 1, 10, 100, 1000, 10000, 100000, 1000000,
      ]);
    });

    it('uses page-sized buckets for pdf page diff histograms', () => {
      service.observeHistogram('comparison_pdf_page_diff', 5);

      expect(histogramBuckets.get('comparison_pdf_page_diff')).toEqual([
        0, 1, 2, 5, 10, 25, 50, 100,
      ]);
    });
  });
});

import type { Mocked } from 'vitest';
import { WorkerHealthServer } from '@internal/worker/worker-health-server';
import { AppConfigService } from '@config/app-config.service';
import { MetricsService } from '@internal/metrics/metrics.service';
import { createMockLogger } from '@test/utils/mocks';
import { createMock } from '@test/utils/create-mock';

interface HealthBody {
  status: 'ok' | 'error';
  uptime: number;
  lastJobProcessedAt: string | null;
  lastPollAt: string | null;
  jobsProcessed: number;
}

describe('WorkerHealthServer', () => {
  let healthServer: WorkerHealthServer;
  let baseUrl: string;
  let metrics: Mocked<MetricsService>;

  async function getHealth(path = '/health'): Promise<HealthBody> {
    const res = await fetch(`${baseUrl}${path}`);
    return (await res.json()) as HealthBody;
  }

  beforeEach(async () => {
    metrics = createMock<MetricsService>();
    metrics.getPrometheusMetrics.mockResolvedValue('comparison_pixel_diff 42');
    const appConfig = {
      workerHealth: { port: 0 },
      metrics: { apiKey: 'test-key' },
    } as unknown as AppConfigService;
    healthServer = new WorkerHealthServer(
      createMockLogger(),
      appConfig,
      metrics,
    );
    await healthServer.start();
    const address = (
      healthServer as unknown as {
        server: { address: () => { port: number } };
      }
    ).server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await healthServer.stop();
    vi.restoreAllMocks();
  });

  it('returns ok with a fresh lastPollAt', async () => {
    healthServer.recordPoll();

    const body = await getHealth();

    expect(body.status).toBe('ok');
    expect(body.lastPollAt).toBeTruthy();
  });

  it('returns ok before the first poll when started recently', async () => {
    const body = await getHealth();

    expect(body.status).toBe('ok');
    expect(body.lastPollAt).toBeNull();
  });

  it('returns error when lastPollAt is stale', async () => {
    healthServer.recordPoll();
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 200_000);

    const body = await getHealth();

    expect(body.status).toBe('error');
    expect(body.lastPollAt).toBeTruthy();
  });

  it('returns error when never polled and threshold elapsed since start', async () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 200_000);

    const body = await getHealth();

    expect(body.status).toBe('error');
    expect(body.lastPollAt).toBeNull();
  });

  it('serves the same payload on /api/v1/health', async () => {
    healthServer.recordPoll();

    const body = await getHealth('/api/v1/health');

    expect(body.status).toBe('ok');
  });

  it('recordJobProcessed also refreshes poll liveness', async () => {
    healthServer.recordJobProcessed();

    const body = await getHealth();

    expect(body.status).toBe('ok');
    expect(body.jobsProcessed).toBe(1);
    expect(body.lastJobProcessedAt).toBeTruthy();
    expect(body.lastPollAt).toBeTruthy();
  });

  it('returns 404 for unknown paths', async () => {
    const res = await fetch(`${baseUrl}/nope`);

    expect(res.status).toBe(404);
  });

  it('serves the process-local registry on /metrics with the metrics key', async () => {
    const res = await fetch(`${baseUrl}/metrics`, {
      headers: { 'x-metrics-key': 'test-key' },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    expect(await res.text()).toBe('comparison_pixel_diff 42');
  });

  it('serves metrics on /api/v1/metrics too', async () => {
    const res = await fetch(`${baseUrl}/api/v1/metrics`, {
      headers: { 'x-metrics-key': 'test-key' },
    });

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('comparison_pixel_diff 42');
  });

  it('rejects /metrics without the metrics key', async () => {
    const res = await fetch(`${baseUrl}/metrics`);

    expect(res.status).toBe(401);
    expect(metrics.getPrometheusMetrics).not.toHaveBeenCalled();
  });
});

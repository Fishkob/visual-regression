import type { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'node:net';
import { bootstrapApi } from '@/bootstrap';

// `TestApp` — the app every other e2e spec uses — re-states three pieces of the
// production bootstrap (global prefix, validation pipe, worker modules) and
// skips the rest: trust proxy, the body-size limits, helmet, CORS, the Swagger
// gate, the admin bootstrap and `listen` itself. A change to any of those stayed
// green, because the suite configured its own copy.
//
// This spec starts the real `bootstrapApi` on an ephemeral port and asserts what
// it configured, so the wiring is tested where it is written.
describe('API bootstrap (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    // The app config reads CORS_ORIGIN at construction, so it must be in place
    // before bootstrapApi runs.
    process.env.CORS_ORIGIN = 'http://localhost:5173';
    app = await bootstrapApi({ port: 0 });
    const { port } = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  it('listens on the port and serves the versioned health route', async () => {
    const response = await fetch(`${baseUrl}/api/v1/health`, {
      headers: { 'x-metrics-key': 'test-metrics-key' },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        results: expect.objectContaining({
          database: 'ok',
          storage: 'ok',
          queues: 'ok',
        }),
      }),
    );

    // The prefix is set by bootstrapApi: the unprefixed route does not exist.
    expect((await fetch(`${baseUrl}/health`)).status).toBe(404);
  });

  it('keeps the operator health endpoint behind the metrics key', async () => {
    expect((await fetch(`${baseUrl}/api/v1/health`)).status).toBe(401);
    expect((await fetch(`${baseUrl}/api/v1/health/live`)).status).toBe(200);
  });

  it('sends the security headers of the helmet configuration', async () => {
    const response = await fetch(`${baseUrl}/api/v1/health/live`);

    // Helmet's default is `same-origin`; `cross-origin` is this app's explicit
    // choice, so the header proves the configured call ran, not the defaults.
    expect(response.headers.get('cross-origin-resource-policy')).toBe(
      'cross-origin',
    );
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-dns-prefetch-control')).toBe('off');
  });

  it('answers a CORS preflight for the configured origin', async () => {
    const response = await fetch(`${baseUrl}/api/v1/health/live`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'GET',
      },
    });

    expect(response.headers.get('access-control-allow-origin')).toBe(
      'http://localhost:5173',
    );
    expect(response.headers.get('access-control-allow-credentials')).toBe(
      'true',
    );
  });

  it('caps the anonymous log endpoint below the global body limit', async () => {
    // 100 kB passes the global limit (MAX_BODY_SIZE_MB defaults to 10 MB) and
    // must still be rejected on /log, whose parser is 64 kB.
    const response = await fetch(`${baseUrl}/api/v1/log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-metrics-key': 'test-metrics-key',
      },
      body: JSON.stringify({ message: 'x'.repeat(100 * 1024) }),
    });

    expect(response.status).toBe(413);
  }, 30_000);

  it('mounts the Swagger route where the env allows it', async () => {
    // SWAGGER_ENABLED defaults to true outside production and false in it, so
    // this environment serves the docs; the assertion proves configureSwagger
    // ran without throwing and mounted the route.
    expect((await fetch(`${baseUrl}/docs`)).status).toBe(200);
  });
});

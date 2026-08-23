import { INestApplication } from '@nestjs/common';
import { TestApp } from '../_support/utils/test-app';
import request from 'supertest';

describe('Health API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await TestApp.init();
  });

  afterAll(async () => {
    await TestApp.close();
  });

  describe('GET /health', () => {
    it('should return 200 when all systems are healthy', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200);

      expect(res.body.results).toEqual(
        expect.objectContaining({
          database: 'ok',
          storage: 'ok',
          queues: 'ok',
        }),
      );
      expect(res.body).toHaveProperty('version');
      expect(res.body).toHaveProperty('buildInfo');
      expect(res.body.buildInfo).toHaveProperty('commitHash');
      expect(res.body.buildInfo).toHaveProperty('buildTime');
      expect(res.body.buildInfo).toHaveProperty('nodeVersion');
      expect(res.body).toHaveProperty('uptime');
      expect(res.body).toHaveProperty('checks');
      expect(res.body.checks).toHaveProperty('queues');
      expect(res.body.status).toBe('ok');
    });

    it('should include latency in health checks', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200);

      expect(res.body.checks.database.latencyMs).toBeDefined();
      expect(res.body.checks.storage.latencyMs).toBeDefined();
    });

    it('should return degraded status with warnings when appropriate', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200);

      expect(res.body.status).toMatch(/^(ok|degraded)$/);
    });
  });

  describe('GET /health/live', () => {
    it('should return 200 with ok status', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/health/live')
        .expect(200);

      expect(res.body.status).toBe('ok');
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body.buildInfo).toBeDefined();
    });
  });

  describe('GET /health/ready', () => {
    it('should return 200 when ready', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/health/ready')
        .expect(200);

      expect(res.body.status).toBe('ok');
      expect(res.body.checks).toBeDefined();
      expect(res.body.checks.queues).toBeDefined();
      expect(res.body.buildInfo).toBeDefined();
    });
  });

  describe('GET /health/db', () => {
    it('should return ok when database is healthy', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/health/db')
        .expect(200);

      expect(res.body.status).toBe('ok');
      expect(res.body.latencyMs).toBeDefined();
    });
  });

  describe('GET /health/storage', () => {
    it('should return ok when storage is healthy', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/health/storage')
        .expect(200);

      expect(res.body.status).toBe('ok');
      expect(res.body.latencyMs).toBeDefined();
    });
  });
});

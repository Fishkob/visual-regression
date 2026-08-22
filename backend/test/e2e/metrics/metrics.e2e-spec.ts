import { INestApplication } from '@nestjs/common';
import { TestApp } from '../_support/utils/test-app';
import request from 'supertest';

describe('Metrics API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await TestApp.init();
  });

  afterAll(async () => {
    await TestApp.close();
  });

  describe('GET /metrics (no key provided)', () => {
    it('should reject requests without the metrics key', async () => {
      await request(app.getHttpServer()).get('/api/v1/metrics').expect(401);
    });
  });

  describe('GET /metrics (key configured)', () => {
    it('should return prometheus metrics as text', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/metrics')
        .set('x-metrics-key', 'test-metrics-key')
        .expect(200);

      expect(res.headers['content-type']).toContain('text/plain');
      expect(typeof res.text).toBe('string');
      expect(res.text.length).toBeGreaterThan(0);
    });
  });
});

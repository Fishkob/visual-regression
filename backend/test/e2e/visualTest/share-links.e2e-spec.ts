import { INestApplication } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { TestApp } from '../_support/utils/test-app';
import { authRequest } from '../_support/utils/authenticated-request';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { PrismaClient } from '@/prisma/client';
import { hashPassword } from '@internal/auth/password-hasher';

describe('Share links (e2e)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let cookie: string;
  const baseline = path.join(__dirname, 'fixtures', 'baseline_black.png');

  beforeAll(async () => {
    app = await TestApp.init();
    db = app.get(PrismaConnection).client;
  });

  beforeEach(async () => {
    await TestApp.resetDb();
    await TestApp.createProject('shop');
    await authRequest(app)
      .post('/api/v1/projects/shop/tests/login/upload?testKind=image')
      .field('viewport', '1920x1080')
      .field('browser', 'Chrome')
      .field('environment', 'staging')
      .attach('file', fs.createReadStream(baseline))
      .expect(201);
    await db.user.create({
      data: {
        username: 'admin',
        passwordHash: await hashPassword('secret'),
        role: 'ADMIN',
      },
    });
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: 'secret' })
      .expect(200);
    cookie = login.get('Set-Cookie')![0].split(';')[0]!;
  }, 30_000);

  afterAll(async () => {
    await TestApp.close();
  });

  async function createShare(body: Record<string, unknown>) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/projects/shop/share-links')
      .set('Cookie', cookie)
      .send(body)
      .expect(201);
    return response.body as { token: string; link: { id: string } };
  }

  it('creates a project share and resolves it read-only', async () => {
    const share = await createShare({ scope: 'PROJECT' });
    const publicView = await request(app.getHttpServer())
      .post(`/api/v1/public/shares/${share.token}`)
      .send({})
      .expect(201);

    expect(publicView.body).toEqual(
      expect.objectContaining({
        scope: 'PROJECT',
        projectName: 'shop',
        project: { name: 'shop' },
      }),
    );
    expect(publicView.body.tests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'login', kind: 'image' }),
      ]),
    );

    const audit = await request(app.getHttpServer())
      .get('/api/v1/audit?action=share.access')
      .set('Cookie', cookie)
      .expect(200);
    expect(audit.body.data.length).toBeGreaterThan(0);
  });

  it('answers 404 when a project share lost its project', async () => {
    await TestApp.createProject('ghost');
    const share = await request(app.getHttpServer())
      .post('/api/v1/projects/ghost/share-links')
      .set('Cookie', cookie)
      .send({ scope: 'PROJECT' })
      .expect(201);

    await request(app.getHttpServer())
      .delete('/api/v1/projects/ghost')
      .set('Cookie', cookie)
      .expect(200);

    // A vanished target is a 404, not "a project with no tests" (ADR-038).
    await request(app.getHttpServer())
      .post(`/api/v1/public/shares/${share.body.token}`)
      .send({})
      .expect(404);
  });

  it('enforces an optional passphrase', async () => {
    const share = await createShare({
      scope: 'TEST',
      testName: 'login',
      passphrase: 'letmein',
    });
    await request(app.getHttpServer())
      .post(`/api/v1/public/shares/${share.token}`)
      .send({ passphrase: 'wrong' })
      .expect(403);

    const view = await request(app.getHttpServer())
      .post(`/api/v1/public/shares/${share.token}`)
      .send({ passphrase: 'letmein' })
      .expect(201);
    expect(view.body).toEqual(
      expect.objectContaining({
        scope: 'TEST',
        test: expect.objectContaining({ name: 'login', branchName: 'main' }),
      }),
    );
  });

  it('stops resolving once revoked or expired', async () => {
    const revoked = await createShare({ scope: 'PROJECT' });
    await request(app.getHttpServer())
      .delete(`/api/v1/share-links/${revoked.link.id}`)
      .set('Cookie', cookie)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/public/shares/${revoked.token}`)
      .send({})
      .expect(404);

    const expired = await createShare({ scope: 'PROJECT' });
    await db.shareLink.update({
      where: { id: expired.link.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await request(app.getHttpServer())
      .post(`/api/v1/public/shares/${expired.token}`)
      .send({})
      .expect(404);
  });
});

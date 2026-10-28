import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { TestApp } from '../_support/utils/test-app';
import { authRequest } from '../_support/utils/authenticated-request';
import { PrismaConnection } from '@/prisma/prisma-connection';
import type { PrismaClient } from '@/prisma/client';
import { hashPassword } from '@internal/auth/password-hasher';

describe('API key lifecycle (e2e)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let cookie: string;

  beforeAll(async () => {
    app = await TestApp.init();
    db = app.get(PrismaConnection).client;
  });

  beforeEach(async () => {
    await TestApp.resetDb();
    await TestApp.createProject('shop');
    await TestApp.createProject('other');
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
    cookie = login.get('Set-Cookie')![0]!.split(';')[0]!;
  }, 30_000);

  afterAll(async () => {
    await TestApp.close();
  });

  async function createKey(body: Record<string, unknown>) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/api-keys')
      .set('Cookie', cookie)
      .send(body)
      .expect(201);
    return response.body as {
      id: string;
      name: string;
      rawKey: string;
      keyHint: string;
      scopes: string[];
      projectNames: string[];
    };
  }

  async function auditRows(action: string, targetId: string) {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/audit?action=${action}&limit=100`)
      .set('Cookie', cookie)
      .expect(200);
    return (
      response.body.data as {
        actor: string;
        action: string;
        targetType: string;
        targetId: string;
        metadata: Record<string, unknown> | null;
      }[]
    ).filter((row) => row.targetId === targetId);
  }

  async function listKeys() {
    const response = await request(app.getHttpServer())
      .get('/api/v1/api-keys')
      .set('Cookie', cookie)
      .expect(200);
    return response.body as {
      id: string;
      keyHint: string | null;
      ownerUsername: string | null;
      status: string;
      revokedAt: string | null;
      revokedReason: string | null;
      expiresAt: string | null;
    }[];
  }

  it('creates a scoped key, reveals it once and lists only its hint', async () => {
    const created = await createKey({
      name: 'ci-read',
      scopes: ['read'],
      projectNames: ['shop'],
    });
    expect(created).toEqual(
      expect.objectContaining({
        name: 'ci-read',
        rawKey: expect.any(String),
        keyHint: expect.any(String),
        scopes: ['read'],
        projectNames: ['shop'],
        expiresAt: null,
      }),
    );
    expect(created.keyHint).toBe(created.rawKey.slice(-4));

    const listed = await listKeys();
    const row = listed.find((key) => key.id === created.id);
    expect(row).toEqual(
      expect.objectContaining({
        keyHint: created.keyHint,
        ownerUsername: 'admin',
        status: 'active',
        revokedAt: null,
        revokedReason: null,
      }),
    );
    expect(JSON.stringify(listed)).not.toContain(created.rawKey);
    expect(JSON.stringify(listed)).not.toContain('keyHash');

    await request(app.getHttpServer())
      .get('/api/v1/projects/shop')
      .set('x-api-key', created.rawKey)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/projects/other')
      .set('x-api-key', created.rawKey)
      .expect(403);

    const audit = await auditRows('api-key.create', created.id);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toEqual(
      expect.objectContaining({
        actor: 'admin',
        action: 'api-key.create',
        targetType: 'api-key',
        targetId: created.id,
        metadata: expect.objectContaining({
          name: 'ci-read',
          scopes: ['read'],
          projectNames: ['shop'],
        }),
      }),
    );
    expect(JSON.stringify(audit[0]!.metadata)).not.toContain(created.rawKey);
    expect(JSON.stringify(audit[0]!.metadata)).not.toContain('keyHash');
  });

  it('revokes a key with a reason and the credential stops authenticating', async () => {
    const created = await createKey({ name: 'ci-upload', scopes: ['read'] });
    await request(app.getHttpServer())
      .get('/api/v1/projects/shop')
      .set('x-api-key', created.rawKey)
      .expect(200);

    const revoked = await request(app.getHttpServer())
      .post(`/api/v1/api-keys/${created.id}/revoke`)
      .set('Cookie', cookie)
      .send({ reason: 'pipeline migrated' })
      .expect(200);
    expect(revoked.body).toEqual(
      expect.objectContaining({
        id: created.id,
        status: 'revoked',
        revokedReason: 'pipeline migrated',
        revokedAt: expect.any(String),
      }),
    );

    await request(app.getHttpServer())
      .get('/api/v1/projects/shop')
      .set('x-api-key', created.rawKey)
      .expect(401);

    // Revocation keeps the row for the trail and is idempotent.
    await request(app.getHttpServer())
      .post(`/api/v1/api-keys/${created.id}/revoke`)
      .set('Cookie', cookie)
      .send({})
      .expect(200);
    const row = (await listKeys()).find((key) => key.id === created.id);
    expect(row).toEqual(
      expect.objectContaining({
        status: 'revoked',
        revokedReason: 'pipeline migrated',
      }),
    );

    // The idempotent second revoke is a no-op and adds no second trail row.
    const audit = await auditRows('api-key.revoke', created.id);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toEqual(
      expect.objectContaining({
        actor: 'admin',
        targetType: 'api-key',
        metadata: expect.objectContaining({
          name: 'ci-upload',
          reason: 'pipeline migrated',
        }),
      }),
    );
  });

  it('deletes a never-used key but keeps a used one for the trail', async () => {
    const unused = await createKey({ name: 'never-used', scopes: ['read'] });

    const deleted = await request(app.getHttpServer())
      .delete(`/api/v1/api-keys/${unused.id}`)
      .set('Cookie', cookie)
      .expect(200);
    expect(deleted.body).toEqual({ success: true });
    expect((await listKeys()).map((key) => key.id)).not.toContain(unused.id);

    const used = await createKey({ name: 'used-once', scopes: ['read'] });
    await request(app.getHttpServer())
      .get('/api/v1/projects/shop')
      .set('x-api-key', used.rawKey)
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/api/v1/api-keys/${used.id}`)
      .set('Cookie', cookie)
      .expect(409);

    // 404 for an unknown key on every key route.
    await request(app.getHttpServer())
      .delete('/api/v1/api-keys/missing')
      .set('Cookie', cookie)
      .expect(404);

    const audit = await auditRows('api-key.delete', unused.id);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toEqual(
      expect.objectContaining({
        actor: 'admin',
        metadata: expect.objectContaining({ name: 'never-used' }),
      }),
    );
    // The refused delete of a used key leaves no delete row.
    expect(await auditRows('api-key.delete', used.id)).toHaveLength(0);
  });

  it('rotates a key and keeps the predecessor working during the grace window', async () => {
    const original = await createKey({
      name: 'ci-rotating',
      scopes: ['read'],
      projectNames: ['shop'],
    });

    const rotated = await request(app.getHttpServer())
      .post(`/api/v1/api-keys/${original.id}/rotate`)
      .set('Cookie', cookie)
      .send({ graceMinutes: 60 })
      .expect(201);
    expect(rotated.body).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: 'ci-rotating',
        rawKey: expect.any(String),
        scopes: ['read'],
        projectNames: ['shop'],
      }),
    );
    expect(rotated.body.id).not.toBe(original.id);
    expect(rotated.body.rawKey).not.toBe(original.rawKey);

    // Both credentials authenticate while the grace window is open.
    await request(app.getHttpServer())
      .get('/api/v1/projects/shop')
      .set('x-api-key', original.rawKey)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/projects/shop')
      .set('x-api-key', rotated.body.rawKey)
      .expect(200);

    const row = (await listKeys()).find((key) => key.id === original.id);
    expect(row).toEqual(
      expect.objectContaining({
        revokedReason: 'rotated',
        revokedAt: null,
        expiresAt: expect.any(String),
        status: 'active',
      }),
    );
    const retirement = await db.apiKey.findUniqueOrThrow({
      where: { id: original.id },
    });
    expect(retirement.replacedById).toBe(rotated.body.id);
    expect(retirement.name).not.toBe('ci-rotating');

    const audit = await auditRows('api-key.rotate', rotated.body.id);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toEqual(
      expect.objectContaining({
        actor: 'admin',
        targetType: 'api-key',
        metadata: expect.objectContaining({
          name: 'ci-rotating',
          replacesId: original.id,
          graceMinutes: 60,
        }),
      }),
    );

    // Once the grace window closes the predecessor stops authenticating.
    await db.apiKey.update({
      where: { id: original.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await request(app.getHttpServer())
      .get('/api/v1/projects/shop')
      .set('x-api-key', original.rawKey)
      .expect(401);
    const expired = (await listKeys()).find((key) => key.id === original.id);
    expect(expired).toEqual(expect.objectContaining({ status: 'expired' }));

    // A revoked key cannot be rotated again.
    await request(app.getHttpServer())
      .post(`/api/v1/api-keys/${rotated.body.id}/revoke`)
      .set('Cookie', cookie)
      .send({})
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/api-keys/${rotated.body.id}/rotate`)
      .set('Cookie', cookie)
      .send({})
      .expect(400);
  });

  it('keeps key management away from api keys themselves', async () => {
    await authRequest(app).get('/api/v1/api-keys').expect(403);
    await authRequest(app)
      .post('/api/v1/api-keys')
      .send({ name: 'from-key' })
      .expect(403);

    const created = await createKey({ name: 'victim', scopes: ['admin'] });
    await authRequest(app)
      .post(`/api/v1/api-keys/${created.id}/revoke`)
      .send({})
      .expect(403);
    await authRequest(app).delete(`/api/v1/api-keys/${created.id}`).expect(403);
  });
});

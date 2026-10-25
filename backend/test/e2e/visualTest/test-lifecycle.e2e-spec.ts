import { INestApplication } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { TestApp } from '../_support/utils/test-app';
import { authRequest } from '../_support/utils/authenticated-request';
import { waitForComparison } from '../_support/utils/wait-for-comparison';

describe('Test lifecycle (e2e)', () => {
  let app: INestApplication;
  const baseline = path.join(__dirname, 'fixtures', 'baseline_black.png');
  const mismatch = path.join(__dirname, 'fixtures', 'baseline_blue.png');

  beforeAll(async () => {
    app = await TestApp.init();
  });

  beforeEach(async () => {
    await TestApp.resetDb();
    await TestApp.createProject('shop');
  }, 30_000);

  afterAll(async () => {
    await TestApp.close();
  });

  function upload(testName: string, file: string) {
    return authRequest(app)
      .post(`/api/v1/projects/shop/tests/${testName}/upload?testKind=image`)
      .field('viewport', '1920x1080')
      .field('browser', 'Chrome')
      .field('environment', 'staging')
      .attach('file', fs.createReadStream(file));
  }

  it('renames, tags, mutes and unmutes a test', async () => {
    await upload('login', baseline).expect(201);

    const renamed = await authRequest(app)
      .patch('/api/v1/projects/shop/tests/login/metadata')
      .send({
        name: 'sign-in',
        description: 'Checkout sign in',
        tags: ['Checkout', 'checkout', 'UI'],
      })
      .expect(200);
    expect(renamed.body).toEqual(
      expect.objectContaining({
        name: 'sign-in',
        description: 'Checkout sign in',
        tags: ['checkout', 'ui'],
        isMuted: false,
      }),
    );

    const muted = await authRequest(app)
      .patch('/api/v1/projects/shop/tests/sign-in/metadata')
      .send({
        mutedUntil: new Date(Date.now() + 86_400_000).toISOString(),
        muteReason: 'Known design update',
      })
      .expect(200);
    expect(muted.body.isMuted).toBe(true);
    expect(muted.body.muteReason).toBe('Known design update');

    const unmuted = await authRequest(app)
      .patch('/api/v1/projects/shop/tests/sign-in/metadata')
      .send({ mutedUntil: null })
      .expect(200);
    expect(unmuted.body.isMuted).toBe(false);
  });

  it('rejects a rename to an existing test on the branch', async () => {
    await upload('login', baseline).expect(201);
    await upload('signup', baseline).expect(201);

    await authRequest(app)
      .patch('/api/v1/projects/shop/tests/login/metadata')
      .send({ name: 'signup' })
      .expect(409);
  });

  it('hides a muted pending comparison from the inbox until unmuted', async () => {
    await upload('login', baseline).expect(201);
    await upload('login', mismatch).expect(201);
    await waitForComparison(app, 'shop', 'login');

    const before = await authRequest(app)
      .get('/api/v1/projects/shop/tests/meta/pending')
      .expect(200);
    expect(before.body.data).toHaveLength(1);

    await authRequest(app)
      .patch('/api/v1/projects/shop/tests/login/metadata')
      .send({
        mutedUntil: new Date(Date.now() + 86_400_000).toISOString(),
        muteReason: 'known',
      })
      .expect(200);

    const muted = await authRequest(app)
      .get('/api/v1/projects/shop/tests/meta/pending')
      .expect(200);
    expect(muted.body.data).toHaveLength(0);

    await authRequest(app)
      .patch('/api/v1/projects/shop/tests/login/metadata')
      .send({ mutedUntil: null })
      .expect(200);

    const after = await authRequest(app)
      .get('/api/v1/projects/shop/tests/meta/pending')
      .expect(200);
    expect(after.body.data).toHaveLength(1);
  });

  it('renames a project and rejects a duplicate name', async () => {
    await TestApp.createProject('other');
    await authRequest(app)
      .patch('/api/v1/projects/shop')
      .send({ name: 'store' })
      .expect(200);
    await authRequest(app).get('/api/v1/projects/store').expect(200);
    await authRequest(app).get('/api/v1/projects/shop').expect(404);

    await authRequest(app)
      .patch('/api/v1/projects/store')
      .send({ name: 'other' })
      .expect(409);
  });

  it('reports the outcome history as a flake signal', async () => {
    await upload('login', baseline).expect(201);
    await upload('login', mismatch).expect(201);
    await waitForComparison(app, 'shop', 'login');

    const metadata = await authRequest(app)
      .get('/api/v1/projects/shop/tests/login/metadata')
      .expect(200);
    expect(metadata.body.flake).toEqual(
      expect.objectContaining({ changed: 1, clean: 0 }),
    );
  });
});

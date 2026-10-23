import { INestApplication } from '@nestjs/common';
import { TestApp } from '../_support/utils/test-app';
import { authRequest } from '../_support/utils/authenticated-request';

describe('Project groups (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await TestApp.init();
  });

  afterAll(async () => {
    await TestApp.close();
  });

  beforeEach(async () => {
    await TestApp.resetDb();
  }, 30_000);

  it('creates, assigns, unassigns and deletes a group', async () => {
    const group = await authRequest(app)
      .post('/api/v1/groups')
      .send({ name: 'Checkout' })
      .expect(201);
    expect(group.body).toMatchObject({ name: 'Checkout', projectCount: 0 });

    const project = await authRequest(app)
      .post('/api/v1/projects')
      .send({ name: 'checkout-ui', groupId: group.body.id })
      .expect(201);
    expect(project.body).toMatchObject({
      name: 'checkout-ui',
      groupId: group.body.id,
      groupName: 'Checkout',
    });

    const assigned = await authRequest(app)
      .get('/api/v1/projects/pending')
      .expect(200);
    expect(assigned.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'checkout-ui',
          groupId: group.body.id,
          groupName: 'Checkout',
          pendingCount: 0,
          testCount: 0,
        }),
      ]),
    );

    await authRequest(app)
      .patch('/api/v1/projects/checkout-ui')
      .send({ groupId: null })
      .expect(200);

    const unassigned = await authRequest(app)
      .get('/api/v1/projects/pending')
      .expect(200);
    expect(unassigned.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'checkout-ui',
          groupId: null,
          groupName: null,
        }),
      ]),
    );

    await authRequest(app)
      .delete(`/api/v1/groups/${group.body.id}`)
      .expect(200);
  });

  it('rejects duplicate group names', async () => {
    await authRequest(app)
      .post('/api/v1/groups')
      .send({ name: 'Checkout' })
      .expect(201);
    await authRequest(app)
      .post('/api/v1/groups')
      .send({ name: 'Checkout' })
      .expect(409);
  });

  it('unassigns projects when a group is deleted', async () => {
    const group = await authRequest(app)
      .post('/api/v1/groups')
      .send({ name: 'Checkout' })
      .expect(201);

    await authRequest(app)
      .post('/api/v1/projects')
      .send({ name: 'checkout-ui', groupId: group.body.id })
      .expect(201);

    await authRequest(app)
      .delete(`/api/v1/groups/${group.body.id}`)
      .expect(200);

    const projects = await authRequest(app)
      .get('/api/v1/projects/pending')
      .expect(200);
    expect(projects.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'checkout-ui',
          groupId: null,
          groupName: null,
        }),
      ]),
    );
  });

  it('renames groups and reports their project counts', async () => {
    const group = await authRequest(app)
      .post('/api/v1/groups')
      .send({ name: 'Checkout' })
      .expect(201);
    const existing = await authRequest(app)
      .post('/api/v1/groups')
      .send({ name: 'Storefront' })
      .expect(201);

    await authRequest(app)
      .post('/api/v1/projects')
      .send({ name: 'checkout-ui', groupId: group.body.id })
      .expect(201);

    const groups = await authRequest(app).get('/api/v1/groups').expect(200);
    expect(groups.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: group.body.id,
          name: 'Checkout',
          projectCount: 1,
        }),
      ]),
    );

    const renamed = await authRequest(app)
      .patch(`/api/v1/groups/${group.body.id}`)
      .send({ name: 'Checkout 2' })
      .expect(200);
    expect(renamed.body).toMatchObject({
      id: group.body.id,
      name: 'Checkout 2',
      projectCount: 1,
    });

    await authRequest(app)
      .patch(`/api/v1/groups/${group.body.id}`)
      .send({ name: 'Storefront' })
      .expect(409);

    await authRequest(app)
      .patch(`/api/v1/groups/${existing.body.id}`)
      .send({ name: 'Checkout 2' })
      .expect(409);

    await authRequest(app)
      .patch('/api/v1/groups/missing')
      .send({ name: 'New name' })
      .expect(404);
  });
});

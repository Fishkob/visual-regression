import { INestApplication } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { TestApp } from '../_support/utils/test-app';
import { authRequest } from '../_support/utils/authenticated-request';
import { waitForComparison } from '../_support/utils/wait-for-comparison';
import {
  STORAGE_PROVIDER,
  type IStorageProvider,
} from '@common/domain/storage-provider.interface';

describe('Branch baselines (e2e)', () => {
  let app: INestApplication;
  let storage: IStorageProvider;

  beforeAll(async () => {
    app = await TestApp.init();
    storage = app.get(STORAGE_PROVIDER);
  });

  beforeEach(async () => {
    await TestApp.resetDb();
  });

  afterAll(async () => {
    await TestApp.close();
  });

  const file = (name: string) =>
    fs.createReadStream(path.join(__dirname, 'fixtures', name));

  function upload(
    branch: string | undefined,
    environment: string,
    filename: string,
    testName = 'login',
    targetBranch?: string,
  ) {
    const req = authRequest(app).post(
      `/api/v1/projects/branch-app/tests/${testName}/upload?testKind=image`,
    );
    if (branch) req.field('branch', branch);
    if (targetBranch) req.field('targetBranch', targetBranch);
    return req
      .field('viewport', '1920x1080')
      .field('browser', 'chromium')
      .field('environment', environment)
      .attach('file', file(filename));
  }

  const patchBranch = (branch: string, body: Record<string, unknown>) =>
    authRequest(app)
      .patch('/api/v1/projects/branch-app/branches')
      .query({ branch })
      .send(body);

  it('inherits the main baseline and pins after approval', async () => {
    await upload(undefined, 'staging', 'baseline_black.png').expect(201);

    const feature = await upload(
      'feature/x',
      'staging',
      'baseline_blue.png',
    ).expect(201);
    expect(feature.body.status).toBe('comparison_queued');

    const pending = await waitForComparison(
      app,
      'branch-app',
      'login',
      { viewport: '1920x1080', browser: 'chromium', environment: 'staging' },
      'feature/x',
    );
    expect(pending.body.comparison.id).toBeDefined();

    await authRequest(app)
      .post('/api/v1/projects/branch-app/tests/login/approval')
      .query({ branch: 'feature/x' })
      .send({ comparisonId: pending.body.comparison.id })
      .expect(201);

    const main = await authRequest(app)
      .get('/api/v1/projects/branch-app/tests/login')
      .query({
        viewport: '1920x1080',
        browser: 'chromium',
        environment: 'staging',
      });
    expect(main.body.baseline.imageHash).toBeDefined();

    const featureDetails = await authRequest(app)
      .get('/api/v1/projects/branch-app/tests/login')
      .query({
        branch: 'feature/x',
        viewport: '1920x1080',
        browser: 'chromium',
        environment: 'staging',
      });
    expect(featureDetails.body.baseline.imageHash).not.toBe(
      main.body.baseline.imageHash,
    );
  });

  it('shows an unmaterialized test as inherited', async () => {
    await upload(undefined, 'staging', 'baseline_black.png').expect(201);
    // A branch only exists after its first upload; materialize it with a
    // different test so `login` remains inherited from main.
    await upload(
      'feature/empty',
      'staging',
      'baseline_blue.png',
      'other',
    ).expect(201);

    const list = await authRequest(app)
      .get('/api/v1/projects/branch-app/tests')
      .query({ branch: 'feature/empty' })
      .expect(200);

    expect(list.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'login',
          origin: 'inherited',
          inheritedFrom: 'main',
        }),
      ]),
    );
  });

  // Nearest-ancestor ranking over a real two-level chain (the unit test mocks
  // the SQL, so this is the only place the recursive CTE actually runs).
  it('surfaces the nearest ancestor for a two-level chain', async () => {
    await upload(undefined, 'staging', 'baseline_black.png', 'login').expect(
      201,
    );
    await upload('feature/a', 'staging', 'baseline_blue.png', 'login').expect(
      201,
    );
    // feature/b materializes only `other`; `login` stays inherited.
    await upload(
      'feature/b',
      'staging',
      'baseline_black.png',
      'other',
      'feature/a',
    ).expect(201);

    const list = await authRequest(app)
      .get('/api/v1/projects/branch-app/tests')
      .query({ branch: 'feature/b' })
      .expect(200);

    expect(list.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'login',
          origin: 'inherited',
          inheritedFrom: 'feature/a',
        }),
        expect.objectContaining({ name: 'other', origin: 'branch' }),
      ]),
    );
  });

  it('rejects uploads to an archived branch', async () => {
    await upload('feature/old', 'staging', 'baseline_black.png').expect(201);

    await authRequest(app)
      .patch('/api/v1/projects/branch-app/branches')
      .query({ branch: 'feature/old' })
      .send({ isArchived: true })
      .expect(200);

    await upload('feature/old', 'staging', 'baseline_blue.png').expect(409);
  });

  it('lands a legacy upload without branch on the default branch', async () => {
    await upload(undefined, 'staging', 'baseline_black.png').expect(201);

    const branches = await authRequest(app)
      .get('/api/v1/projects/branch-app/branches')
      .expect(200);

    expect(branches.body).toEqual([
      expect.objectContaining({ name: 'main', isDefault: true }),
    ]);
  });

  it('names the resolved branch in the upload response', async () => {
    const main = await upload(
      undefined,
      'staging',
      'baseline_black.png',
    ).expect(201);
    expect(main.body.branch).toBe('main');

    const feature = await upload(
      'feature/x',
      'staging',
      'baseline_blue.png',
    ).expect(201);
    expect(feature.body.branch).toBe('feature/x');
  });

  it('resolves a branch-only test through the kind endpoint', async () => {
    await upload(
      'feature/only',
      'staging',
      'baseline_black.png',
      'branch-only',
    ).expect(201);

    await authRequest(app)
      .get('/api/v1/projects/branch-app/tests/branch-only/kind')
      .expect(404);

    const res = await authRequest(app)
      .get('/api/v1/projects/branch-app/tests/branch-only/kind')
      .query({ branch: 'feature/only' })
      .expect(200);
    expect(res.body.kind).toBe('image');
  });

  // The design keeps approval comparisonId-based: the comparison identifies its
  // own test, so a client that never learned about branches still works.
  it('approves a feature-branch comparison without the branch parameter', async () => {
    await upload(undefined, 'staging', 'baseline_black.png').expect(201);
    await upload('feature/x', 'staging', 'baseline_blue.png').expect(201);

    const pending = await waitForComparison(
      app,
      'branch-app',
      'login',
      { viewport: '1920x1080', browser: 'chromium', environment: 'staging' },
      'feature/x',
    );

    await authRequest(app)
      .post('/api/v1/projects/branch-app/tests/login/approval')
      .send({ comparisonId: pending.body.comparison.id })
      .expect(201);
  });

  // A repeated parameter arrives as an array; Express would hand it to the pipe
  // and `.trim()` it into a 500. It is a 400 on every route: BranchNameValidationPipe
  // is the single owner of the parameter (the query DTO only whitelists it).
  it('rejects a repeated branch parameter as a client error', async () => {
    await authRequest(app)
      .get('/api/v1/projects/branch-app/tests?branch=main&branch=feature/x')
      .expect(400);
  });

  it('lists archived branches only when asked', async () => {
    await upload('feature/old', 'staging', 'baseline_black.png').expect(201);
    await patchBranch('feature/old', { isArchived: true }).expect(200);

    const hidden = await authRequest(app)
      .get('/api/v1/projects/branch-app/branches')
      .expect(200);
    expect(hidden.body.map((branch: { name: string }) => branch.name)).toEqual([
      'main',
    ]);

    const shown = await authRequest(app)
      .get('/api/v1/projects/branch-app/branches')
      .query({ includeArchived: 'true' })
      .expect(200);
    expect(shown.body.map((branch: { name: string }) => branch.name)).toEqual([
      'main',
      'feature/old',
    ]);
    expect(
      shown.body.find(
        (branch: { name: string }) => branch.name === 'feature/old',
      ),
    ).toMatchObject({ isArchived: true, isDefault: false });

    // A non-boolean value is a client error, not a silent "hide archived".
    await authRequest(app)
      .get('/api/v1/projects/branch-app/branches')
      .query({ includeArchived: '1' })
      .expect(400);
  });

  it('rejects an empty branch update', async () => {
    await upload('feature/x', 'staging', 'baseline_black.png').expect(201);

    await patchBranch('feature/x', {}).expect(400);
  });

  it('retargets a branch and refuses a cycle', async () => {
    await upload('feature/a', 'staging', 'baseline_black.png').expect(201);
    await upload('feature/b', 'staging', 'baseline_blue.png').expect(201);

    await patchBranch('feature/b', { targetBranch: 'feature/a' }).expect(200);

    await patchBranch('feature/a', { targetBranch: 'feature/b' }).expect(409);
    await patchBranch('feature/a', { targetBranch: 'feature/a' }).expect(409);
  });

  // Deleting a target would silently re-parent its dependants to the project
  // default (FK ON DELETE SET NULL) and their clones would keep the deleted
  // branch's content under a new label.
  it('refuses to delete a branch that another branch targets', async () => {
    await upload('feature/parent', 'staging', 'baseline_black.png').expect(201);
    await upload('feature/child', 'staging', 'baseline_blue.png').expect(201);
    await patchBranch('feature/child', {
      targetBranch: 'feature/parent',
    }).expect(200);

    await authRequest(app)
      .delete('/api/v1/projects/branch-app/branches')
      .query({ branch: 'feature/parent' })
      .expect(409);

    // Clearing the target makes the deletion legal again.
    await patchBranch('feature/child', { targetBranch: null }).expect(200);
    await authRequest(app)
      .delete('/api/v1/projects/branch-app/branches')
      .query({ branch: 'feature/parent' })
      .expect(200);
  });

  // The read-only rule for unmaterialized tests is what the UI's disabled
  // actions rely on; assert it over HTTP, not only in a mocked unit test.
  it('answers mutations on an inherited test with 409', async () => {
    await upload(undefined, 'staging', 'baseline_black.png').expect(201);
    // Materialize a different test so `login` stays inherited on the branch.
    await upload(
      'feature/empty',
      'staging',
      'baseline_blue.png',
      'other',
    ).expect(201);

    await authRequest(app)
      .delete('/api/v1/projects/branch-app/tests/login')
      .query({ branch: 'feature/empty' })
      .expect(409);

    await authRequest(app)
      .patch('/api/v1/projects/branch-app/tests/login/threshold')
      .query({ branch: 'feature/empty' })
      .send({ threshold: 12 })
      .expect(409);

    // The ancestor row is untouched and still inherited.
    const list = await authRequest(app)
      .get('/api/v1/projects/branch-app/tests')
      .query({ branch: 'feature/empty' })
      .expect(200);
    expect(list.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'login',
          origin: 'inherited',
          inheritedFrom: 'main',
        }),
      ]),
    );
  });

  // A feature-branch review must not create review state on the target branch.
  it('does not create review state on the target branch', async () => {
    await upload(undefined, 'staging', 'baseline_black.png').expect(201);
    await upload('feature/x', 'staging', 'baseline_blue.png').expect(201);
    await waitForComparison(
      app,
      'branch-app',
      'login',
      { viewport: '1920x1080', browser: 'chromium', environment: 'staging' },
      'feature/x',
    );

    const mainPending = await authRequest(app)
      .get('/api/v1/projects/branch-app/tests/meta/pending')
      .expect(200);
    expect(mainPending.body.meta.total).toBe(0);
    expect((await details()).body.comparison).toBeUndefined();
  });

  it('rejects an upload whose targetBranch contradicts the existing branch', async () => {
    await upload('feature/a', 'staging', 'baseline_black.png').expect(201);
    await upload('feature/b', 'staging', 'baseline_blue.png').expect(201);

    await upload(
      'feature/b',
      'staging',
      'baseline_black.png',
      'login',
      'feature/a',
    ).expect(409);
  });

  const variant = {
    viewport: '1920x1080',
    browser: 'chromium',
    environment: 'staging',
  };

  function details(branch?: string) {
    return authRequest(app)
      .get('/api/v1/projects/branch-app/tests/login')
      .query({ ...variant, ...(branch ? { branch } : {}) });
  }

  async function approve(branch: string | undefined, comparisonId: string) {
    const req = authRequest(app).post(
      '/api/v1/projects/branch-app/tests/login/approval',
    );
    if (branch) req.query({ branch });
    await req.send({ comparisonId }).expect(201);
  }

  // Promoting a branch is the most global operation of the feature: it changes
  // what an unqualified read resolves to and pins the promoted branch's clones.
  it('promotes a branch to default and pins its variants', async () => {
    await upload(undefined, 'staging', 'baseline_black.png').expect(201);
    await upload('feature/x', 'staging', 'baseline_blue.png').expect(201);

    const before = await details('feature/x');
    expect(before.body.baselineInherited).toBe(true);
    expect(before.body.inheritTarget).toBe('main');

    await authRequest(app)
      .patch('/api/v1/projects/branch-app')
      .send({ defaultBranchName: 'feature/x' })
      .expect(200);

    // An unqualified read now resolves the promoted branch.
    const project = await authRequest(app)
      .get('/api/v1/projects/branch-app')
      .expect(200);
    expect(project.body.branchName).toBe('feature/x');
    expect(project.body.defaultBranchName).toBe('feature/x');

    // The promoted branch has no target any more, and its clone is pinned.
    const after = await details('feature/x');
    expect(after.body.baselineInherited).toBe(false);
    expect(after.body.inheritTarget).toBeNull();
    const branches = await authRequest(app)
      .get('/api/v1/projects/branch-app/branches')
      .query({ includeArchived: 'true' })
      .expect(200);
    expect(
      branches.body.find(
        (branch: { name: string }) => branch.name === 'feature/x',
      ),
    ).toMatchObject({ isDefault: true, targetBranchName: null });
  });

  // PDF reads/downloads must be branch-scoped too: an inherited clone points at
  // the target's file, so the branch read has to serve it.
  it('scopes PDF details and downloads to the branch', async () => {
    const pdfPath = (name: string) =>
      path.join(__dirname, '..', 'pdfTest', 'fixtures', name);
    const pdfUpload = (branch: string | undefined, name: string) => {
      const request = authRequest(app).post(
        '/api/v1/projects/branch-app/tests/report/upload?testKind=pdf',
      );
      if (branch) request.field('branch', branch);
      return request
        .field('viewport', 'A4')
        .field('browser', 'pdf')
        .field('environment', 'production')
        .attach('file', fs.createReadStream(pdfPath(name)));
    };

    await pdfUpload(undefined, 'sample-v1.pdf').expect(201);
    await pdfUpload('feature/x', 'sample-v2.pdf').expect(201);

    const filters = {
      viewport: 'A4',
      browser: 'pdf',
      environment: 'production',
    };
    const featureDetails = await authRequest(app)
      .get('/api/v1/projects/branch-app/tests/report/pdf-details')
      .query({ ...filters, branch: 'feature/x' })
      .expect(200);
    expect(featureDetails.body.baselineInherited).toBe(true);
    expect(featureDetails.body.inheritTarget).toBe('main');

    const mainDownload = await authRequest(app)
      .get('/api/v1/projects/branch-app/tests/report/pdf-download')
      .query({ ...filters, type: 'baseline' })
      .expect(200);
    const branchDownload = await authRequest(app)
      .get('/api/v1/projects/branch-app/tests/report/pdf-download')
      .query({ ...filters, type: 'baseline', branch: 'feature/x' })
      .expect(200);
    expect(branchDownload.body).toEqual(mainDownload.body);
  });

  // The design's central promise: a feature branch follows the target until its
  // first approval, and compares against its own pinned baseline afterwards.
  // URLs are unique per upload, so they distinguish "followed" from "pinned"
  // even when the pixels happen to match.
  it('follows the target until the first approval and stops afterwards', async () => {
    await upload(undefined, 'staging', 'baseline_black.png').expect(201);
    const mainBlack = (await details()).body.baseline.imageUrl as string;

    // The feature branch inherits main's baseline.
    await upload('feature/x', 'staging', 'baseline_blue.png').expect(201);
    const inherited = await waitForComparison(
      app,
      'branch-app',
      'login',
      variant,
      'feature/x',
    );
    expect(inherited.body.baseline.imageUrl).toBe(mainBlack);

    // Main moves on: upload the other image and approve it on main.
    await upload(undefined, 'staging', 'baseline_blue.png').expect(201);
    const mainPending = await waitForComparison(
      app,
      'branch-app',
      'login',
      variant,
    );
    await approve(undefined, mainPending.body.comparison.id);
    const mainBlue = (await details()).body.baseline.imageUrl as string;
    expect(mainBlue).not.toBe(mainBlack);

    // The next feature upload refreshes the inherited clone from the target.
    await upload('feature/x', 'staging', 'baseline_black.png').expect(201);
    const followed = await waitForComparison(
      app,
      'branch-app',
      'login',
      variant,
      'feature/x',
    );
    expect(followed.body.baseline.imageUrl).toBe(mainBlue);

    // Approving on the branch pins its own baseline.
    await approve('feature/x', followed.body.comparison.id);
    const pinned = (await details('feature/x')).body.baseline
      .imageUrl as string;
    expect(pinned).not.toBe(mainBlue);

    // Main moves on again; the pinned branch must no longer follow.
    await upload(undefined, 'staging', 'baseline_black.png').expect(201);
    const mainPending2 = await waitForComparison(
      app,
      'branch-app',
      'login',
      variant,
    );
    await approve(undefined, mainPending2.body.comparison.id);
    expect((await details()).body.baseline.imageUrl).not.toBe(mainBlue);

    await upload('feature/x', 'staging', 'baseline_blue.png').expect(201);
    const stillPinned = await waitForComparison(
      app,
      'branch-app',
      'login',
      variant,
      'feature/x',
    );
    expect(stillPinned.body.baseline.imageUrl).toBe(pinned);
  });

  // The shared-file rule is the one that can destroy another branch's baseline:
  // the clone references the target's object, so reclamation must keep it.
  it("reclaims a deleted branch's own file but not the shared target file", async () => {
    await upload(undefined, 'staging', 'baseline_black.png').expect(201);
    const targetUrl = (await details()).body.baseline.imageUrl as string;
    expect(await storage.exists(targetUrl)).toBe(true);

    await upload('feature/x', 'staging', 'baseline_blue.png').expect(201);
    const pending = await waitForComparison(
      app,
      'branch-app',
      'login',
      variant,
      'feature/x',
    );
    const candidateUrl = pending.body.comparison.candidate.imageUrl as string;
    expect(await storage.exists(candidateUrl)).toBe(true);

    await authRequest(app)
      .delete('/api/v1/projects/branch-app/branches')
      .query({ branch: 'feature/x' })
      .expect(200);

    // The clone shared the target's object with main: it must survive.
    expect(await storage.exists(targetUrl)).toBe(true);
    // The branch's own upload is unreferenced now and is reclaimed.
    expect(await storage.exists(candidateUrl)).toBe(false);
  });
});

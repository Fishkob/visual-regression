import { INestApplication } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { TestApp } from '../_support/utils/test-app';
import { authRequest } from '../_support/utils/authenticated-request';
import { waitForComparison } from '../_support/utils/wait-for-comparison';

describe('Test variant gallery (e2e)', () => {
  let app: INestApplication;
  const black = path.join(__dirname, 'fixtures', 'baseline_black.png');
  const blue = path.join(__dirname, 'fixtures', 'baseline_blue.png');
  const pdf = path.join(
    __dirname,
    '..',
    'pdfTest',
    'fixtures',
    'sample-v1.pdf',
  );

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

  function upload(options: {
    file: string;
    viewport?: string;
    branch?: string;
    testName?: string;
  }) {
    const request = authRequest(app).post(
      `/api/v1/projects/shop/tests/${options.testName ?? 'login'}/upload?testKind=image`,
    );
    if (options.branch) request.field('branch', options.branch);
    return request
      .field('viewport', options.viewport ?? '1920x1080')
      .field('browser', 'Chrome')
      .field('environment', 'staging')
      .attach('file', fs.createReadStream(options.file));
  }

  function variants(branch?: string) {
    return authRequest(app)
      .get('/api/v1/projects/shop/tests/login/variants')
      .query(branch ? { branch } : {});
  }

  it('returns one row per variant with the pending one flagged', async () => {
    await upload({ file: black, viewport: '1920x1080' }).expect(201);
    await upload({ file: black, viewport: '1280x720' }).expect(201);
    await upload({ file: blue, viewport: '1920x1080' }).expect(201);

    const pending = await waitForComparison(app, 'shop', 'login', {
      viewport: '1920x1080',
      browser: 'Chrome',
      environment: 'staging',
    });
    expect(pending.body.comparison.mismatchPixelCount).toBeGreaterThan(0);

    const response = await variants().expect(200);
    expect(response.body.name).toBe('login');
    expect(response.body.kind).toBe('image');
    // Ordered by viewport, so the untouched variant comes first.
    expect(response.body.variants).toHaveLength(2);
    expect(response.body.variants[0]).toEqual(
      expect.objectContaining({
        viewport: '1280x720',
        browser: 'Chrome',
        environment: 'staging',
        status: 'UNCHANGED',
        baselineUrl: expect.any(String),
        signedBaselineUrl: expect.any(String),
        candidateUrl: null,
        signedCandidateUrl: null,
        mismatchPixelCount: null,
        baselineInherited: false,
      }),
    );
    expect(response.body.variants[1]).toEqual(
      expect.objectContaining({
        viewport: '1920x1080',
        browser: 'Chrome',
        environment: 'staging',
        status: 'PENDING_APPROVAL',
        baselineUrl: expect.any(String),
        candidateUrl: expect.any(String),
        signedCandidateUrl: expect.any(String),
        mismatchPixelCount: expect.any(Number),
        baselineInherited: false,
      }),
    );
    expect(response.body.variants[1].mismatchPixelCount).toBeGreaterThan(0);
    expect(response.body.variants[1].baselineUrl).not.toBe(
      response.body.variants[1].candidateUrl,
    );
  });

  it('flags a variant whose baseline is an inherited clone', async () => {
    await upload({ file: black }).expect(201);
    // The branch materialises `login` by uploading, and inherits main's baseline
    // as a clone until it approves something of its own.
    await upload({ file: blue, branch: 'feature/x' }).expect(201);
    await waitForComparison(
      app,
      'shop',
      'login',
      {
        viewport: '1920x1080',
        browser: 'Chrome',
        environment: 'staging',
      },
      'feature/x',
    );

    const response = await variants('feature/x').expect(200);
    expect(response.body.variants).toEqual([
      expect.objectContaining({
        viewport: '1920x1080',
        browser: 'Chrome',
        environment: 'staging',
        status: 'PENDING_APPROVAL',
        baselineInherited: true,
        baselineUrl: expect.any(String),
        candidateUrl: expect.any(String),
        mismatchPixelCount: expect.any(Number),
      }),
    ]);

    // The owning branch reads the same variant as not inherited; the flag is a
    // property of the branch's clone, not of the image.
    const main = await variants().expect(200);
    expect(main.body.variants[0]).toEqual(
      expect.objectContaining({ baselineInherited: false }),
    );
  });

  it('serves an unmaterialised inherited test through the target branch', async () => {
    await upload({ file: black }).expect(201);
    // The branch exists after its first upload; `login` stays unmaterialised.
    await upload({
      file: blue,
      branch: 'feature/empty',
      testName: 'other',
    }).expect(201);

    const response = await variants('feature/empty').expect(200);
    // The row belongs to the target branch's own variant, so it is not a clone
    // and reports `baselineInherited: false` — the flag tracks clones only.
    expect(response.body.variants).toEqual([
      expect.objectContaining({
        viewport: '1920x1080',
        status: 'UNCHANGED',
        baselineInherited: false,
        baselineUrl: expect.any(String),
        candidateUrl: null,
        mismatchPixelCount: null,
      }),
    ]);
  });

  it('answers 404 for an unknown test and serves a PDF test through the same read', async () => {
    await variants().expect(404);
    await authRequest(app)
      .get('/api/v1/projects/shop/tests/missing/variants')
      .expect(404);

    await authRequest(app)
      .post('/api/v1/projects/shop/tests/report/upload?testKind=pdf')
      .field('viewport', 'A4')
      .field('browser', 'pdf')
      .field('environment', 'production')
      .attach('file', fs.createReadStream(pdf))
      .expect(201);

    // The variant coordinates are kind-agnostic, so a PDF test resolves its own
    // variant through this read instead of a 400 (see getTestVariants): a
    // variant-less deep link to a PDF test needs it.
    const pdfVariants = await authRequest(app)
      .get('/api/v1/projects/shop/tests/report/variants')
      .expect(200);
    expect(pdfVariants.body.kind).toBe('pdf');
    expect(pdfVariants.body.variants).toHaveLength(1);
    expect(pdfVariants.body.variants[0]).toMatchObject({
      viewport: 'A4',
      browser: 'pdf',
      environment: 'production',
    });
  });
});

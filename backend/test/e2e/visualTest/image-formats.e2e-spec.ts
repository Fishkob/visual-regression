import { INestApplication } from '@nestjs/common';
import sharp from 'sharp';
import { TestApp } from '../_support/utils/test-app';
import { authRequest } from '../_support/utils/authenticated-request';

describe('Image formats and size policy (e2e)', () => {
  let app: INestApplication;

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

  async function image(format: 'png' | 'jpeg' | 'webp', width = 8, height = 8) {
    const pipeline = sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 200, g: 30, b: 40 },
      },
    });
    return format === 'png'
      ? pipeline.png().toBuffer()
      : format === 'jpeg'
        ? pipeline.jpeg().toBuffer()
        : pipeline.webp().toBuffer();
  }

  function upload(buffer: Buffer, filename: string, contentType: string) {
    return authRequest(app)
      .post('/api/v1/projects/shop/tests/login/upload?testKind=image')
      .field('viewport', '1920x1080')
      .field('browser', 'Chrome')
      .field('environment', 'staging')
      .attach('file', buffer, { filename, contentType });
  }

  it('accepts JPEG and WebP uploads by normalizing them to PNG', async () => {
    await upload(await image('jpeg'), 'baseline.jpg', 'image/jpeg').expect(201);

    const webp = await upload(
      await image('webp', 8, 8),
      'candidate.webp',
      'image/webp',
    ).expect(201);
    expect(webp.body.status).toBeDefined();
  });

  it('stores the per-test size policy and exposes it in metadata', async () => {
    await upload(await image('png'), 'baseline.png', 'image/png').expect(201);

    const updated = await authRequest(app)
      .patch('/api/v1/projects/shop/tests/login/metadata')
      .send({ sizePolicy: 'RESIZE' })
      .expect(200);
    expect(updated.body.sizePolicy).toBe('RESIZE');

    const metadata = await authRequest(app)
      .get('/api/v1/projects/shop/tests/login/metadata')
      .expect(200);
    expect(metadata.body.sizePolicy).toBe('RESIZE');
  });

  it('rejects an unsupported image MIME type', async () => {
    await upload(Buffer.from('gif'), 'x.gif', 'image/gif').expect(400);
  });
});

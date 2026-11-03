import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TestApp } from '../_support/utils/test-app';
const MAX_SCREENSHOT_SIZE = 5 * 1024 * 1024;
import { authRequest } from '../_support/utils/authenticated-request';

describe('Upload Baseline (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await TestApp.init();
    // ConfigModule.forRoot() reads process.env at module import time,
    // before beforeAll runs. Override the cached value after init.
    app.get(ConfigService).set('SCREENSHOT_MAX_SIZE_MB', 5);
  });

  beforeEach(async () => {
    await TestApp.resetDb();
    await TestApp.createProject('checkout-ui');
  });

  afterAll(async () => {
    await TestApp.close();
  });

  it('should reject upload if file exceeds max size', async () => {
    const PNG_HEADER = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const bigBuffer = Buffer.concat([
      PNG_HEADER,
      Buffer.alloc(MAX_SCREENSHOT_SIZE + 1 - PNG_HEADER.length, 0),
    ]);

    await authRequest(app)
      .post(
        '/api/v1/projects/checkout-ui/tests/login-form/upload?testKind=image',
      )
      .field('viewport', '1920x1080')
      .field('browser', 'Chrome')
      .field('environment', 'ci')
      .attach('file', bigBuffer, {
        filename: 'big.png',
        contentType: 'image/png',
      })
      .expect(413);
  });
});

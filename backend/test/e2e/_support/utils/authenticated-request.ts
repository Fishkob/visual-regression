import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { AppConfigService } from '@config/app-config.service';
import { E2E_API_KEY } from './e2e-api-key';

// E2E product requests authenticate with the shared e2e api key. Health and
// metrics stay unauthenticated (they are @Public()). supertest's agent() lets
// us set a default header applied to every request it issues. The header name
// comes from the app config so the test can't silently drift from the app.
export function authRequest(app: INestApplication) {
  const header =
    app.get(AppConfigService).auth.apiKeyHeader?.toLowerCase() ?? 'x-api-key';
  return request.agent(app.getHttpServer()).set(header, E2E_API_KEY);
}

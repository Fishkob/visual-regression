import * as path from 'path';
import request from 'supertest';

export const BASE_URL = 'http://localhost:3000';

export const FIXTURES_DIR = path.join(
  __dirname,
  '../../../test/e2e/visualTest/fixtures',
);

export const PDF_FIXTURES_DIR = path.join(
  __dirname,
  '../../../test/e2e/pdfTest/fixtures',
);

export const PROJECT_NAMES = {
  DEMO: ['checkout-ui', 'dashboard-ui', 'admin-ui'],
  E2E: ['e2e-project'],
  DEV: ['dev-project'],
} as const;

export const BROWSERS = ['Chrome', 'Firefox', 'Safari'] as const;
export const VIEWPORTS = ['1920x1080', '1366x768'] as const;
export const ENVIRONMENTS = ['staging', 'production', 'development'] as const;

export const BASELINE_PATH = path.join(FIXTURES_DIR, 'baseline_black.png');
export const BLUE_PATH = path.join(FIXTURES_DIR, 'baseline_blue.png');

// The shared e2e api key. TestApp seeds it into the backend DB and the e2e
// suite authenticates with it; seed-e2e falls back to it when no env key is
// configured. Living here (next to the seeds) keeps TestApp and seed-e2e from
// drifting on the value.
export const E2E_API_KEY = 'e2e-test-api-key';

export const PDF_BASELINE_PATH = path.join(PDF_FIXTURES_DIR, 'sample-v1.pdf');
export const PDF_CANDIDATE_PATH = path.join(PDF_FIXTURES_DIR, 'sample-v2.pdf');

export const DEMO_TESTS: Record<string, readonly string[]> = {
  'checkout-ui': [
    'login-form',
    'checkout-flow',
    'payment-form',
    'cart-summary',
    'pdf-report',
  ],
  'dashboard-ui': [
    'overview',
    'analytics',
    'settings',
    'user-profile',
    'pdf-report',
  ],
  'admin-ui': ['user-list', 'roles', 'permissions', 'audit-log', 'pdf-report'],
} as const;

export const E2E_TESTS: Record<string, readonly string[]> = {
  'e2e-project': ['login-form', 'checkout-flow'],
} as const;

export const DEV_TESTS: Record<string, readonly string[]> = {
  'dev-project': ['smoke-test', 'pdf-report'],
} as const;

export type Browser = (typeof BROWSERS)[number];
export type Viewport = (typeof VIEWPORTS)[number];
export type Environment = (typeof ENVIRONMENTS)[number];

/**
 * Resolve and verify the SEED_API_KEY used by the REST-based seeders. The API
 * now requires authentication, so a missing key aborts loudly instead of
 * surfacing as silent 401s.
 */
export function resolveSeedApiKey(): string {
  const key = process.env.SEED_API_KEY ?? '';
  if (!key) {
    console.error(
      'SEED_API_KEY is required to run the seeder (the API now requires authentication).',
    );
    process.exit(1);
  }
  return key;
}

export const seedAuth = (apiKey: string): { 'x-api-key': string } => ({
  'x-api-key': apiKey,
});

/**
 * Fail loudly if the configured API key is rejected by the backend. The seeds
 * upload via the REST API, so a key that was not provisioned in the backend DB
 * (or a missing SEED_API_KEY) would otherwise surface as silent 401s.
 */
export async function verifyApiKeyAuth(apiKey: string): Promise<void> {
  const res = await request(BASE_URL)
    .get('/api/v1/projects')
    .set('x-api-key', apiKey);

  if (res.status === 401 || res.status === 403) {
    console.error(
      `Authentication failed (${res.status}) with the configured API key.`,
    );
    console.error(
      'The key must exist in the backend database. Create one via POST /api/v1/admin/api-keys and set SEED_API_KEY (or E2E_API_KEY) to the returned rawKey.',
    );
    process.exit(1);
  }
}

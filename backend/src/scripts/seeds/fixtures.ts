import * as path from 'path';

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
export const RED_PATH = path.join(FIXTURES_DIR, 'baseline_red.png');

export const PDF_BASELINE_PATH = path.join(PDF_FIXTURES_DIR, 'sample-v1.pdf');
export const PDF_CANDIDATE_PATH = path.join(PDF_FIXTURES_DIR, 'sample-v2.pdf');

export const DEMO_TESTS: Record<string, readonly string[]> = {
  'checkout-ui': [
    'login-form',
    'checkout-flow',
    'payment-form',
    'cart-summary',
  ],
  'dashboard-ui': ['overview', 'analytics', 'settings', 'user-profile'],
  'admin-ui': ['user-list', 'roles', 'permissions', 'audit-log'],
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

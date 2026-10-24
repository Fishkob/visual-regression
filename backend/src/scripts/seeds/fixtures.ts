import * as path from 'path';
import request from 'supertest';
import { withRateLimitRetry } from './rate-limit-retry';

export const BASE_URL = process.env.SEED_BASE_URL ?? 'http://localhost:3000';

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

export async function createProject(
  apiKey: string,
  name: string,
): Promise<void> {
  process.stdout.write(`Creating project "${name}"... `);

  const res = await withRateLimitRetry(`creating project "${name}"`, () =>
    request(BASE_URL)
      .post('/api/v1/projects')
      .set('Content-Type', 'application/json')
      .set(seedAuth(apiKey))
      .send({ name }),
  );

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  const projectName = String(res.body?.name ?? '(no name)');
  if (res.status !== 201) {
    console.log(`\n  ${res.status} -> ${projectName}`);
    throw new Error(`Could not create project "${name}" (HTTP ${res.status}).`);
  }
  console.log(`done (${projectName})`);
}

export interface SeedUpload {
  apiKey: string;
  project: string;
  test: string;
  viewport: string;
  browser: string;
  environment: string;
  file: string;
  testKind: 'image' | 'pdf';
  /** Uploads to this branch; omitted means the project's default branch. */
  branch?: string;
  /** Target for a *newly created* branch (ignored when it already exists). */
  targetBranch?: string;
}

export interface BranchSeed {
  project: string;
  branch: string;
  test: string;
  environment: string;
  targetBranch?: string;
  file?: string;
  testKind?: 'image' | 'pdf';
  /** Archive the branch after seeding it, to exercise the archived state. */
  archive?: boolean;
}

// One pending review per branch scenario: the branch inherits the target's
// baseline and its upload produces a comparison on the branch, so the inbox
// shows a branch badge and the project view offers a branch switcher. Tests
// that are NOT listed here stay unmaterialized on the branch and read as
// inherited from the target.
export const DEMO_BRANCH_SEEDS: readonly BranchSeed[] = [
  {
    project: 'checkout-ui',
    branch: 'feature/checkout-v2',
    test: 'login-form',
    environment: 'staging',
  },
  {
    project: 'dashboard-ui',
    branch: 'feature/dashboard-redesign',
    test: 'overview',
    environment: 'staging',
  },
  {
    project: 'dashboard-ui',
    branch: 'feature/theme-refresh',
    test: 'settings',
    environment: 'staging',
    targetBranch: 'feature/dashboard-redesign',
  },
  {
    project: 'admin-ui',
    branch: 'release/1.2',
    test: 'user-list',
    environment: 'staging',
  },
  {
    project: 'admin-ui',
    branch: 'experiment/old-header',
    test: 'roles',
    environment: 'staging',
    archive: true,
  },
  {
    project: 'checkout-ui',
    branch: 'feature/checkout-v2',
    test: 'pdf-report',
    environment: 'staging',
    file: PDF_CANDIDATE_PATH,
    testKind: 'pdf',
  },
] as const;

export const DEV_BRANCH_SEEDS: readonly BranchSeed[] = [
  {
    project: 'dev-project',
    branch: 'feature/smoke',
    test: 'smoke-test',
    environment: 'development',
  },
  {
    project: 'dev-project',
    branch: 'release/dev',
    test: 'pdf-report',
    environment: 'development',
    file: PDF_CANDIDATE_PATH,
    testKind: 'pdf',
  },
] as const;

export async function uploadVariant({
  apiKey,
  project,
  test,
  viewport,
  browser,
  environment,
  file,
  testKind,
  branch,
  targetBranch,
}: SeedUpload): Promise<void> {
  const branchLabel = branch ? ` @${branch}` : '';
  const label = `${test} (${viewport}/${browser}/${environment}) [${testKind}]${branchLabel}`;
  process.stdout.write(`  Uploading ${label}... `);

  const res = await withRateLimitRetry(`uploading ${label}`, () => {
    let req = request(BASE_URL)
      .post(
        `/api/v1/projects/${encodeURIComponent(project)}/tests/${encodeURIComponent(test)}/upload`,
      )
      .query({ testKind })
      .set(seedAuth(apiKey))
      .field('viewport', viewport)
      .field('browser', browser)
      .field('environment', environment);
    if (branch) req = req.field('branch', branch);
    if (targetBranch) req = req.field('targetBranch', targetBranch);
    return req.attach('file', file);
  });

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  const info = String(res.body?.status ?? res.body?.error ?? '');
  console.log(`${res.status} -> ${info}`);
  if (res.status !== 201) {
    throw new Error(
      `Upload of ${label} failed (HTTP ${res.status}${info ? `: ${info}` : ''}).`,
    );
  }
}

export async function archiveBranch(
  apiKey: string,
  project: string,
  branch: string,
): Promise<void> {
  process.stdout.write(`  Archiving branch "${branch}"... `);

  const res = await withRateLimitRetry(`archiving branch "${branch}"`, () =>
    request(BASE_URL)
      .patch(`/api/v1/projects/${encodeURIComponent(project)}/branches`)
      .query({ branch })
      .set(seedAuth(apiKey))
      .send({ isArchived: true }),
  );

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  const info = String(res.body?.message ?? res.body?.error ?? '');
  console.log(`${res.status}${info ? ` -> ${info}` : ''}`);
  if (res.status !== 200) {
    throw new Error(
      `Archiving branch "${branch}" failed (HTTP ${res.status}${info ? `: ${info}` : ''}).`,
    );
  }
}

/**
 * Seeds one pending review per branch scenario (each upload on a branch that
 * has no own baseline clones the target's baseline) and archives the scenarios
 * that ask for it, so a local checkout has feature-branch data to review.
 */
export async function seedBranches(
  apiKey: string,
  seeds: readonly BranchSeed[],
): Promise<void> {
  for (const seed of seeds) {
    await uploadVariant({
      apiKey,
      project: seed.project,
      test: seed.test,
      viewport: VIEWPORTS[0],
      browser: BROWSERS[0],
      environment: seed.environment,
      file: seed.file ?? BLUE_PATH,
      testKind: seed.testKind ?? 'image',
      branch: seed.branch,
      targetBranch: seed.targetBranch,
    });
    if (seed.archive) {
      await archiveBranch(apiKey, seed.project, seed.branch);
    }
  }
}

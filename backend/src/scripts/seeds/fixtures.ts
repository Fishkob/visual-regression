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

export type DemoStoryState = 'pending' | 'unchanged' | 'muted' | 'approved';

// One state per demo test, so a fresh demo shows what the product distinguishes
// instead of a dozen identical pendings: a reviewable change, a clean test, a
// muted pending (which the run gate does not hold against you) and a test whose
// change was approved — that one also gets a baseline revision and an approval
// history row.
export const DEMO_STORY: Record<string, Record<string, DemoStoryState>> = {
  'checkout-ui': {
    'login-form': 'pending',
    'checkout-flow': 'unchanged',
    'payment-form': 'approved',
    'cart-summary': 'muted',
  },
  'dashboard-ui': {
    overview: 'pending',
    analytics: 'unchanged',
    settings: 'approved',
    'user-profile': 'muted',
  },
  'admin-ui': {
    'user-list': 'pending',
    roles: 'unchanged',
    permissions: 'approved',
    'audit-log': 'muted',
  },
};

export function demoStoryState(project: string, test: string): DemoStoryState {
  return DEMO_STORY[project]?.[test] ?? 'pending';
}

const MUTE_WINDOW_DAYS = 14;
const APPROVAL_POLL_MS = 1_000;
const APPROVAL_TIMEOUT_MS = 90_000;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function muteTest(
  apiKey: string,
  project: string,
  test: string,
  reason: string,
): Promise<void> {
  process.stdout.write(`  Muting "${test}"... `);
  const mutedUntil = new Date(
    Date.now() + MUTE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const res = await withRateLimitRetry(`muting "${test}"`, () =>
    request(BASE_URL)
      .patch(
        `/api/v1/projects/${encodeURIComponent(project)}/tests/${encodeURIComponent(test)}/metadata`,
      )
      .set('Content-Type', 'application/json')
      .set(seedAuth(apiKey))
      .send({ mutedUntil, muteReason: reason }),
  );

  console.log(String(res.status));
  if (res.status !== 200) {
    throw new Error(`Muting "${test}" failed (HTTP ${res.status}).`);
  }
}

/**
 * Waits for the worker to turn the test's upload into a pending comparison, then
 * approves it through the same endpoint the UI uses ("approve all pending" for
 * the test), so the demo ends up with an approval, a baseline revision and a
 * clean test instead of another pending row.
 */
export async function approvePendingTest(
  apiKey: string,
  project: string,
  test: string,
  timeoutMs = APPROVAL_TIMEOUT_MS,
): Promise<void> {
  process.stdout.write(`  Approving "${test}"... `);
  const basePath = `/api/v1/projects/${encodeURIComponent(project)}/tests/${encodeURIComponent(test)}`;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const variants = await request(BASE_URL)
      .get(`${basePath}/variants`)
      .set(seedAuth(apiKey));
    if (variants.status === 401 || variants.status === 403) {
      console.log(
        `skipped (the seed API key needs read and approve scopes, got HTTP ${variants.status})`,
      );
      return;
    }
    const rows =
      (variants.body as { variants?: { status?: string }[] } | undefined)
        ?.variants ?? [];

    if (rows.some((row) => row.status === 'PENDING_APPROVAL')) {
      const approved = await withRateLimitRetry(`approving "${test}"`, () =>
        request(BASE_URL)
          .post(`${basePath}/approvals/all`)
          .set(seedAuth(apiKey)),
      );
      if (approved.status === 403) {
        console.log(
          'skipped (the seed API key needs the approve scope for this one)',
        );
        return;
      }
      const count =
        (approved.body as { approved?: number } | undefined)?.approved ?? 0;
      console.log(`${approved.status} -> ${count} approved`);
      if (approved.status !== 201) {
        throw new Error(
          `Approving "${test}" failed (HTTP ${approved.status}).`,
        );
      }
      return;
    }

    await sleep(APPROVAL_POLL_MS);
  }

  throw new Error(
    `No pending comparison for "${test}" appeared within ${Math.round(
      timeoutMs / 1000,
    )}s — is the worker running?`,
  );
}

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
  /** Groups the upload into a CI run on the Runs page. */
  runKey?: string;
  commitSha?: string;
  commitMessage?: string;
  ciUrl?: string;
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
  runKey,
  commitSha,
  commitMessage,
  ciUrl,
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
    if (runKey) req = req.field('runKey', runKey);
    if (commitSha) req = req.field('commitSha', commitSha);
    if (commitMessage) req = req.field('commitMessage', commitMessage);
    if (ciUrl) req = req.field('ciUrl', ciUrl);
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

export interface SeedGroup {
  id: string;
  name: string;
}

// Seeding is idempotent: a repeated run reuses the group instead of failing on
// the unique name, so `dev.sh seed` can be run any number of times.
export async function ensureGroup(
  apiKey: string,
  name: string,
): Promise<SeedGroup> {
  const list = await request(BASE_URL)
    .get('/api/v1/groups')
    .set(seedAuth(apiKey));
  const groups = (list.body as SeedGroup[] | undefined) ?? [];
  const existing = groups.find((group) => group.name === name);
  if (existing) return existing;

  process.stdout.write(`Creating group "${name}"... `);
  const res = await withRateLimitRetry(`creating group "${name}"`, () =>
    request(BASE_URL)
      .post('/api/v1/groups')
      .set('Content-Type', 'application/json')
      .set(seedAuth(apiKey))
      .send({ name }),
  );
  if (res.status !== 201) {
    throw new Error(`Could not create group "${name}" (HTTP ${res.status}).`);
  }
  console.log('done');
  return res.body as SeedGroup;
}

export async function assignProjectGroup(
  apiKey: string,
  project: string,
  groupId: string,
): Promise<void> {
  process.stdout.write(`  Moving "${project}" into its group... `);
  const res = await withRateLimitRetry(`moving project "${project}"`, () =>
    request(BASE_URL)
      .patch(`/api/v1/projects/${encodeURIComponent(project)}`)
      .set('Content-Type', 'application/json')
      .set(seedAuth(apiKey))
      .send({ groupId }),
  );
  console.log(String(res.status));
  if (res.status !== 200) {
    throw new Error(
      `Could not move project "${project}" (HTTP ${res.status}).`,
    );
  }
}

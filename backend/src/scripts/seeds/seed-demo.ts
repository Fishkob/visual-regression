import {
  BASE_URL,
  BROWSERS,
  DEMO_BRANCH_SEEDS,
  DEMO_TESTS,
  PDF_BASELINE_PATH,
  PDF_CANDIDATE_PATH,
  PROJECT_NAMES,
  VIEWPORTS,
  approvePendingTest,
  assignProjectGroup,
  createProject,
  demoStoryState,
  ensureGroup,
  muteTest,
  resolveSeedApiKey,
  seedAuth,
  seedBranches,
  uploadVariant,
  verifyApiKeyAuth,
} from './fixtures';
import { createSeedImages } from './generated-images';
/**
 * Demo Seeder - Seeds realistic data for presentation/demos
 * - 3 Projects with 4 image tests and 1 PDF test each
 * - All browsers & viewports
 * - One state per image test (DEMO_STORY): pending, unchanged, muted or approved
 * - Feature branches with pending branch reviews (one archived branch)
 * - Cleans existing data first
 */
import request from 'supertest';

const SEED_API_KEY = resolveSeedApiKey();
const AUTH_HEADERS = seedAuth(SEED_API_KEY);

// One CI run per demo project: the candidate uploads below share its runKey and
// commit context, so the Runs page and the run gate have something to show.
const DEMO_RUNS: Record<
  string,
  { runKey: string; commitSha: string; commitMessage: string; ciUrl: string }
> = {
  'checkout-ui': {
    runKey: 'ci-4821',
    commitSha: '9fceb02',
    commitMessage: 'feat: refresh checkout surfaces',
    ciUrl: 'https://ci.example.com/runs/4821',
  },
  'dashboard-ui': {
    runKey: 'ci-4822',
    commitSha: '4d1a7c9',
    commitMessage: 'feat: rework dashboard cards',
    ciUrl: 'https://ci.example.com/runs/4822',
  },
  'admin-ui': {
    runKey: 'ci-4823',
    commitSha: 'c0ffee1',
    commitMessage: 'fix: update admin tables',
    ciUrl: 'https://ci.example.com/runs/4823',
  },
};

// Groups make the dashboard's grouping surfaces (projects, inbox, filters)
// non-empty in a local demo.
const DEMO_GROUPS: Record<string, string[]> = {
  Storefront: ['checkout-ui'],
  Backoffice: ['dashboard-ui', 'admin-ui'],
};

async function deleteExistingProjects() {
  try {
    const res = await request(BASE_URL)
      .get('/api/v1/projects')
      .set(AUTH_HEADERS);
    const projects = (res.body.data as { name: string }[]) ?? [];

    if (projects.length > 0) {
      console.log(`Cleaning up ${projects.length} existing project(s)...`);
    }

    for (const p of projects) {
      if (!p.name) continue;
      await request(BASE_URL)
        .delete(`/api/v1/projects/${encodeURIComponent(p.name)}`)
        .set(AUTH_HEADERS);
    }
  } catch (err) {
    console.error(
      `Could not fetch existing projects: ${(err as Error).message}`,
    );
  }
}

async function seed() {
  console.log('Seeding DEMO data via REST...\n');

  await verifyApiKeyAuth(SEED_API_KEY);

  await deleteExistingProjects();

  const images = createSeedImages();
  let candidateIndex = 0;
  const approvals: { project: string; test: string }[] = [];

  for (const project of PROJECT_NAMES.DEMO) {
    await createProject(SEED_API_KEY, project);

    const tests = DEMO_TESTS[project];
    if (!tests) continue;

    for (const test of tests) {
      // Skip PDF tests in the image upload loop
      if (test === 'pdf-report') continue;

      for (const browser of BROWSERS) {
        for (const viewport of VIEWPORTS) {
          await uploadVariant({
            apiKey: SEED_API_KEY,
            project,
            test,
            viewport,
            browser,
            environment: 'staging',
            file: images.baseline,
            testKind: 'image',
          });
        }
      }

      const state = demoStoryState(project, test);
      // `unchanged` re-uploads the baseline itself, so the upload takes the
      // identical path and the test keeps reading UNCHANGED.
      const candidate =
        state === 'unchanged'
          ? images.baseline
          : (images.candidates[candidateIndex] ?? images.baseline);
      if (state !== 'unchanged') candidateIndex++;

      await uploadVariant({
        apiKey: SEED_API_KEY,
        project,
        test,
        viewport: VIEWPORTS[0],
        browser: BROWSERS[0],
        environment: 'staging',
        file: candidate,
        testKind: 'image',
        ...DEMO_RUNS[project],
      });

      if (state === 'muted') {
        await muteTest(
          SEED_API_KEY,
          project,
          test,
          'Known flake: the third-party widget renders a few frames late',
        );
      }
      if (state === 'approved') {
        approvals.push({ project, test });
      }
    }

    // Seed PDF tests
    await uploadVariant({
      apiKey: SEED_API_KEY,
      project,
      test: 'pdf-report',
      viewport: VIEWPORTS[0],
      browser: BROWSERS[0],
      environment: 'staging',
      file: PDF_BASELINE_PATH,
      testKind: 'pdf',
    });

    await uploadVariant({
      apiKey: SEED_API_KEY,
      project,
      test: 'pdf-report',
      viewport: VIEWPORTS[0],
      browser: BROWSERS[0],
      environment: 'staging',
      file: PDF_CANDIDATE_PATH,
      testKind: 'pdf',
      ...DEMO_RUNS[project],
    });
  }

  console.log('\nApproving the demo tests that should read as clean...');
  for (const { project, test } of approvals) {
    await approvePendingTest(SEED_API_KEY, project, test);
  }

  console.log('\nSeeding project groups...');
  for (const [groupName, projects] of Object.entries(DEMO_GROUPS)) {
    const group = await ensureGroup(SEED_API_KEY, groupName);
    for (const project of projects) {
      await assignProjectGroup(SEED_API_KEY, project, group.id);
    }
  }

  console.log('\nSeeding branch scenarios...');
  await seedBranches(SEED_API_KEY, DEMO_BRANCH_SEEDS);

  console.log('\nDemo seeding complete!');
  console.log('Open http://localhost:5173 to view the seeded demo data.');
  console.log(
    'Every image test is seeded in one state: pending (waiting for review), unchanged (clean), muted (excluded from the run gate) or approved (with a baseline revision). PDF tests are pending.',
  );
  console.log(
    'Branches: checkout-ui/feature/checkout-v2, dashboard-ui/feature/dashboard-redesign and feature/theme-refresh, admin-ui/release/1.2 (pending reviews) and admin-ui/experiment/old-header (archived).',
  );
}

seed().catch((err: unknown) => {
  console.error('Seeding failed:', (err as Error).message);
  process.exit(1);
});

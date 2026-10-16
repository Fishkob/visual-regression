import {
  BASELINE_PATH,
  BASE_URL,
  BLUE_PATH,
  BROWSERS,
  DEMO_TESTS,
  PDF_BASELINE_PATH,
  PDF_CANDIDATE_PATH,
  PROJECT_NAMES,
  VIEWPORTS,
  createProject,
  resolveSeedApiKey,
  seedAuth,
  uploadVariant,
  verifyApiKeyAuth,
} from './fixtures';
/**
 * Demo Seeder - Seeds realistic data for presentation/demos
 * - 3 Projects with 4 tests each
 * - All browsers & viewports
 * - Cleans existing data first
 */
import request from 'supertest';

const SEED_API_KEY = resolveSeedApiKey();
const AUTH_HEADERS = seedAuth(SEED_API_KEY);

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
            file: BASELINE_PATH,
            testKind: 'image',
          });
        }
      }

      await uploadVariant({
        apiKey: SEED_API_KEY,
        project,
        test,
        viewport: VIEWPORTS[0],
        browser: BROWSERS[0],
        environment: 'staging',
        file: BLUE_PATH,
        testKind: 'image',
      });
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
    });
  }

  console.log('\nDemo seeding complete!');
  console.log('Open http://localhost:5173 to view the seeded demo data.');
}

seed().catch((err: unknown) => {
  console.error('Seeding failed:', (err as Error).message);
  process.exit(1);
});

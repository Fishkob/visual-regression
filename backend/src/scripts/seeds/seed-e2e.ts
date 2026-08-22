import {
  BASELINE_PATH,
  BASE_URL,
  BROWSERS,
  E2E_TESTS,
  PROJECT_NAMES,
  RED_PATH,
  VIEWPORTS,
} from './fixtures';
/**
 * E2E Seeder - Seeds minimal data for E2E tests
 * - 1 Project with 2 tests
 * - All browsers & viewports
 * - Does NOT clean existing data
 */
import request from 'supertest';

async function createProject(name: string) {
  process.stdout.write(`Creating project "${name}"... `);
  try {
    const res = await request(BASE_URL)
      .post('/api/v1/projects')
      .set('Content-Type', 'application/json')
      .send({ name });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const projectName = res.body?.name ?? '(no name)';
    console.log(
      res.status === 201
        ? `done (${projectName})`
        : `${res.status} ${projectName}`,
    );
  } catch (err) {
    console.error('Error:', (err as Error).message);
  }
}

async function uploadVariant({
  project,
  test,
  viewport,
  browser,
  environment,
  image,
}: {
  project: string;
  test: string;
  viewport: string;
  browser: string;
  environment: string;
  image: string;
}) {
  const label = `${test} (${viewport}/${browser}/${environment})`;
  process.stdout.write(`  Uploading ${label}... `);

  try {
    const res = await request(BASE_URL)
      .post(
        `/api/v1/projects/${encodeURIComponent(project)}/tests/${encodeURIComponent(test)}/upload`,
      )
      .query({ testKind: 'image' })
      .field('viewport', viewport)
      .field('browser', browser)
      .field('environment', environment)
      .attach('file', image);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const info = String(res.body?.status ?? res.body?.error ?? '');
    console.log(`${res.status} -> ${info}`);
  } catch (err) {
    console.error(`Failed to upload ${label}: ${(err as Error).message}`);
  }
}

async function seed() {
  console.log('Seeding E2E test data via REST...\n');

  for (const project of PROJECT_NAMES.E2E) {
    await createProject(project);

    const tests = E2E_TESTS[project];
    if (!tests) continue;

    for (const test of tests) {
      for (const browser of BROWSERS) {
        for (const viewport of VIEWPORTS) {
          await uploadVariant({
            project,
            test,
            viewport,
            browser,
            environment: 'staging',
            image: BASELINE_PATH,
          });
        }
      }

      await uploadVariant({
        project,
        test,
        viewport: VIEWPORTS[0],
        browser: BROWSERS[0],
        environment: 'staging',
        image: RED_PATH,
      });
    }
  }

  console.log('\nE2E seeding complete!');
}

seed().catch((err: unknown) => {
  console.error('Seeding failed:', (err as Error).message);
  process.exit(1);
});

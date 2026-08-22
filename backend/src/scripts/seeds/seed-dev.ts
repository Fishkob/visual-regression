import {
  BASELINE_PATH,
  BASE_URL,
  BROWSERS,
  DEV_TESTS,
  PDF_BASELINE_PATH,
  PDF_CANDIDATE_PATH,
  PROJECT_NAMES,
  VIEWPORTS,
} from './fixtures';
/**
 * Dev Seeder - Seeds minimal data for local development
 * - 1 Project with 1 image test + 1 PDF test
 * - Single browser/viewport
 * - Uses development environment
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
  file,
  testKind,
}: {
  project: string;
  test: string;
  viewport: string;
  browser: string;
  environment: string;
  file: string;
  testKind: string;
}) {
  const label = `${test} (${viewport}/${browser}/${environment}) [${testKind}]`;
  process.stdout.write(`  Uploading ${label}... `);

  try {
    const res = await request(BASE_URL)
      .post(
        `/api/v1/projects/${encodeURIComponent(project)}/tests/${encodeURIComponent(test)}/upload`,
      )
      .query({ testKind })
      .field('viewport', viewport)
      .field('browser', browser)
      .field('environment', environment)
      .attach('file', file);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const info = String(res.body?.status ?? res.body?.error ?? '');
    console.log(`${res.status} -> ${info}`);
  } catch (err) {
    console.error(`Failed to upload ${label}: ${(err as Error).message}`);
  }
}

async function seed() {
  console.log('Seeding DEV local fixtures via REST...\n');

  for (const project of PROJECT_NAMES.DEV) {
    await createProject(project);

    const tests = DEV_TESTS[project];
    if (!tests) continue;

    for (const test of tests) {
      // Skip PDF tests in the image upload loop
      if (test === 'pdf-report') continue;

      await uploadVariant({
        project,
        test,
        viewport: VIEWPORTS[0],
        browser: BROWSERS[0],
        environment: 'development',
        file: BASELINE_PATH,
        testKind: 'image',
      });
    }

    // Seed PDF tests
    await uploadVariant({
      project,
      test: 'pdf-report',
      viewport: VIEWPORTS[0],
      browser: BROWSERS[0],
      environment: 'development',
      file: PDF_BASELINE_PATH,
      testKind: 'pdf',
    });

    await uploadVariant({
      project,
      test: 'pdf-report',
      viewport: VIEWPORTS[0],
      browser: BROWSERS[0],
      environment: 'development',
      file: PDF_CANDIDATE_PATH,
      testKind: 'pdf',
    });
  }

  console.log('\nDev seeding complete!');
}

seed().catch((err: unknown) => {
  console.error('Seeding failed:', (err as Error).message);
  process.exit(1);
});

import {
  BASELINE_PATH,
  BASE_URL,
  BLUE_PATH,
  BROWSERS,
  E2E_API_KEY,
  E2E_TESTS,
  PROJECT_NAMES,
  VIEWPORTS,
  verifyApiKeyAuth,
} from './fixtures';
/**
 * E2E Seeder - Seeds minimal data for E2E tests
 * - 1 Project with 2 tests
 * - All browsers & viewports
 * - Does NOT clean existing data
 */
import * as fs from 'fs';
import request from 'supertest';

let AUTH_HEADERS: { 'x-api-key': string };

async function resolveApiKey(): Promise<string> {
  if (process.env.E2E_API_KEY) {
    console.log('Using E2E_API_KEY from the environment.');
    return process.env.E2E_API_KEY;
  }

  if (process.env.SEED_API_KEY) {
    console.log('Using SEED_API_KEY from the environment.');
    return process.env.SEED_API_KEY;
  }

  if (process.env.ADMIN_API_KEY) {
    console.log('Provisioning an API key via the admin endpoint...');
    const res = await request(BASE_URL)
      .post('/api/v1/admin/api-keys')
      .set('Content-Type', 'application/json')
      .set('x-admin-key', process.env.ADMIN_API_KEY)
      .send({ name: 'ci-e2e-seed' });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const rawKey = String(res.body?.rawKey ?? '');
    if (res.status !== 201 || !rawKey) {
      console.error(
        `Could not create an API key via the admin endpoint: ${res.status}`,
      );
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      console.error(JSON.stringify(res.body ?? res.error));
      process.exit(1);
    }
    return rawKey;
  }

  console.warn(
    `Neither E2E_API_KEY, SEED_API_KEY, nor ADMIN_API_KEY is set — falling back to "${E2E_API_KEY}".`,
  );
  return E2E_API_KEY;
}

async function createProject(name: string) {
  process.stdout.write(`Creating project "${name}"... `);
  try {
    const res = await request(BASE_URL)
      .post('/api/v1/projects')
      .set('Content-Type', 'application/json')
      .set(AUTH_HEADERS)
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
      .set(AUTH_HEADERS)
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

  const apiKey = await resolveApiKey();
  AUTH_HEADERS = { 'x-api-key': apiKey };
  await verifyApiKeyAuth(apiKey);

  if (process.env.E2E_API_KEY_FILE) {
    fs.writeFileSync(process.env.E2E_API_KEY_FILE, apiKey, 'utf8');
    console.log(`Wrote resolved API key to ${process.env.E2E_API_KEY_FILE}`);
  }

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
        image: BLUE_PATH,
      });
    }
  }

  console.log('\nE2E seeding complete!');
}

seed().catch((err: unknown) => {
  console.error('Seeding failed:', (err as Error).message);
  process.exit(1);
});

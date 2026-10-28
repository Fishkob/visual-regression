import {
  BASELINE_PATH,
  BASE_URL,
  BLUE_PATH,
  BROWSERS,
  E2E_API_KEY,
  E2E_TESTS,
  PROJECT_NAMES,
  VIEWPORTS,
  createProject,
  uploadVariant,
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
      .send({
        name: 'ci-e2e-seed',
        // The seed creates and deletes projects (admin), uploads (upload) and
        // approves (approve) — request every scope it uses, not the default.
        scopes: ['upload', 'read', 'approve', 'admin'],
      });

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

async function seed() {
  console.log('Seeding E2E test data via REST...\n');

  const apiKey = await resolveApiKey();
  await verifyApiKeyAuth(apiKey);

  if (process.env.E2E_API_KEY_FILE) {
    fs.writeFileSync(process.env.E2E_API_KEY_FILE, apiKey, 'utf8');
    console.log(`Wrote resolved API key to ${process.env.E2E_API_KEY_FILE}`);
  }

  for (const project of PROJECT_NAMES.E2E) {
    await createProject(apiKey, project);

    const tests = E2E_TESTS[project];
    if (!tests) continue;

    for (const test of tests) {
      for (const browser of BROWSERS) {
        for (const viewport of VIEWPORTS) {
          await uploadVariant({
            apiKey,
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
        apiKey,
        project,
        test,
        viewport: VIEWPORTS[0],
        browser: BROWSERS[0],
        environment: 'staging',
        file: BLUE_PATH,
        testKind: 'image',
      });
    }
  }

  console.log('\nE2E seeding complete!');
}

seed().catch((err: unknown) => {
  console.error('Seeding failed:', (err as Error).message);
  process.exit(1);
});

import {
  BASELINE_PATH,
  BROWSERS,
  DEV_TESTS,
  PDF_BASELINE_PATH,
  PDF_CANDIDATE_PATH,
  PROJECT_NAMES,
  VIEWPORTS,
  createProject,
  resolveSeedApiKey,
  uploadVariant,
  verifyApiKeyAuth,
} from './fixtures';
/**
 * Dev Seeder - Seeds minimal data for local development
 * - 1 Project with 1 image test + 1 PDF test
 * - Single browser/viewport
 * - Uses development environment
 * - Does NOT clean existing data
 */

const SEED_API_KEY = resolveSeedApiKey();

async function seed() {
  console.log('Seeding DEV local fixtures via REST...\n');

  await verifyApiKeyAuth(SEED_API_KEY);

  for (const project of PROJECT_NAMES.DEV) {
    await createProject(SEED_API_KEY, project);

    const tests = DEV_TESTS[project];
    if (!tests) continue;

    for (const test of tests) {
      // Skip PDF tests in the image upload loop
      if (test === 'pdf-report') continue;

      await uploadVariant({
        apiKey: SEED_API_KEY,
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
      apiKey: SEED_API_KEY,
      project,
      test: 'pdf-report',
      viewport: VIEWPORTS[0],
      browser: BROWSERS[0],
      environment: 'development',
      file: PDF_BASELINE_PATH,
      testKind: 'pdf',
    });

    await uploadVariant({
      apiKey: SEED_API_KEY,
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

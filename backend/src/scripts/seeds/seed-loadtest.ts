import {
  BASELINE_PATH,
  BASE_URL,
  BROWSERS,
  DEMO_TESTS,
  ENVIRONMENTS,
  FIXTURES_DIR,
  PROJECT_NAMES,
  VIEWPORTS,
} from './fixtures';
import * as path from 'path';
import request from 'supertest';

const RED_PATH = path.join(FIXTURES_DIR, 'baseline_red.png');
const BLUE_PATH = path.join(FIXTURES_DIR, 'baseline_blue.png');
const IMAGES = [BASELINE_PATH, RED_PATH, BLUE_PATH];

const DURATION_MS = 30 * 60 * 1000;
const TARGET_UPLOADS = 270;

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
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

    const info = String(res.body?.status ?? res.body?.error ?? res.status);
    return {
      status: res.status,
      body: res.body,
      test,
      project,
      viewport,
      browser,
      environment,
    };
  } catch (err) {
    return {
      status: 0,
      body: null,
      error: (err as Error).message,
      test,
      project,
    };
  }
}

async function approveComparison(
  project: string,
  test: string,
  viewport: string,
  browser: string,
  environment: string,
) {
  try {
    const res = await request(BASE_URL).post(
      `/api/v1/projects/${encodeURIComponent(project)}/tests/${encodeURIComponent(test)}/approval?viewport=${encodeURIComponent(viewport)}&browser=${encodeURIComponent(browser)}&environment=${encodeURIComponent(environment)}`,
    );
    return res.status === 201;
  } catch {
    return false;
  }
}

async function seed() {
  console.log('Grafana Load Test — generating 30 min of metrics...\n');

  const projects = PROJECT_NAMES.DEMO;
  const allTests: { project: string; test: string }[] = [];

  for (const project of projects) {
    const tests = DEMO_TESTS[project];
    if (!tests) continue;
    for (const test of tests) {
      allTests.push({ project, test });
    }
  }

  if (allTests.length === 0) {
    console.error('No tests found. Run demo seed first.');
    process.exit(1);
  }

  const startTime = Date.now();
  let uploadCount = 0;
  let approveCount = 0;
  let errorCount = 0;

  const approveQueue: {
    project: string;
    test: string;
    viewport: string;
    browser: string;
    environment: string;
  }[] = [];

  while (Date.now() - startTime < DURATION_MS) {
    const elapsed = Date.now() - startTime;
    const fraction = elapsed / DURATION_MS;
    const targetSoFar = Math.floor(TARGET_UPLOADS * fraction);

    const nextDelay = randomBetween(3000, 15000);

    const waitStart = Date.now();
    while (Date.now() - waitStart < nextDelay) {
      if (Date.now() - startTime >= DURATION_MS) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    if (Date.now() - startTime >= DURATION_MS) break;

    const entry = pickRandom(allTests);
    const viewport = pickRandom(VIEWPORTS);
    const browser = pickRandom(BROWSERS);
    const environment = pickRandom(ENVIRONMENTS);
    const image = pickRandom(IMAGES);

    const result = await uploadVariant({
      project: entry.project,
      test: entry.test,
      viewport,
      browser,
      environment,
      image,
    });
    uploadCount++;

    if (result.status === 201 || result.status === 200) {
      approveQueue.push({
        project: entry.project,
        test: entry.test,
        viewport,
        browser,
        environment,
      });
    } else {
      errorCount++;
    }

    const progress = Math.min(1, (Date.now() - startTime) / DURATION_MS);
    const barLen = 40;
    const filled = Math.floor(barLen * progress);
    const bar = '█'.repeat(filled) + '░'.repeat(barLen - filled);
    const pct = (progress * 100).toFixed(0);
    process.stdout.write(
      `\r  [${bar}] ${pct}%  uploaded: ${uploadCount}  approved: ${approveCount}  errors: ${errorCount}  `,
    );
  }

  console.log('\n');

  if (approveQueue.length > 0) {
    console.log(
      `Approving ${Math.min(approveQueue.length, Math.floor(approveQueue.length * 0.35))} pending comparisons...`,
    );
    const toApprove = Math.max(10, Math.floor(approveQueue.length * 0.15));
    const shuffled = approveQueue
      .sort(() => Math.random() - 0.5)
      .slice(0, toApprove);
    for (const item of shuffled) {
      const ok = await approveComparison(
        item.project,
        item.test,
        item.viewport,
        item.browser,
        item.environment,
      );
      if (ok) approveCount++;
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  console.log('\nLoad test complete!');
  console.log(
    `  Duration:   ${((Date.now() - startTime) / 1000 / 60).toFixed(0)} min`,
  );
  console.log(`  Uploads:    ${uploadCount}`);
  console.log(`  Approved:   ${approveCount}`);
  console.log(`  Errors:     ${errorCount}`);
  console.log('\nOpen http://localhost:3001 to check Grafana dashboards.');
}

seed().catch((err: unknown) => {
  console.error('Load test failed:', (err as Error).message);
  process.exit(1);
});

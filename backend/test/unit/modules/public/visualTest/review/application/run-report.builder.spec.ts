import {
  buildRunCsv,
  buildRunHtml,
  buildRunJUnit,
} from '@public/visualTest/review/application/run-report.builder';
import type { RunDetail } from '@public/visualTest/review/application/run.service';

function detail(): RunDetail {
  return {
    run: {
      id: 'run-1',
      key: 'ci-1',
      branch: { name: 'feature/x' },
      commitSha: 'abc123',
    } as never,
    status: {
      state: 'pending',
      pendingComparisons: 1,
      mutedPending: 0,
      pendingJobs: 0,
      failedJobs: 0,
      approved: 1,
      testCount: 2,
    },
    pending: [
      {
        comparisonId: 'cmp-1',
        testName: 'a & b',
        kind: 'image',
        branchName: 'feature/x',
        variant: {
          viewport: '1920x1080',
          browser: 'chrome',
          environment: 'staging',
        },
        mismatchPixelCount: 12,
        mismatchPageCount: null,
        createdAt: new Date('2026-01-01'),
      },
    ],
    approvals: [
      {
        comparisonId: 'cmp-2',
        testName: 'ok',
        approvedBy: 'jane',
        approvedAt: new Date('2026-01-01'),
      },
    ],
    failedJobs: [
      {
        id: 'job-1',
        testName: 'broken',
        branchName: 'feature/x',
        error: 'engine exploded',
        createdAt: new Date('2026-01-01'),
      },
    ],
    uploads: [
      {
        testName: 'a & b',
        kind: 'image',
        variant: {
          viewport: '1920x1080',
          browser: 'chrome',
          environment: 'staging',
        },
        outcome: 'comparison_queued',
        createdAt: new Date('2026-01-01'),
      },
      {
        testName: 'ok',
        kind: 'image',
        variant: {
          viewport: '1920x1080',
          browser: 'chrome',
          environment: 'staging',
        },
        outcome: 'comparison_queued',
        createdAt: new Date('2026-01-01'),
      },
    ],
  };
}

describe('run report builders', () => {
  it('builds JUnit with escaping and pending as failure', () => {
    const xml = buildRunJUnit(detail(), 'checkout', 'ci-1', 'https://vrt.test');

    expect(xml).toContain('<testsuites tests="3" failures="2">');
    expect(xml).toContain('name="a &amp; b [1920x1080 / chrome / staging]"');
    expect(xml).toContain('<failure message="12 px mismatch');
    expect(xml).toContain(
      'https://vrt.test/projects/checkout/tests/a%20%26%20b?branch=feature%2Fx',
    );
    expect(xml).toContain('<testcase classname="checkout.image" name="ok');
    expect(xml).toContain('name="broken [run]"');
    expect(xml).toContain('engine exploded');
  });

  it('builds CSV with quoted values and one row per upload', () => {
    const csv = buildRunCsv(detail(), 'checkout');
    const lines = csv.split('\n');

    expect(lines[0]).toBe(
      'project,runKey,branch,test,kind,variant,outcome,mismatch,detail',
    );
    expect(lines).toHaveLength(4);
    expect(lines[1]).toContain('"a & b"');
    expect(lines[1]).toContain('"pending"');
    expect(lines[2]).toContain('"approved"');
    expect(lines[3]).toContain('"failed"');
  });

  it('builds a self-contained HTML report with links and counts', () => {
    const html = buildRunHtml(detail(), 'checkout', 'https://vrt.test');

    expect(html).toContain('<title>checkout — run ci-1</title>');
    expect(html).toContain('a &amp; b');
    expect(html).toContain('2 tests');
    expect(html).toContain('feature/x');
    expect(html).toContain('a%20%26%20b?branch=feature%2Fx');
  });
});

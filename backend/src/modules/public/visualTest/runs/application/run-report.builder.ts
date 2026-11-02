import type { RunDetail } from '@public/visualTest/runs/application/run.service';
import { escapeCsvCell } from '@common/utils/csv';

interface ReportRow {
  testName: string;
  kind: string;
  branchName: string;
  variant: string;
  outcome: 'pending' | 'muted' | 'failed' | 'approved' | 'unchanged';
  mismatch: number;
  detail: string;
}

function variantLabel(variant: {
  viewport: string;
  browser: string;
  environment: string;
}): string {
  return [variant.viewport, variant.browser, variant.environment]
    .filter((part) => part.length > 0)
    .join(' / ');
}

// A muted test does not hold the run gate (run-state.policy.ts,
// docs/ci-integration.md), so its comparison is reported but never as a
// failure. Reported at all because the reader of a report must still see that
// something exists and was deferred.
function pendingOutcome(row: { muted: boolean; mismatchPixelCount: number }): {
  outcome: 'pending' | 'muted';
  detail: string;
} {
  return row.muted
    ? {
        outcome: 'muted',
        detail: `${String(row.mismatchPixelCount)} px mismatch — muted, does not hold the gate`,
      }
    : {
        outcome: 'pending',
        detail: `${String(row.mismatchPixelCount)} px mismatch — needs review`,
      };
}

function rows(detail: RunDetail): ReportRow[] {
  const pending = new Map(
    detail.pending.map((row) => [
      `${row.testName}|${variantLabel(row.variant)}`,
      row,
    ]),
  );
  const approvedTests = new Set(detail.approvals.map((row) => row.testName));
  const seen = new Set<string>();
  const result: ReportRow[] = [];

  for (const upload of detail.uploads) {
    const variant = variantLabel(upload.variant);
    const key = `${upload.testName}|${variant}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const pendingRow = pending.get(key);
    const isApproved = approvedTests.has(upload.testName);
    const review = pendingRow ? pendingOutcome(pendingRow) : null;
    result.push({
      testName: upload.testName,
      kind: upload.kind,
      branchName: detail.run.branch.name,
      variant,
      outcome: review ? review.outcome : isApproved ? 'approved' : 'unchanged',
      mismatch: pendingRow?.mismatchPixelCount ?? 0,
      detail: review
        ? review.detail
        : isApproved
          ? 'Approved in this run'
          : 'Unchanged',
    });
  }

  // Failed jobs have no comparison; the run gate counts them as failures and
  // JUnit consumers must see them as failing cases, not silently passing.
  for (const job of detail.failedJobs) {
    result.push({
      testName: job.testName,
      kind: 'image',
      branchName: job.branchName,
      variant: 'run',
      outcome: 'failed',
      mismatch: 0,
      detail: job.error,
    });
  }

  // A pending comparison whose upload row was pruned (or predates RunUpload)
  // still belongs in the report.
  for (const row of detail.pending) {
    const key = `${row.testName}|${variantLabel(row.variant)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const review = pendingOutcome(row);
    result.push({
      testName: row.testName,
      kind: row.kind,
      branchName: row.branchName,
      variant: variantLabel(row.variant),
      outcome: review.outcome,
      mismatch: row.mismatchPixelCount,
      detail: review.detail,
    });
  }
  return result;
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function htmlEscape(value: string): string {
  return xmlEscape(value);
}

function testUrl(
  base: string,
  projectName: string,
  testName: string,
  branchName: string,
): string {
  return `${base.replace(/\/+$/, '')}/projects/${encodeURIComponent(projectName)}/tests/${encodeURIComponent(testName)}?branch=${encodeURIComponent(branchName)}`;
}

export function buildRunJUnit(
  detail: RunDetail,
  projectName: string,
  runKey: string,
  baseUrl: string,
): string {
  const reportRows = rows(detail);
  const failures = reportRows.filter(
    (row) => row.outcome === 'pending' || row.outcome === 'failed',
  ).length;
  const cases = reportRows.map((row) => {
    const name = xmlEscape(`${row.testName} [${row.variant}]`);
    const classname = xmlEscape(`${projectName}.${row.kind}`);
    const body =
      row.outcome === 'pending' || row.outcome === 'failed'
        ? `<failure message="${xmlEscape(row.detail)}">${xmlEscape(testUrl(baseUrl, projectName, row.testName, row.branchName))}</failure>`
        : '';
    return `    <testcase classname="${classname}" name="${name}" time="0">${body}</testcase>`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites tests="${String(reportRows.length)}" failures="${String(failures)}">`,
    `  <testsuite name="${xmlEscape(`${projectName}/${runKey}`)}" tests="${String(reportRows.length)}" failures="${String(failures)}">`,
    ...cases,
    '  </testsuite>',
    '</testsuites>',
    '',
  ].join('\n');
}

export function buildRunCsv(detail: RunDetail, projectName: string): string {
  const header = [
    'project',
    'runKey',
    'branch',
    'test',
    'kind',
    'variant',
    'outcome',
    'mismatch',
    'detail',
  ].join(',');
  const lines = rows(detail).map((row) =>
    [
      projectName,
      detail.run.key,
      row.branchName,
      row.testName,
      row.kind,
      row.variant,
      row.outcome,
      String(row.mismatch),
      row.detail,
    ]
      .map(escapeCsvCell)
      .join(','),
  );
  return [header, ...lines].join('\n');
}

export function buildRunHtml(
  detail: RunDetail,
  projectName: string,
  baseUrl: string,
): string {
  const reportRows = rows(detail);
  const status = detail.status;
  const rowHtml = reportRows
    .map((row) => {
      const url = testUrl(baseUrl, projectName, row.testName, row.branchName);
      return `<tr><td><a href="${htmlEscape(url)}">${htmlEscape(row.testName)}</a></td><td>${htmlEscape(row.kind)}</td><td>${htmlEscape(row.variant)}</td><td class="${row.outcome}">${htmlEscape(row.outcome)}</td><td>${String(row.mismatch)}</td><td>${htmlEscape(row.detail)}</td></tr>`;
    })
    .join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${htmlEscape(projectName)} — run ${htmlEscape(detail.run.key)}</title>
<style>
body{font-family:system-ui,sans-serif;margin:2rem;color:#111}
table{border-collapse:collapse;width:100%}
th,td{border-bottom:1px solid #ddd;padding:.5rem;text-align:left;font-size:.875rem}
.pending{color:#b91c1c;font-weight:600}.muted{color:#b45309}.approved{color:#15803d}.unchanged{color:#4b5563}
.summary{display:flex;gap:1.5rem;margin:1rem 0;flex-wrap:wrap}
</style>
</head>
<body>
<h1>${htmlEscape(projectName)} / ${htmlEscape(detail.run.key)}</h1>
<p>Branch <strong>${htmlEscape(detail.run.branch.name)}</strong> · state <strong>${htmlEscape(status.state)}</strong>${detail.run.commitSha ? ` · commit <code>${htmlEscape(detail.run.commitSha)}</code>` : ''}</p>
<div class="summary">
<span>${String(status.testCount)} tests</span>
<span>${String(status.pendingComparisons)} pending</span>
<span>${String(status.mutedPending)} muted</span>
<span>${String(status.approved)} approved</span>
<span>${String(status.failedJobs)} failed jobs</span>
</div>
<table>
<thead><tr><th>Test</th><th>Kind</th><th>Variant</th><th>Outcome</th><th>Mismatch</th><th>Detail</th></tr></thead>
<tbody>
${rowHtml}
</tbody>
</table>
</body>
</html>
`;
}

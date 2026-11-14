#!/usr/bin/env node
// Merges the unit and the e2e coverage maps into one picture and reports which
// layer each suite is responsible for.
//
// Vitest writes one coverage map per run and has no cross-run merge, so the two
// v8 maps are combined here: per file, the hit counts of the same statement,
// function and branch ids are added. The maps come from the same source, so
// their id spaces agree; a file that only one suite touched keeps its own map.
//
// Exit code is 1 when a source file is covered by neither suite — that is the
// one gap a merged report can prove, and it is the gap that otherwise hides
// behind two green runs.
import {
  readFileSync,
  readdirSync,
  mkdirSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const unitPath = join(root, 'coverage/unit/coverage-final.json');
const e2ePath = join(root, 'coverage/e2e/coverage-final.json');
const outDir = join(root, 'coverage/merged');

// Same buckets as the thresholds in vitest.config.ts, so the report answers the
// question the gate asks. `presentation` is listed separately: no unit tests
// assert on it by design, the HTTP suite is its owner.
const LAYERS = [
  ['public core/domain', (file) => file.includes('/core/domain/')],
  ['public application', (file) => file.includes('/application/')],
  ['public infrastructure', (file) => file.includes('/infrastructure/')],
  ['public presentation', (file) => file.includes('/presentation/')],
  ['internal', (file) => file.startsWith('src/modules/internal/')],
  ['common', (file) => file.startsWith('src/common/')],
  ['config', (file) => file.startsWith('src/config/')],
  ['prisma', (file) => file.startsWith('src/prisma/')],
];

function readCoverage(path, label) {
  if (!existsSync(path)) {
    console.error(
      `Missing ${label} coverage at ${relative(root, path)}.\n` +
        `Run \`pnpm run test:cov\` and \`pnpm run test:cov:e2e\` first.`,
    );
    process.exit(1);
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

function mergeCounts(target, source) {
  for (const key of Object.keys(source.s)) {
    target.s[key] = (target.s[key] ?? 0) + source.s[key];
  }
  for (const key of Object.keys(source.f)) {
    target.f[key] = (target.f[key] ?? 0) + source.f[key];
  }
  for (const key of Object.keys(source.b)) {
    const hits = source.b[key];
    target.b[key] = target.b[key]
      ? target.b[key].map((count, i) => count + (hits[i] ?? 0))
      : [...hits];
  }
}

function merge(unit, e2e) {
  const merged = {};
  for (const map of [unit, e2e]) {
    for (const [file, data] of Object.entries(map)) {
      if (!merged[file]) {
        merged[file] = {
          ...data,
          s: {},
          f: {},
          b: {},
        };
      }
      mergeCounts(merged[file], data);
    }
  }
  return merged;
}

// A file is "unknown" when a suite did not see it at all: v8 reports the files
// it instrumented, so a missing entry means the suite never loaded it.
function totals(map, file) {
  const data = map[file];
  if (!data) return null;
  const s = Object.values(data.s);
  const f = Object.values(data.f);
  const b = Object.values(data.b).flat();
  return {
    statements: [s.filter((v) => v > 0).length, s.length],
    functions: [f.filter((v) => v > 0).length, f.length],
    branches: [b.filter((v) => v > 0).length, b.length],
  };
}

function pct([covered, total]) {
  return total === 0 ? 100 : (100 * covered) / total;
}

function sum(entries) {
  const acc = { statements: [0, 0], functions: [0, 0], branches: [0, 0] };
  for (const entry of entries) {
    for (const key of Object.keys(acc)) {
      acc[key][0] += entry[key][0];
      acc[key][1] += entry[key][1];
    }
  }
  return acc;
}

function formatLine(row) {
  const cell = (value) => value.toFixed(1).padStart(6);
  const unknown = (p) => (p === null ? '     –' : cell(p));
  return [
    row.name.padEnd(24),
    String(row.files).padStart(5),
    unknown(row.unit),
    unknown(row.e2e),
    unknown(row.merged),
  ].join('');
}

const unit = readCoverage(unitPath, 'unit');
const e2e = readCoverage(e2ePath, 'e2e');
const merged = merge(unit, e2e);

mkdirSync(outDir, { recursive: true });
writeFileSync(
  join(outDir, 'coverage-final.json'),
  JSON.stringify(merged, null, 2),
);

const files = Object.keys(merged)
  .map((file) => relative(root, file))
  .sort();
const rows = [];
let uncoveredByBoth = [];

for (const [name, matches] of LAYERS) {
  const bucket = files.filter((file) => matches(file));
  const describe = (map) => {
    const entries = bucket.map((file) => totals(map, join(root, file)));
    const seen = entries.filter(Boolean);
    if (seen.length === 0) return null;
    const key = 'statements';
    return pct(sum(seen)[key]);
  };
  // A file may be absent from a map when the suite never loaded it; the merged
  // percentage is what matters, but the per-suite column must not pretend.
  rows.push({
    name,
    files: bucket.length,
    unit: describe(unit),
    e2e: describe(e2e),
    merged: describe(merged),
  });
}

const all = (map) => {
  const entries = files.map((file) => totals(map, join(root, file)));
  const seen = entries.filter(Boolean);
  return seen.length === 0 ? 0 : pct(sum(seen).statements);
};

rows.push({
  name: 'all files',
  files: files.length,
  unit: all(unit),
  e2e: all(e2e),
  merged: all(merged),
});

// A file only counts as a gap when it has statements that never ran. Files with
// no statements (type aliases) and the DTO classes (the API schema, held out of
// the unit gate for the same reason) are not gaps.
const isSchemaOrTypeOnly = (file) =>
  file.includes('/dto/') || file.endsWith('.type.ts');

// A file that no suite even *loaded* is in neither map, so everything above is
// blind to it: the report would show 100% of a set the file was never part of.
// Walk the source tree instead, minus what no configuration instruments (module
// wiring, type modules, the entry points), and treat "absent from both maps" as
// the gap it is.
const NEVER_INSTRUMENTED = [
  /\.module\.ts$/,
  /\.types\.ts$/,
  /\.d\.ts$/,
  /\/main\.ts$/,
  /\/generated\//,
  /\/test\//,
  /^src\/scripts\//,
  /^src\/tracing\.setup\.ts$/,
];

function walkSource(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walkSource(path, found);
    else if (entry.name.endsWith('.ts')) found.push(relative(root, path));
  }
  return found;
}

const loadedBySomeSuite = new Set(files);
const neverLoaded = walkSource(join(root, 'src'))
  .filter((file) => !NEVER_INSTRUMENTED.some((pattern) => pattern.test(file)))
  .filter((file) => !isSchemaOrTypeOnly(file))
  .filter((file) => !loadedBySomeSuite.has(file))
  .sort();

for (const file of files) {
  if (isSchemaOrTypeOnly(file)) continue;
  const entry = totals(merged, join(root, file));
  if (entry && entry.statements[1] > 0 && entry.statements[0] === 0) {
    uncoveredByBoth.push(file);
  }
}

console.log('\nStatements covered per layer (unit / e2e / both):\n');
console.log(
  ['layer'.padEnd(24), 'files', '  unit', '   e2e', '  both'].join(''),
);
console.log('-'.repeat(56));
for (const row of rows) console.log(formatLine(row));
console.log(`\nMerged coverage written to ${relative(root, outDir)}/`);

if (neverLoaded.length > 0) {
  console.error(
    `\n${neverLoaded.length} file(s) no suite even loads (absent from both maps):\n` +
      neverLoaded.map((file) => `  - ${file}`).join('\n'),
  );
}

if (uncoveredByBoth.length > 0) {
  console.error(
    `\n${uncoveredByBoth.length} file(s) no suite touches at all:\n` +
      uncoveredByBoth.map((file) => `  - ${file}`).join('\n'),
  );
}

if (uncoveredByBoth.length > 0 || neverLoaded.length > 0) {
  process.exit(1);
}

#!/usr/bin/env node
// Answers one question: does any source file escape both backend suites?
//
// Vitest writes one coverage map per run and has no cross-run merge, so the two
// v8 maps are combined here: per file, the hit counts of the same statement,
// function and branch ids are added. The maps come from the same source, so
// their id spaces agree; a file that only one suite touched keeps its own map.
//
// Deliberately not a coverage report. There is no per-layer percentage table,
// because the number it would print is not the number a threshold can use: each
// suite reports the files *it* loaded, so "80% by the e2e suite" means eighty
// percent of a different denominator than the unit gate holds. The thresholds
// live in the two vitest configs, per layer, where the suite that owns the layer
// measures it (ADR-054, ADR-055).
//
// Two gaps survive that split, and both hide behind two green runs:
//
//   1. a file one suite loads and never executes — present in a map at 0;
//   2. a file no suite loads at all — present in neither map, so anything that
//      builds its file list from the maps cannot see it.
//
// Exit code is 1 when either list is non-empty.
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

const uncoveredByBoth = [];
for (const file of files) {
  if (isSchemaOrTypeOnly(file)) continue;
  const entry = totals(merged, join(root, file));
  if (entry && entry.statements[1] > 0 && entry.statements[0] === 0) {
    uncoveredByBoth.push(file);
  }
}

const mapSizes = `${Object.keys(unit).length} from the unit suite, ${Object.keys(e2e).length} from the e2e suite`;
console.log(
  `\nMerged ${files.length} file(s) (${mapSizes}) into ${relative(root, outDir)}/`,
);

if (neverLoaded.length === 0 && uncoveredByBoth.length === 0) {
  console.log(
    'No gap: every source file is loaded by a suite, and every file a suite loads executes something.',
  );
}

if (neverLoaded.length > 0) {
  console.error(
    `\n${neverLoaded.length} file(s) no suite even loads (absent from both maps):\n` +
      neverLoaded.map((file) => `  - ${file}`).join('\n'),
  );
}

if (uncoveredByBoth.length > 0) {
  console.error(
    `\n${uncoveredByBoth.length} file(s) a suite loads and never executes:\n` +
      uncoveredByBoth.map((file) => `  - ${file}`).join('\n'),
  );
}

if (uncoveredByBoth.length > 0 || neverLoaded.length > 0) {
  process.exit(1);
}

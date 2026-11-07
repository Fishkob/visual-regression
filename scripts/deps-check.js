#!/usr/bin/env node
// Dependency freshness check for the npm workspaces.
//
// Dependabot opens the version bumps and OSV reports the vulnerabilities. Two
// gaps stay open, and they are the only thing this script looks at:
//
//   1. A deprecation is not a version change. A package can be marked
//      "deprecated" on the version we already resolve, so Dependabot has
//      nothing to bump and OSV has no advisory to report.
//   2. A bump that Dependabot proposed and nobody merged looks exactly like one
//      it has not reached yet — until the version is older than the window we
//      are willing to wait for.
//
// Semver majors and the dependencies named in Dependabot's own `ignore` list are
// reported but never fail: both are waiting on a decision, not on a queue.
//
// Maven, the container base images and the GitHub Actions pins are Dependabot's
// alone; this script is pnpm-only by design.
//
// The classification is where a regression would be silent — a gate that stops
// failing still prints a green line — so it is a pure function that
// scripts/deps-check.test.js drives, and the workflow runs that test first.
//
// Exit codes: 0 clean, 1 findings, 2 the check itself could not run.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEPENDABOT_CONFIG = resolve(ROOT, ".github/dependabot.yml");
const DEFAULT_MAX_AGE_DAYS = 14;
const REGISTRY = "https://registry.npmjs.org";

const fail = (message) => {
  console.error(`deps-check: ${message}`);
  process.exit(2);
};

const parseArgs = (argv) => {
  const options = { maxAgeDays: DEFAULT_MAX_AGE_DAYS };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      console.log(
        [
          "Usage: pnpm run deps:check [--max-age <days>]",
          "",
          "Fails on a deprecated dependency and on a version that has been published",
          `for more than <days> (default ${DEFAULT_MAX_AGE_DAYS}) while we are still behind.`,
          "Semver majors and Dependabot's ignored dependencies are reported only.",
        ].join("\n"),
      );
      process.exit(0);
    } else if (arg === "--max-age") {
      const value = argv[++i];
      if (!/^\d+$/.test(String(value)))
        fail("--max-age needs a whole number of days");
      options.maxAgeDays = Number(value);
    } else if (arg.startsWith("--max-age=")) {
      const value = arg.slice("--max-age=".length);
      if (!/^\d+$/.test(value)) fail("--max-age needs a whole number of days");
      options.maxAgeDays = Number(value);
    } else {
      fail(`unknown argument: ${arg}`);
    }
  }
  return options;
};

const parseVersion = (version) => {
  const withoutBuild = version.trim().split("+")[0];
  const dash = withoutBuild.indexOf("-");
  const core = dash === -1 ? withoutBuild : withoutBuild.slice(0, dash);
  const prerelease = dash === -1 ? null : withoutBuild.slice(dash + 1);
  const [major = 0, minor = 0, patch = 0] = core
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
  return { major, minor, patch, prerelease };
};

export const isPrerelease = (version) =>
  parseVersion(version).prerelease !== null;

// A major jump is what Dependabot splits out of its grouped minor/patch pull
// request, and what needs a human. A 0.x minor is not one: its minor is the
// breaking axis, and Dependabot still groups it, so it takes the normal queue.
export const isMajorJump = (from, to) =>
  parseVersion(to).major > parseVersion(from).major;

// Dependabot is the single source of truth for what we deliberately hold back,
// so the check reads its `ignore:` entries instead of keeping a second list.
// `dependency-name:` appears nowhere else in that file.
export const readIgnoredNames = (file = DEPENDABOT_CONFIG) => {
  try {
    const names = new Set();
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const match = line.match(/^\s*-\s*dependency-name:\s*"?([^"#\s]+)"?/);
      if (match) names.add(match[1]);
    }
    return names;
  } catch (error) {
    console.warn(`deps-check: cannot read ${file}: ${error.message}`);
    return new Set();
  }
};

// Everything that decides "does this fail the build" lives here: no I/O, no
// printing, no process.exit, so the test can drive every branch.
export const classify = async ({
  outdated,
  ignoredNames,
  maxAgeDays,
  ageOf,
}) => {
  const buckets = {
    deprecated: [],
    stale: [],
    majors: [],
    held: [],
    prereleaseOnly: [],
    candidates: [],
    unverified: [],
  };

  for (const name of Object.keys(outdated).sort()) {
    const entry = outdated[name];
    // `wanted` is what the lockfile resolves, `current` what a working tree may
    // still have installed. A stale node_modules is not a dependency problem.
    const resolved = entry.wanted ?? entry.current;

    if (entry.isDeprecated) {
      buckets.deprecated.push({
        name,
        entry,
        resolved,
        notice: entry.latestManifest?.deprecated,
      });
      continue;
    }
    if (entry.latest === resolved) continue;
    if (isPrerelease(entry.latest)) {
      buckets.prereleaseOnly.push({ name, entry, resolved });
      continue;
    }
    if (isMajorJump(resolved, entry.latest)) {
      buckets.majors.push({ name, entry, resolved });
      continue;
    }
    if (ignoredNames.has(name)) {
      buckets.held.push({ name, entry, resolved });
      continue;
    }
    buckets.candidates.push({ name, entry, resolved });
  }

  for (const candidate of buckets.candidates) {
    try {
      const days = await ageOf(candidate.name, candidate.entry.latest);
      if (days > maxAgeDays) buckets.stale.push({ ...candidate, days });
    } catch (error) {
      buckets.unverified.push({ ...candidate, reason: error.message });
    }
  }

  return buckets;
};

const runPnpmOutdated = () => {
  const result = spawnSync(
    "pnpm",
    ["outdated", "-r", "--format", "json", "--long"],
    {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (result.error) fail(`cannot run pnpm: ${result.error.message}`);
  // pnpm exits 1 as soon as it found anything outdated, which is the case this
  // script exists for. Anything above that is pnpm itself failing.
  if (result.status !== 0 && result.status !== 1) {
    fail(`pnpm outdated exited ${result.status}\n${result.stderr.trim()}`);
  }
  const stdout = result.stdout.trim();
  if (!stdout) fail("pnpm outdated printed nothing");
  try {
    return JSON.parse(stdout);
  } catch (error) {
    fail(`pnpm outdated did not print JSON: ${error.message}`);
  }
};

// The abbreviated packument pnpm uses carries no publish date, so the age of a
// version is one plain registry read per stale candidate.
const publishedAgeDays = async (name, version) => {
  const response = await fetch(`${REGISTRY}/${name.replaceAll("/", "%2f")}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const document = await response.json();
  const published = document.time?.[version];
  if (!published) throw new Error(`no publish date for ${version}`);
  return (Date.now() - new Date(published).getTime()) / 86_400_000;
};

const workspaceOf = (entry) => {
  const locations = (entry.dependentPackages ?? []).map(
    (dependent) => dependent.location,
  );
  if (locations.length === 0) return "-";
  const names = locations.map((location) =>
    resolve(location) === ROOT
      ? "root"
      : location.split("/").filter(Boolean).at(-1),
  );
  return [...new Set(names)].join(", ");
};

const asDays = (days) =>
  `${Math.floor(days)} ${Math.floor(days) === 1 ? "day" : "days"}`;

const describe = (name, entry, from = entry.current) =>
  `${name} ${from}${entry.latest === from ? "" : ` -> ${entry.latest}`} [${workspaceOf(entry)}]`;

const report = ({ buckets, total, maxAgeDays }) => {
  const { deprecated, stale, majors, held, prereleaseOnly, unverified } =
    buckets;
  const windowLabel = `${maxAgeDays} ${maxAgeDays === 1 ? "day" : "days"}`;
  const recent = total - deprecated.length - stale.length;

  console.log(`Dependency freshness (npm workspaces, ${windowLabel})`);
  console.log(
    `  ${total} outdated, ${deprecated.length} deprecated, ${stale.length} stale, ${recent} recent`,
  );

  if (deprecated.length > 0) {
    console.log("\nDEPRECATED — no version bump will fix these");
    for (const { name, entry, resolved, notice } of deprecated) {
      console.log(`  ${describe(name, entry, resolved)}`);
      console.log(`    ${notice ?? "deprecated upstream, no notice given"}`);
    }
  }

  if (stale.length > 0) {
    console.log(
      `\nSTALE — published more than ${windowLabel} ago and still not installed`,
    );
    for (const { name, entry, resolved, days } of stale) {
      console.log(`  ${describe(name, entry, resolved)} — ${asDays(days)} old`);
    }
  }

  if (majors.length > 0) {
    console.log("\nMAJOR — needs a decision, not failed");
    for (const { name, entry, resolved } of majors)
      console.log(`  ${describe(name, entry, resolved)}`);
  }

  if (held.length > 0) {
    console.log("\nIGNORED BY DEPENDABOT — see .github/dependabot.yml");
    for (const { name, entry, resolved } of held)
      console.log(`  ${describe(name, entry, resolved)}`);
  }

  if (prereleaseOnly.length > 0) {
    console.log("\nPRERELEASE ONLY — the newest release is a pre-release");
    for (const { name, entry, resolved } of prereleaseOnly)
      console.log(`  ${describe(name, entry, resolved)}`);
  }

  if (unverified.length > 0) {
    console.log("\nUNVERIFIED — the registry could not date these");
    for (const { name, entry, resolved, reason } of unverified)
      console.log(`  ${describe(name, entry, resolved)} — ${reason}`);
  }

  return deprecated.length + stale.length;
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  const outdated = runPnpmOutdated();
  const buckets = await classify({
    outdated,
    ignoredNames: readIgnoredNames(),
    maxAgeDays: options.maxAgeDays,
    ageOf: publishedAgeDays,
  });
  const problems = report({
    buckets,
    total: Object.keys(outdated).length,
    maxAgeDays: options.maxAgeDays,
  });

  // A registry that cannot answer for any candidate must not read as clean.
  if (
    buckets.unverified.length === buckets.candidates.length &&
    buckets.candidates.length > 0
  ) {
    fail("every age lookup failed; the registry is unreachable");
  }

  if (problems > 0) {
    console.log(`\ndeps-check: ${problems} problem(s)`);
    process.exit(1);
  }
  console.log("\ndeps-check: no deprecated or stale dependencies");
};

if (import.meta.main) await main();

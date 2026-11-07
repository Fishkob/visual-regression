// Tests for the dependency freshness classifier. Run with `node --test`, which
// the deps-freshness workflow does before it trusts the check's exit code: a
// gate that stops failing still prints a green line.
import assert from "node:assert/strict";
import test from "node:test";
import {
  classify,
  isMajorJump,
  isPrerelease,
  readIgnoredNames,
} from "./deps-check.js";

const entry = (overrides = {}) => ({
  current: "1.0.0",
  wanted: "1.0.0",
  latest: "1.0.0",
  dependentPackages: [{ name: "backend", location: "/repo/backend" }],
  ...overrides,
});

const classifyOne = (overrides, options = {}) =>
  classify({
    outdated: { pkg: entry(overrides) },
    ignoredNames: new Set(),
    maxAgeDays: 14,
    ageOf: async () => 30,
    ...options,
  });

test("a deprecation fails even when the resolved version is the newest", async () => {
  const buckets = await classifyOne({
    current: "15.1.3",
    wanted: "15.1.3",
    latest: "15.1.3",
    isDeprecated: true,
    latestManifest: { deprecated: "prom-client has been replaced" },
  });

  assert.equal(buckets.deprecated.length, 1);
  assert.equal(buckets.deprecated[0].notice, "prom-client has been replaced");
  assert.equal(buckets.stale.length, 0);
});

test("a version outside the window fails", async () => {
  const buckets = await classifyOne(
    { latest: "1.1.0" },
    { ageOf: async () => 15 },
  );

  assert.equal(buckets.stale.length, 1);
  assert.equal(buckets.stale[0].days, 15);
});

test("a version inside the window is not reported", async () => {
  const buckets = await classifyOne(
    { latest: "1.1.0" },
    { ageOf: async () => 2 },
  );

  assert.equal(buckets.stale.length, 0);
  assert.equal(buckets.candidates.length, 1);
});

test("Dependabot's ignore list keeps a held-back update out of the failing buckets", async () => {
  // The regression this guards: vue-tsc 3.3.14 is a patch update that breaks
  // the type check, so dependabot.yml ignores it. Without the ignore list the
  // gate would fail forever on a decision already taken — so the same input is
  // classified both ways.
  const held = { current: "3.3.13", wanted: "3.3.13", latest: "3.3.14" };
  const ignored = await classifyOne(held, {
    ignoredNames: new Set(["pkg"]),
    ageOf: async () => 400,
  });
  const unignored = await classifyOne(held, { ageOf: async () => 400 });

  assert.equal(ignored.stale.length, 0);
  assert.equal(ignored.held.length, 1);
  assert.equal(unignored.stale.length, 1);
});

test("a semver major is a decision, not a failure", async () => {
  const buckets = await classifyOne(
    { current: "30.1.3", wanted: "30.1.3", latest: "31.0.0" },
    { ageOf: async () => 400 },
  );

  assert.equal(buckets.majors.length, 1);
  assert.equal(buckets.stale.length, 0);
});

test("a pre-release is reported, never installed", async () => {
  const buckets = await classifyOne({ latest: "8.0.0-rc.33" });

  assert.equal(buckets.prereleaseOnly.length, 1);
  assert.equal(buckets.stale.length, 0);
});

test("an undatable version is reported instead of passing silently", async () => {
  const buckets = await classifyOne(
    { latest: "1.1.0" },
    {
      ageOf: async () => {
        throw new Error("HTTP 503");
      },
    },
  );

  assert.equal(buckets.unverified.length, 1);
  assert.equal(buckets.unverified[0].reason, "HTTP 503");
  assert.equal(buckets.stale.length, 0);
});

test("0.x minors queue normally, only a 1.0 jump is a major", () => {
  assert.equal(isMajorJump("0.300.0", "0.301.0"), false);
  assert.equal(isMajorJump("0.5.0", "1.0.0"), true);
  assert.equal(isMajorJump("1.2.3", "2.0.0"), true);
  assert.equal(isMajorJump("1.2.3", "1.3.0"), false);
});

test("a pre-release is recognised by its dash", () => {
  assert.equal(isPrerelease("8.0.0-rc.33"), true);
  assert.equal(isPrerelease("1.0.0"), false);
});

test("the ignore list is read from dependabot.yml", () => {
  const names = readIgnoredNames();

  // Both entries exist in .github/dependabot.yml; if that shape changes, the
  // gate would silently stop honouring them, which this asserts.
  assert.ok(names.has("typescript"));
  assert.ok(names.has("vue-tsc"));
});

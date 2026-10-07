# Dev/Prod Dependency Gate — Design

Date: 2026-10-07

## Problem

The dependency scan gate (`scripts/security/osv-gate.py`, run by
`.github/workflows/security-dependency.yml`) fails CI whenever osv-scanner reports
any CRITICAL or HIGH finding, regardless of whether the vulnerable package is
reachable in production. `osv-scanner` 2.5.0 does not emit a dev/prod
classification in its JSON output (a package entry carries only `package`,
`groups`, and `vulnerabilities`), and it has no `--include-dev`/`--exclude-dev`
flag.

Today the gate fails on six findings that are all dev/build-time only:

| Package       | Path                                        | Severity |
| ------------- | ------------------------------------------- | -------- |
| shell-quote   | root `concurrently` (dev)                    | CRITICAL |
| deepmerge-ts  | backend → `prisma` CLI → `@prisma/config`    | HIGH     |
| js-yaml (×3)  | root `@hey-api/openapi-ts`                   | HIGH     |
| mysql2        | backend → `prisma` CLI                       | HIGH     |

None of these run in production. The gate should not block on them, but it must
still block on a genuine production dependency.

## Decision

**Classify each osv-scanner finding as production or dev-only, deriving the npm
classification from `pnpm-lock.yaml`, and fail only on CRITICAL/HIGH findings in
production dependencies. Dev-only findings are reported as non-blocking
warnings. Anything that cannot be classified is treated as production
(fail-safe).**

Maven findings (pdf-sidecar) are always treated as production: osv-scanner gives
no scope information and the pom's `test`-scope surface is small.

The classification is implemented with a purpose-built, dependency-free parser of
the pnpm lockfile (lockfile version 9). PyYAML is deliberately not introduced:
the existing security gates are pure-stdlib Python, and the subset of the
lockfile that is needed is narrow and stable. A prod-only second scan (via
`pnpm install --prod --lockfile-only`) was rejected because it requires Node/pnpm
setup and a network install in the security workflow.

## Components

### `scripts/security/pnpm_lock.py` (new)

Single responsibility: given a pnpm lockfile path, return the set of packages
that are reachable in production.

```python
class LockfileError(Exception):
    ...

@dataclass(frozen=True)
class LockAnalysis:
    all_packages: frozenset[tuple[str, str]]         # (name, version) — every snapshot
    production_packages: frozenset[tuple[str, str]]  # reachable from prod roots

def analyze(lockfile_path: str) -> LockAnalysis:
    ...
```

The module exposes facts only; the blocking policy lives in the gate.

### `scripts/security/osv-gate.py` (extended)

Loads the lockfile (default `pnpm-lock.yaml` in the current directory, which is
how the workflow invokes it) and classifies every finding before applying the
severity gate.

## Classification algorithm

The lockfile is read line-by-line, tracking indentation, and sectioned by the
column-0 keys `importers:`, `packages:`, and `snapshots:`.

**Production roots** — from the `importers:` section (indent 2 = importer name,
indent 4 = group, indent 6 = package name, indent 8 = `version:` value):

- take `dependencies` and `optionalDependencies`, ignore `devDependencies`;
- the resolved version is the nested `version:` value (not `specifier:`).

**Graph** — from the `snapshots:` section (indent 2 = snapshot key
`name@version(peers)`, indent 4 = group, indent 6 = `name: version`):

- `all_packages` = the set of `(name, version)` parsed from snapshot keys;
- edges are `dependencies` + `optionalDependencies` (ignore `devDependencies`,
  `peerDependencies`, `transitivePeerDependencies`);
- `production_packages` = depth-first traversal from the production roots over
  those edges.

**Name/version parsing** — keys are unquoted if single-quoted. A key is split at
the `@` that separates name from version (`@scope/pkg@1.2.3` splits after the
scope slash; `pkg@1.2.3` splits at the only `@`), and any peer suffix from the
first `(` onward is dropped. The same stripping is applied to edge version
values (`12.1.2(class-transformer@0.5.1)` → `12.1.2`).

**Fail-closed** — any line in the `importers`/`snapshots` sections that does not
match the expected shape raises `LockfileError`. The caller then treats every
finding as production.

## Gate behaviour

For each finding, using `package.ecosystem`, `package.name`, and
`package.version`:

- ecosystem ≠ `npm` → **production** (Maven);
- npm and `(name, version)` in `production_packages` → **production**;
- npm and in `all_packages` but not `production_packages` → **dev**;
- npm and absent from `all_packages` → **unclassified**, treated as production;
- lockfile missing or `LockfileError` → warn on stderr, treat everything as
  production.

Blocking set = findings with severity CRITICAL/HIGH whose class is production.
Exit code is 1 iff the blocking set is non-empty, 0 otherwise, 2 only for a
missing/invalid `osv-results.json` (unchanged).

## Output

- `PASS`/`FAIL` summary with counts grouped by class and then severity, e.g.
  `osv-gate: PASS (production medium 2, low 3 | dev critical 1, high 5, medium 1)`.
- `FAIL` lists the blocking (production) findings as today.
- Dev-only findings at CRITICAL/HIGH are listed in a separate non-blocking block,
  e.g. `osv-gate: dev-only (non-blocking):` followed by `  HIGH <id> <package>`.
- An unclassifiable/failed-lockfile condition prints a one-line warning to stderr
  (`osv-gate: <reason>; treating all findings as production`).

## Testing

New `scripts/security/test_pnpm_lock.py` using the standard-library `unittest`
runner, covering two levels:

1. **Real lockfile** (the repository's `pnpm-lock.yaml`): assert that
   `deepmerge-ts`, `mysql2`, `js-yaml`, and `shell-quote` resolve to dev-only,
   and that a known runtime package (e.g. `@nestjs/common`) resolves to
   production.
2. **Synthetic mini-lockfile** fixtures: scoped names, peer suffixes, the same
   `name@version` reachable from both a prod and a dev root (production wins),
   `optionalDependencies` traversal, a dev-only transitive chain, and a malformed
   line that raises `LockfileError`.

The suite is run by adding a step to `.github/workflows/security-dependency.yml`:
`python3 scripts/security/test_pnpm_lock.py`.

## Verification

- `python3 scripts/security/osv-gate.py osv-results.json` against a freshly
  generated `osv-results.json` exits 0, with the six dev-only findings listed as
  non-blocking warnings.
- The `pnpm_lock.py` unit tests pass locally.
- Re-running the CI dependency scan on the change is green.

## Out of scope

- Maven `test`-scope resolution — all Maven findings remain production.
- Changes to `osv-scanner.toml`, severity thresholds, or the FAILING severity
  set (CRITICAL/HIGH).
- Fixing the findings themselves (e.g. `pnpm.overrides`) — separate work.
- Classifying other ecosystems (Go, Rust, Python) — the repo has none in the
  scanned tree.

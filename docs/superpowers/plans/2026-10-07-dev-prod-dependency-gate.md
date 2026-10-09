# Dev/Prod Dependency Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `osv-gate.py` fail only on CRITICAL/HIGH findings in production dependencies, classifying npm packages as production or dev-only from `pnpm-lock.yaml`.

**Architecture:** A new dependency-free module `pnpm_lock.py` parses the pnpm v9 lockfile's `importers` and `snapshots` sections and returns the production-reachable package set. `osv-gate.py` consumes it to classify each finding; Maven, unclassifiable findings, and a missing/failed lockfile count as production (fail-safe). Dev-only CRITICAL/HIGH findings are printed as non-blocking warnings.

**Tech Stack:** Python 3 standard library (`re`, `dataclasses`, `unittest`), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-07-dev-prod-dependency-gate-design.md`

---

## File Structure

- Create `scripts/security/pnpm_lock.py` — lockfile → production package set.
- Create `scripts/security/test_pnpm_lock.py` — unit tests for the parser.
- Create `scripts/security/test_osv_gate.py` — unit tests for the gate classification.
- Modify `scripts/security/osv-gate.py` — use the classifier, split output.
- Modify `.github/workflows/security-dependency.yml` — run the test files.

---

### Task 1: pnpm lockfile classifier

**Files:**

- Create: `scripts/security/pnpm_lock.py`
- Test: `scripts/security/test_pnpm_lock.py`

- [ ] **Step 1: Write the failing tests**

Create `scripts/security/test_pnpm_lock.py`:

```python
#!/usr/bin/env python3
"""Tests for the pnpm lockfile production classifier."""
import os
import tempfile
import textwrap
import unittest

from pnpm_lock import LockfileError, analyze

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_LOCKFILE = os.path.normpath(os.path.join(HERE, "..", "..", "pnpm-lock.yaml"))


def _write(text):
    handle = tempfile.NamedTemporaryFile(
        "w", suffix=".yaml", delete=False, encoding="utf-8"
    )
    handle.write(textwrap.dedent(text).lstrip("\n"))
    handle.close()
    return handle.name


class SyntheticLockfileTest(unittest.TestCase):
    def analyze_text(self, text):
        path = _write(text)
        self.addCleanup(os.remove, path)
        return analyze(path)

    def test_importers_prod_and_dev_split(self):
        analysis = self.analyze_text(
            """
            lockfileVersion: '9.0'
            importers:
              .:
                devDependencies:
                  left-pad:
                    specifier: ^1.0.0
                    version: 1.0.0
              backend:
                dependencies:
                  '@scope/core':
                    specifier: ^2.0.0
                    version: 2.0.0(peer@1.0.0)
            snapshots:
              '@scope/core@2.0.0(peer@1.0.0)':
                dependencies:
                  left-pad: 1.0.0
              left-pad@1.0.0: {}
              peer@1.0.0: {}
            """
        )
        self.assertTrue(analysis.classify("@scope/core", "2.0.0"))
        self.assertTrue(analysis.classify("left-pad", "1.0.0"))
        self.assertFalse(analysis.classify("peer", "1.0.0"))

    def test_optional_dependencies_are_traversed(self):
        analysis = self.analyze_text(
            """
            lockfileVersion: '9.0'
            importers:
              .:
                dependencies:
                  app:
                    specifier: ^1.0.0
                    version: 1.0.0
            snapshots:
              app@1.0.0:
                optionalDependencies:
                  native-addon: 3.0.0
              native-addon@3.0.0: {}
            """
        )
        self.assertTrue(analysis.classify("app", "1.0.0"))
        self.assertTrue(analysis.classify("native-addon", "3.0.0"))

    def test_production_wins_over_dev(self):
        analysis = self.analyze_text(
            """
            lockfileVersion: '9.0'
            importers:
              .:
                devDependencies:
                  shared:
                    specifier: ^1.0.0
                    version: 1.0.0
                dependencies:
                  app:
                    specifier: ^1.0.0
                    version: 1.0.0
            snapshots:
              app@1.0.0:
                dependencies:
                  shared: 1.0.0
              shared@1.0.0: {}
            """
        )
        self.assertTrue(analysis.classify("shared", "1.0.0"))

    def test_dev_only_version_vs_production_version(self):
        analysis = self.analyze_text(
            """
            lockfileVersion: '9.0'
            importers:
              .:
                devDependencies:
                  old-lib:
                    specifier: ^1.0.0
                    version: 1.0.0
                dependencies:
                  app:
                    specifier: ^1.0.0
                    version: 1.0.0
            snapshots:
              app@1.0.0:
                dependencies:
                  old-lib: 2.0.0
              old-lib@1.0.0: {}
              old-lib@2.0.0: {}
            """
        )
        self.assertFalse(analysis.classify("old-lib", "1.0.0"))
        self.assertTrue(analysis.classify("old-lib", "2.0.0"))

    def test_alias_targets_are_resolved(self):
        analysis = self.analyze_text(
            """
            lockfileVersion: '9.0'
            importers:
              .:
                dependencies:
                  '@scope/alias':
                    specifier: npm:real-name@^1.0.0
                    version: real-name@1.0.0
            snapshots:
              real-name@1.0.0: {}
            """
        )
        self.assertTrue(analysis.classify("real-name", "1.0.0"))

    def test_malformed_snapshot_entry_raises(self):
        with self.assertRaises(LockfileError):
            self.analyze_text(
                """
                lockfileVersion: '9.0'
                snapshots:
                  broken@1.0.0: not-empty-map
                """
            )

    def test_unparseable_key_raises(self):
        with self.assertRaises(LockfileError):
            self.analyze_text(
                """
                lockfileVersion: '9.0'
                snapshots:
                  no-version-here: {}
                """
            )


class RealLockfileTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.analysis = analyze(REPO_LOCKFILE)

    def test_production_is_subset_of_all(self):
        self.assertTrue(
            self.analysis.production_packages <= self.analysis.all_packages
        )

    def test_known_production_packages(self):
        names = {name for name, _ in self.analysis.production_packages}
        self.assertIn("@nestjs/common", names)
        self.assertIn("deepmerge-ts", names)
        self.assertIn("mysql2", names)

    def test_shell_quote_is_dev_only(self):
        names = {name for name, _ in self.analysis.production_packages}
        self.assertNotIn("shell-quote", names)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python3 scripts/security/test_pnpm_lock.py`
Expected: FAIL with `ModuleNotFoundError: No module named 'pnpm_lock'`.

- [ ] **Step 3: Write the parser**

Create `scripts/security/pnpm_lock.py`:

```python
#!/usr/bin/env python3
"""Derive the production-reachable package set from a pnpm lockfile (v9)."""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Dict, FrozenSet, Optional, Set, Tuple


class LockfileError(Exception):
    """Raised when the lockfile does not match the expected pnpm v9 shape."""


Package = Tuple[str, str]
_KEY = re.compile(r"^(?P<name>(?:@[^/@]+/)?[^@]+)@(?P<version>.+)$")
_PROD_GROUPS = frozenset({"dependencies", "optionalDependencies"})


@dataclass(frozen=True)
class LockAnalysis:
    all_packages: FrozenSet[Package]
    production_packages: FrozenSet[Package]

    def classify(self, name: str, version: str) -> Optional[bool]:
        """True = production, False = dev-only, None = not in the lockfile."""
        if (name, version) in self.production_packages:
            return True
        if (name, version) in self.all_packages:
            return False
        return None


def _unquote(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == "'" and value[-1] == "'":
        return value[1:-1]
    return value


def _split_key(raw: str) -> Package:
    match = _KEY.match(_unquote(raw))
    if not match:
        raise LockfileError(f"unrecognised package key: {raw!r}")
    version = match.group("version")
    paren = version.find("(")
    if paren != -1:
        version = version[:paren]
    return match.group("name"), version


def _resolve(name: str, raw_version: str) -> Package:
    version = _unquote(raw_version)
    paren = version.find("(")
    base = version if paren == -1 else version[:paren]
    if "@" in base:
        return _split_key(base)
    return name, base


def analyze(lockfile_path: str) -> LockAnalysis:
    section = None
    importer_group = None
    importer_name = None
    snapshot_key = None
    snapshot_group = None
    roots: Set[Package] = set()
    edges: Dict[Package, Set[Package]] = {}
    all_packages: Set[Package] = set()

    with open(lockfile_path, encoding="utf-8") as handle:
        for line in handle:
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            if not line.startswith(" "):
                key = line.split(":", 1)[0]
                section = key if key in ("importers", "packages", "snapshots") else None
                continue
            indent = len(line) - len(line.lstrip(" "))
            text = line.strip()
            if section == "importers":
                if indent == 2 and text.endswith(":"):
                    importer_group = importer_name = None
                elif indent == 4 and text.endswith(":"):
                    importer_group = text[:-1]
                    importer_name = None
                elif indent == 6 and text.endswith(":"):
                    importer_name = _unquote(text[:-1])
                elif (
                    indent == 8
                    and text.startswith("version:")
                    and importer_group in _PROD_GROUPS
                ):
                    if importer_name is None:
                        raise LockfileError(f"version without package: {text!r}")
                    roots.add(_resolve(importer_name, text.split(":", 1)[1]))
            elif section == "snapshots":
                if indent == 2:
                    head, rest = text.split(":", 1)
                    if rest.strip() not in ("", "{}"):
                        raise LockfileError(f"unexpected snapshot entry: {text!r}")
                    snapshot_key = _split_key(head)
                    all_packages.add(snapshot_key)
                    edges.setdefault(snapshot_key, set())
                elif indent == 4 and text.endswith(":"):
                    snapshot_group = text[:-1]
                elif indent == 6 and snapshot_group in _PROD_GROUPS:
                    if snapshot_key is None:
                        raise LockfileError(f"edge without package: {text!r}")
                    dep, version = text.split(":", 1)
                    edges[snapshot_key].add(_resolve(_unquote(dep), version))

    production: Set[Package] = set()
    stack = list(roots)
    while stack:
        package = stack.pop()
        if package in production:
            continue
        production.add(package)
        stack.extend(edges.get(package, ()))
    return LockAnalysis(frozenset(all_packages), frozenset(production))
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python3 scripts/security/test_pnpm_lock.py`
Expected: `OK` (all tests pass).

- [ ] **Step 5: Commit**

```bash
git add scripts/security/pnpm_lock.py scripts/security/test_pnpm_lock.py
git commit -m "feat(security): add pnpm production-dependency classifier"
```

---

### Task 2: Classify findings in osv-gate.py

**Files:**

- Modify: `scripts/security/osv-gate.py`
- Test: `scripts/security/test_osv_gate.py`

- [ ] **Step 1: Write the failing tests**

Create `scripts/security/test_osv_gate.py`:

```python
#!/usr/bin/env python3
"""Tests for the osv-gate production/dev classification."""
import contextlib
import importlib.util
import io
import json
import os
import sys
import tempfile
import textwrap
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

_spec = importlib.util.spec_from_file_location(
    "osv_gate", os.path.join(HERE, "osv-gate.py")
)
osv_gate = importlib.util.module_from_spec(_spec)
sys.modules["osv_gate"] = osv_gate
_spec.loader.exec_module(osv_gate)

LOCKFILE = textwrap.dedent(
    """
    lockfileVersion: '9.0'
    importers:
      .:
        devDependencies:
          dev-lib:
            specifier: ^1.0.0
            version: 1.0.0
    snapshots:
      dev-lib@1.0.0: {}
    """
).lstrip("\n")


def _write_results(entries):
    results = {
        "results": [
            {
                "packages": [
                    {
                        "package": {"name": name, "version": version, "ecosystem": ecosystem},
                        "vulnerabilities": [
                            {"id": vid, "database_specific": {"severity": severity}}
                        ],
                    }
                    for (name, version, ecosystem, severity, vid) in entries
                ]
            }
        ]
    }
    handle = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False)
    json.dump(results, handle)
    handle.close()
    return handle.name


class OsvGateTest(unittest.TestCase):
    def setUp(self):
        self.lockfile = tempfile.NamedTemporaryFile(
            "w", suffix=".yaml", delete=False
        )
        self.lockfile.write(LOCKFILE)
        self.lockfile.close()
        self.addCleanup(os.remove, self.lockfile.name)

    def run_gate(self, entries):
        path = _write_results(entries)
        self.addCleanup(os.remove, path)
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = osv_gate.main(path, self.lockfile.name)
        return code, out.getvalue()

    def test_dev_only_high_is_non_blocking(self):
        code, out = self.run_gate([("dev-lib", "1.0.0", "npm", "HIGH", "GHSA-dev")])
        self.assertEqual(code, 0)
        self.assertIn("dev-only (non-blocking)", out)

    def test_production_high_blocks(self):
        code, out = self.run_gate(
            [("prod-lib", "1.0.0", "npm", "HIGH", "GHSA-prod")]
        )
        self.assertEqual(code, 1)
        self.assertIn("GHSA-prod", out)

    def test_maven_high_blocks(self):
        code, _ = self.run_gate([("g:a", "1.0", "Maven", "HIGH", "GHSA-maven")])
        self.assertEqual(code, 1)

    def test_moderate_is_non_blocking(self):
        code, _ = self.run_gate(
            [("prod-lib", "1.0.0", "npm", "MODERATE", "GHSA-m")]
        )
        self.assertEqual(code, 0)

    def test_missing_lockfile_treats_as_production(self):
        path = _write_results([("prod-lib", "1.0.0", "npm", "HIGH", "GHSA-x")])
        self.addCleanup(os.remove, path)
        out = io.StringIO()
        err = io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = osv_gate.main(path, "/nonexistent/pnpm-lock.yaml")
        self.assertEqual(code, 1)
        self.assertIn("treating all findings as production", err.getvalue())


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python3 scripts/security/test_osv_gate.py`
Expected: FAIL — `osv_gate.main` currently takes one argument and `load_analysis`/`classify` do not exist.

- [ ] **Step 3: Rewrite osv-gate.py**

Replace the entire contents of `scripts/security/osv-gate.py` with:

```python
#!/usr/bin/env python3
"""Severity gate over osv-scanner JSON output.

Fails (exit 1) iff any reported vulnerability has severity HIGH or CRITICAL in a
production dependency. Dependencies are classified as production or dev-only
using the pnpm lockfile: npm findings not reachable from a production root are
warnings; everything else (Maven, unclassifiable, or a missing lockfile) counts
as production. Exit 0 = pass, 1 = fail, 2 = usage/input error.
"""
import json
import sys

import pnpm_lock

FAILING = {"CRITICAL", "HIGH"}
NORMALIZE = {"MODERATE": "MEDIUM"}
ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"]
DEFAULT_LOCKFILE = "pnpm-lock.yaml"


def severity_of(vuln: dict) -> str:
    raw = (vuln.get("database_specific") or {}).get("severity")
    if not raw:
        return "UNKNOWN"
    return NORMALIZE.get(raw, raw)


def load_analysis(lockfile: str):
    try:
        return pnpm_lock.analyze(lockfile)
    except (OSError, pnpm_lock.LockfileError) as exc:
        print(
            f"osv-gate: {exc}; treating all findings as production",
            file=sys.stderr,
        )
        return None


def classify(ecosystem: str, name: str, version: str, analysis) -> str:
    if analysis is None or ecosystem != "npm":
        return "production"
    return "dev" if analysis.classify(name, version) is False else "production"


def _summary(counts: dict) -> str:
    parts = []
    for kind in ("production", "dev"):
        inner = ", ".join(
            f"{sev.lower()} {counts[kind][sev]}"
            for sev in ORDER
            if counts[kind][sev]
        )
        if inner:
            parts.append(f"{kind}: {inner}")
    return " | ".join(parts)


def main(path: str, lockfile: str = DEFAULT_LOCKFILE) -> int:
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"osv-gate: cannot read {path}: {exc}", file=sys.stderr)
        return 2

    results = data.get("results") if isinstance(data, dict) else None
    if not isinstance(results, list):
        print(
            f"osv-gate: cannot read {path}: missing or invalid 'results' array",
            file=sys.stderr,
        )
        return 2

    analysis = load_analysis(lockfile)
    counts = {"production": {k: 0 for k in ORDER}, "dev": {k: 0 for k in ORDER}}
    blocking = []
    dev = []
    for result in results:
        for pkg in result.get("packages") or []:
            package = pkg.get("package") or {}
            name = package.get("name", "?")
            version = package.get("version", "?")
            ecosystem = package.get("ecosystem", "?")
            for vuln in pkg.get("vulnerabilities") or []:
                sev = severity_of(vuln)
                kind = classify(ecosystem, name, version, analysis)
                counts[kind][sev] = counts[kind].get(sev, 0) + 1
                if sev in FAILING:
                    entry = (sev, vuln.get("id", "?"), name)
                    (dev if kind == "dev" else blocking).append(entry)

    summary = _summary(counts)
    if blocking:
        print(f"osv-gate: FAIL ({summary})")
        for sev, vid, name in blocking:
            print(f"  {sev} {vid} {name}")
        _print_dev(dev)
        return 1
    print(f"osv-gate: PASS ({summary or 'no findings'})")
    _print_dev(dev)
    return 0


def _print_dev(dev) -> None:
    if not dev:
        return
    print("osv-gate: dev-only (non-blocking):")
    for sev, vid, name in dev:
        print(f"  {sev} {vid} {name}")


if __name__ == "__main__":
    if len(sys.argv) < 2 or len(sys.argv) > 3:
        print(
            "usage: osv-gate.py <osv-results.json> [pnpm-lock.yaml]",
            file=sys.stderr,
        )
        sys.exit(2)
    lockfile = sys.argv[2] if len(sys.argv) == 3 else DEFAULT_LOCKFILE
    sys.exit(main(sys.argv[1], lockfile))
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python3 scripts/security/test_osv_gate.py`
Expected: `OK`.

- [ ] **Step 5: Verify against the real scan**

Run:

```bash
osv-scanner scan source --recursive --config osv-scanner.toml --format=json --output-file=osv-results.json . || true
python3 scripts/security/osv-gate.py osv-results.json; echo "exit=$?"
```

Expected: exit 1, `shell-quote`/`js-yaml` listed under `dev-only (non-blocking)`, `deepmerge-ts`/`mysql2` listed as blocking.

- [ ] **Step 6: Commit**

```bash
git add scripts/security/osv-gate.py scripts/security/test_osv_gate.py
git commit -m "feat(security): gate osv findings on production deps only"
```

---

### Task 3: Run the tests in CI

**Files:**

- Modify: `.github/workflows/security-dependency.yml`

- [ ] **Step 1: Add a test step**

In the `dependency-scan` job, after the `actions/checkout` step, add:

```yaml
- name: Test lockfile classifier
  run: |
    python3 scripts/security/test_pnpm_lock.py
    python3 scripts/security/test_osv_gate.py
```

- [ ] **Step 2: Lint the workflow**

Run: `actionlint .github/workflows/security-dependency.yml`
Expected: no errors (if `actionlint` is not installed, skip; YAML validity is checked in CI).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/security-dependency.yml
git commit -m "ci(security): run dependency-gate classifier tests"
```

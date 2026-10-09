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

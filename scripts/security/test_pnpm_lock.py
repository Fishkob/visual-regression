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

    def test_missing_importers_section_raises(self):
        with self.assertRaises(LockfileError):
            self.analyze_text(
                """
                lockfileVersion: '9.0'
                snapshots:
                  prod-lib@1.0.0: {}
                  dev-lib@1.0.0: {}
                """
            )

    def test_unknown_package_returns_none(self):
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
              app@1.0.0: {}
            """
        )
        self.assertIsNone(analysis.classify("not-in-lockfile", "1.0.0"))

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

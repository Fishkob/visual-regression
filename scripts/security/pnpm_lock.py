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
    seen_importers = False

    with open(lockfile_path, encoding="utf-8") as handle:
        for line in handle:
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            if not line.startswith(" "):
                key = line.split(":", 1)[0]
                if key == "importers":
                    seen_importers = True
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

    if not seen_importers:
        raise LockfileError("missing importers section")

    production: Set[Package] = set()
    stack = list(roots)
    while stack:
        package = stack.pop()
        if package in production:
            continue
        production.add(package)
        stack.extend(edges.get(package, ()))
    return LockAnalysis(frozenset(all_packages), frozenset(production))

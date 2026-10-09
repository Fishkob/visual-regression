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
        severities = [sev for sev in ORDER if counts[kind][sev]]
        severities += [
            sev for sev in counts[kind] if sev not in ORDER and counts[kind][sev]
        ]
        inner = ", ".join(f"{sev.lower()} {counts[kind][sev]}" for sev in severities)
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

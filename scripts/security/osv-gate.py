#!/usr/bin/env python3
"""Severity gate over osv-scanner JSON output.

Fails (exit 1) iff any reported vulnerability has severity HIGH or CRITICAL.
Exit 0 = pass, 1 = fail, 2 = usage/input error.
"""
import json
import sys

FAILING = {"CRITICAL", "HIGH"}
NORMALIZE = {"MODERATE": "MEDIUM"}
ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"]


def severity_of(vuln: dict) -> str:
    raw = (vuln.get("database_specific") or {}).get("severity")
    if not raw:
        return "UNKNOWN"
    return NORMALIZE.get(raw, raw)


def main(path: str) -> int:
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

    counts = {k: 0 for k in ORDER}
    failing = []
    for result in results:
        for pkg in result.get("packages") or []:
            name = (pkg.get("package") or {}).get("name", "?")
            for vuln in pkg.get("vulnerabilities") or []:
                sev = severity_of(vuln)
                counts[sev] = counts.get(sev, 0) + 1
                if sev in FAILING:
                    failing.append((sev, vuln.get("id", "?"), name))

    summary = ", ".join(f"{k.lower()} {v}" for k, v in counts.items() if v)
    if failing:
        print(f"osv-gate: FAIL ({summary})")
        for sev, vid, name in failing:
            print(f"  {sev} {vid} {name}")
        return 1
    print(f"osv-gate: PASS ({summary or 'no findings'})")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: osv-gate.py <osv-results.json>", file=sys.stderr)
        sys.exit(2)
    sys.exit(main(sys.argv[1]))

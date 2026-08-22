#!/usr/bin/env python3
"""Severity gate over semgrep SARIF output.

Fails (exit 1) iff any finding's rule has defaultConfiguration.level == "error"
(semgrep's ERROR severity, which the project maps to high/critical). semgrep
reports severity on the rule, not on the result, so each result's ruleId is
looked up in tool.driver.rules[]. Fail-closes when the SARIF contains no rules
at all — a failed/aborted scan (e.g. registry fetch failure) emits an empty
rules list, so "no rules" means "no scan ran". Exit 0 = pass, 1 = fail, 2 =
usage/input error.
"""
import json
import sys

FAILING = "error"


def main(path: str) -> int:
    try:
        with open(path, encoding="utf-8") as fh:
            sarif = json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"semgrep-gate: cannot read {path}: {exc}", file=sys.stderr)
        return 2

    runs = sarif.get("runs")
    if not isinstance(runs, list):
        print(
            f"semgrep-gate: cannot read {path}: missing or invalid 'runs' array",
            file=sys.stderr,
        )
        return 2

    failing = []
    total_rules = 0
    for run in runs:
        rules = {
            r.get("id"): r
            for r in run.get("tool", {}).get("driver", {}).get("rules", [])
        }
        total_rules += len(rules)
        for result in run.get("results") or []:
            rule_id = result.get("ruleId", "?")
            level = (rules.get(rule_id) or {}).get("defaultConfiguration", {}).get("level")
            if level != FAILING:
                continue
            uri = "?"
            locs = result.get("locations") or []
            if locs:
                uri = (
                    locs[0]
                    .get("physicalLocation", {})
                    .get("artifactLocation", {})
                    .get("uri", "?")
                )
            failing.append((rule_id, uri))

    if total_rules == 0:
        print(
            "semgrep-gate: SARIF contains no rules — scan did not complete",
            file=sys.stderr,
        )
        return 2

    if failing:
        print("semgrep-gate: FAIL")
        for rid, uri in failing:
            print(f"  error {rid} {uri}")
        return 1
    print("semgrep-gate: PASS")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: semgrep-gate.py <semgrep.sarif>", file=sys.stderr)
        sys.exit(2)
    sys.exit(main(sys.argv[1]))

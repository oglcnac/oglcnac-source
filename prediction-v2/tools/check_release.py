#!/usr/bin/env python3
"""Fail closed until every prospective PRED-DL 2.0 release condition is met."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--today", type=dt.date.fromisoformat, default=dt.date.today())
    args = parser.parse_args()
    protocol = json.loads((ROOT / "protocol.json").read_text())
    checklist = json.loads((ROOT / "release-checklist.json").read_text())
    freeze = dt.date.fromisoformat(protocol["corpus_freeze"])
    problems: list[str] = []
    if args.today < freeze:
        problems.append(f"corpus freeze {freeze.isoformat()} has not occurred")
    for relative in checklist["required_artifacts"]:
        path = ROOT / relative
        if not path.is_file() or path.stat().st_size == 0:
            problems.append(f"missing required artifact: {relative}")
    if problems:
        print("O-GlcNAcPRED-DL 2.0 is not release-ready:", file=sys.stderr)
        for problem in problems:
            print(f"- {problem}", file=sys.stderr)
        return 1
    print("O-GlcNAcPRED-DL 2.0 release gates passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

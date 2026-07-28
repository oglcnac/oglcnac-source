#!/usr/bin/env python3
"""Dependency-free QA checks for generated public HTML."""

from __future__ import annotations

import argparse
import sys
from html.parser import HTMLParser
from pathlib import Path
from typing import Iterable, List, Tuple
from urllib.parse import urlsplit


class RuntimeAssetParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.runtime_assets: List[Tuple[str, str]] = []

    def handle_starttag(
        self, tag: str, attrs: List[Tuple[str, str | None]]
    ) -> None:
        attributes = dict(attrs)
        if tag == "script" and attributes.get("src"):
            self.runtime_assets.append(("script", str(attributes["src"])))
        if (
            tag == "link"
            and "stylesheet" in str(attributes.get("rel", "")).casefold().split()
            and attributes.get("href")
        ):
            self.runtime_assets.append(("stylesheet", str(attributes["href"])))


def external_runtime_assets(root: Path) -> List[str]:
    findings: List[str] = []
    for path in sorted(root.rglob("*.html")):
        parser = RuntimeAssetParser()
        parser.feed(path.read_text(encoding="utf-8"))
        for asset_type, url in parser.runtime_assets:
            parsed = urlsplit(url)
            if parsed.scheme or parsed.netloc:
                relative_path = path.relative_to(root).as_posix()
                findings.append(
                    f"{relative_path}: external {asset_type} {url}"
                )
    return findings


def parse_arguments(arguments: Iterable[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Audit generated public HTML.")
    parser.add_argument(
        "--forbid-external-runtime",
        action="store_true",
        help="Reject scripts and stylesheets loaded from external origins.",
    )
    parser.add_argument(
        "root",
        nargs="?",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "frontend",
        help="Frontend root to inspect.",
    )
    return parser.parse_args(arguments)


def main(arguments: Iterable[str] | None = None) -> int:
    options = parse_arguments(arguments if arguments is not None else sys.argv[1:])
    if not options.root.is_dir():
        print(f"QA root is not a directory: {options.root}", file=sys.stderr)
        return 2
    if options.forbid_external_runtime:
        findings = external_runtime_assets(options.root)
        if findings:
            print("External runtime dependencies are forbidden:", file=sys.stderr)
            for finding in findings:
                print(f"  {finding}", file=sys.stderr)
            return 1
    print("Site QA checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

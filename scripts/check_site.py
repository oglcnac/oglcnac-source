#!/usr/bin/env python3
"""Dependency-free QA checks for generated public HTML."""

from __future__ import annotations

import argparse
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from typing import Iterable, List, Set, Tuple
from urllib.parse import unquote, urldefrag, urljoin, urlsplit


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


class LocalAssetParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.urls: List[str] = []

    def handle_starttag(
        self, tag: str, attrs: List[Tuple[str, str | None]]
    ) -> None:
        attributes = dict(attrs)
        for name in ("href", "src", "action", "poster"):
            if attributes.get(name):
                self.urls.append(str(attributes[name]))
        if attributes.get("srcset"):
            for candidate in str(attributes["srcset"]).split(","):
                url = candidate.strip().split(maxsplit=1)[0]
                if url:
                    self.urls.append(url)


AUDITED_ASSET_SUFFIXES = {
    ".css",
    ".jpeg",
    ".jpg",
    ".js",
    ".png",
    ".svg",
}
CSS_URL = re.compile(r"url\(\s*(['\"]?)(.*?)\1\s*\)", re.IGNORECASE)
JS_STATIC_URL = re.compile(r"""['"](/static/[^'"]+)['"]""")


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


def local_path(root: Path, source: Path, raw_url: str) -> Path | None:
    url, _ = urldefrag(raw_url.strip())
    parsed = urlsplit(url)
    if (
        not url
        or url.startswith("#")
        or parsed.scheme
        or parsed.netloc
        or url.startswith(("data:", "mailto:", "tel:"))
    ):
        return None
    if parsed.path.startswith("/"):
        relative = unquote(parsed.path.lstrip("/"))
    else:
        source_url = "/" + source.relative_to(root).as_posix()
        relative = unquote(urlsplit(urljoin(source_url, parsed.path)).path.lstrip("/"))
    candidate = Path(relative)
    if candidate.is_absolute() or ".." in candidate.parts:
        return None
    return candidate


def referenced_public_assets(root: Path) -> Tuple[Set[str], List[str]]:
    referenced: Set[str] = set()
    missing: List[str] = []
    queue: List[Path] = []

    def add_reference(source: Path, raw_url: str) -> None:
        relative_path = local_path(root, source, raw_url)
        if relative_path is None:
            return
        relative = relative_path.as_posix()
        is_asset = relative.startswith("static/") or relative_path.suffix.lower()
        if not is_asset:
            return
        target = root / relative_path
        if raw_url.split("?", 1)[0].split("#", 1)[0].endswith("/"):
            if target.is_dir():
                for child in sorted(target.rglob("*")):
                    if child.is_file():
                        child_relative = child.relative_to(root).as_posix()
                        if child_relative not in referenced:
                            referenced.add(child_relative)
                            queue.append(child)
            else:
                missing.append(f"missing local asset: {relative}")
            return
        if not target.is_file():
            missing.append(f"missing local asset: {relative}")
            return
        if relative not in referenced:
            referenced.add(relative)
            queue.append(target)

    for html_path in sorted(root.rglob("*.html")):
        parser = LocalAssetParser()
        parser.feed(html_path.read_text(encoding="utf-8"))
        for url in parser.urls:
            add_reference(html_path, url)

    while queue:
        source = queue.pop()
        suffix = source.suffix.lower()
        if suffix == ".css":
            for match in CSS_URL.finditer(source.read_text(encoding="utf-8")):
                add_reference(source, match.group(2))
        elif suffix == ".js":
            for match in JS_STATIC_URL.finditer(
                source.read_text(encoding="utf-8", errors="replace")
            ):
                add_reference(source, match.group(1))

    return referenced, sorted(set(missing))


def public_asset_findings(root: Path) -> List[str]:
    referenced, missing = referenced_public_assets(root)
    findings = list(missing)
    static_root = root / "static"
    if static_root.is_dir():
        for path in sorted(static_root.rglob("*")):
            if (
                path.is_file()
                and path.suffix.lower() in AUDITED_ASSET_SUFFIXES
                and path.relative_to(root).as_posix() not in referenced
            ):
                findings.append(
                    f"orphaned public asset: {path.relative_to(root).as_posix()}"
                )
    return findings


def route_findings(root: Path, site_config: Path) -> List[str]:
    try:
        configuration = json.loads(site_config.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        return [f"cannot read site route configuration {site_config}: {error}"]
    findings: List[str] = []
    configured_outputs: Set[str] = set()
    for page in configuration.get("pages", []):
        route = str(page.get("route", "<missing route>"))
        output = str(page.get("output", "<missing output>"))
        configured_outputs.add(output)
        if not (root / output).is_file():
            findings.append(f"{route}: configured output {output} does not exist")
    actual_outputs = {
        path.relative_to(root).as_posix() for path in root.rglob("*.html")
    }
    for output in sorted(actual_outputs.difference(configured_outputs)):
        findings.append(f"unconfigured public HTML output: {output}")
    return findings


def parse_arguments(arguments: Iterable[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Audit generated public HTML.")
    parser.add_argument(
        "--forbid-external-runtime",
        action="store_true",
        help="Reject scripts and stylesheets loaded from external origins.",
    )
    parser.add_argument(
        "--audit-assets",
        action="store_true",
        help="Reject missing references and orphaned public code/media assets.",
    )
    parser.add_argument(
        "--audit-routes",
        action="store_true",
        help="Reject configured routes without output and unconfigured HTML.",
    )
    parser.add_argument(
        "--site-config",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "site" / "site.json",
        help="Route configuration used by --audit-routes.",
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
    if options.audit_assets:
        findings = public_asset_findings(options.root)
        if findings:
            print("Public asset audit failed:", file=sys.stderr)
            for finding in findings:
                print(f"  {finding}", file=sys.stderr)
            return 1
    if options.audit_routes:
        findings = route_findings(options.root, options.site_config)
        if findings:
            print("Public route audit failed:", file=sys.stderr)
            for finding in findings:
                print(f"  {finding}", file=sys.stderr)
            return 1
    print("Site QA checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

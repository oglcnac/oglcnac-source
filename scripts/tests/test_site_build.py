from __future__ import annotations

import hashlib
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_ROOT = REPOSITORY_ROOT / "frontend"
BUILD_SCRIPT = REPOSITORY_ROOT / "scripts" / "build_site.py"
QA_SCRIPT = REPOSITORY_ROOT / "scripts" / "check_site.py"

GENERATED_HTML = (
    "404.html",
    "atlas/browse/index.html",
    "atlas/contact/index.html",
    "atlas/detail/index.html",
    "atlas/download/index.html",
    "atlas/index.html",
    "atlas/search/index.html",
    "atlas/statistics/index.html",
    "atlas/tutorial/index.html",
    "hexnac-quest/analysis/index.html",
    "hexnac-quest/contact/index.html",
    "hexnac-quest/index.html",
    "hexnac-quest/tutorial/index.html",
    "index.html",
    "ogt-pin/contact/index.html",
    "ogt-pin/detail/index.html",
    "ogt-pin/index.html",
    "ogt-pin/search/index.html",
    "ogt-pin/statistics/index.html",
    "ogt-pin/tutorial/index.html",
    "pred_dl/contact/index.html",
    "pred_dl/download/index.html",
    "pred_dl/index.html",
    "pred_dl/input_fasta/index.html",
    "pred_dl/tutorial/index.html",
)

GENERATED_ARTWORK = (
    "static/img/ogt-pin-overview.svg",
    "static/img/pred-dl-workflow.svg",
    "static/img/suite-hero.svg",
    "static/img/suite-workflow.svg",
    "static/img/tool-atlas.svg",
    "static/img/tool-hexnac-quest.svg",
    "static/img/tool-ogt-pin.svg",
    "static/img/tool-pred-dl.svg",
)

GENERATED_OUTPUTS = (
    GENERATED_HTML
    + ("static/css/app.css", "static/.site-build-assets.json")
    + GENERATED_ARTWORK
)

# This migration must not rewrite page-specific main content. These hashes were
# captured before introducing the shared build-time shell.
EVIDENCE_ASSET_SHA256 = {
    "static/img/figure1.png": "a17d21d28fc7f02091aa27ee642c00eb355797439406bbf5037635c799629a2b",
    "static/img/figure2.png": "5b710de762c39eeca761f3e7c7d1ea31b567b2d7fbf1fe01a1d0cd101bbe471d",
    "static/img/table1.png": "eb1c9aa6ffe6199624b39e5e92582a9248f194c01d11d70602d0aaf789b7f3a8",
    "static/img/interactome-figure1.svg": "77df672b016e3d923b3640b2526a0576c8a5b4a9b0040d285a59cc6493984f6d",
    "static/img/OGT-Interactome-760.svg": "6602ab1e8f2cf906a23a7447806e9efe5565d1ed4eef97e82d0522f8736f0708",
}


class DocumentParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.start_tags: list[tuple[str, dict[str, str]]] = []
        self.title_parts: list[str] = []
        self._in_title = False

    def handle_starttag(
        self, tag: str, attrs: list[tuple[str, str | None]]
    ) -> None:
        normalized = {name: value or "" for name, value in attrs}
        self.start_tags.append((tag, normalized))
        if tag == "title":
            self._in_title = True

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title_parts.append(data)

    def tags(self, name: str) -> list[dict[str, str]]:
        return [attrs for tag, attrs in self.start_tags if tag == name]


class AccessibilityParser(HTMLParser):
    VOID_ELEMENTS = {
        "area",
        "base",
        "br",
        "col",
        "embed",
        "hr",
        "img",
        "input",
        "link",
        "meta",
        "param",
        "source",
        "track",
        "wbr",
    }

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.stack: list[tuple[str, dict[str, str]]] = []
        self.headings: list[int] = []
        self.controls: list[tuple[str, dict[str, str], bool]] = []
        self.label_fors: set[str] = set()
        self.images: list[dict[str, str]] = []
        self.tables_outside_scroll: list[str] = []
        self.forbidden_markup: list[str] = []
        self.figure_sources: dict[str, bool] = {}

    def handle_starttag(
        self, tag: str, attrs: list[tuple[str, str | None]]
    ) -> None:
        normalized = {name: value or "" for name, value in attrs}
        if re.fullmatch(r"h[1-6]", tag):
            self.headings.append(int(tag[1]))
        if tag == "label" and normalized.get("for"):
            self.label_fors.add(normalized["for"])
        if tag in {"input", "select", "textarea"}:
            nested_label = any(parent == "label" for parent, _ in self.stack)
            self.controls.append((tag, normalized, nested_label))
        if tag == "img":
            self.images.append(normalized)
            source = normalized.get("src", "")
            if any(parent == "figure" for parent, _ in self.stack):
                self.figure_sources[source] = False
        if tag == "figcaption":
            for parent, parent_attrs in reversed(self.stack):
                if parent == "figure":
                    source = parent_attrs.get("data-figure-source", "")
                    if source:
                        self.figure_sources[source] = True
                    break
        if tag == "figure":
            normalized["data-figure-source"] = ""
        if tag == "img":
            for index in range(len(self.stack) - 1, -1, -1):
                parent, parent_attrs = self.stack[index]
                if parent == "figure":
                    parent_attrs["data-figure-source"] = normalized.get("src", "")
                    break
        if tag == "table":
            has_scroll_region = any(
                "table-scroll" in parent_attrs.get("class", "").split()
                for _, parent_attrs in self.stack
            )
            if not has_scroll_region:
                self.tables_outside_scroll.append(normalized.get("id", "<unnamed>"))
        if tag == "font":
            self.forbidden_markup.append("<font>")
        for name in ("align", "valign"):
            if name in normalized:
                self.forbidden_markup.append(f"{tag}[{name}]")
        if normalized.get("class", "").endswith(","):
            self.forbidden_markup.append(f"{tag}[class comma]")
        if tag not in self.VOID_ELEMENTS:
            self.stack.append((tag, normalized))

    def handle_endtag(self, tag: str) -> None:
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index][0] == tag:
                del self.stack[index:]
                return


def run_build(*arguments: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-S", str(BUILD_SCRIPT), *arguments],
        cwd=REPOSITORY_ROOT,
        text=True,
        capture_output=True,
        check=False,
    )


def generated_digest(root: Path) -> dict[str, str]:
    return {
        output: hashlib.sha256((root / output).read_bytes()).hexdigest()
        for output in GENERATED_OUTPUTS
    }


class SiteBuildTests(unittest.TestCase):
    maxDiff = None

    def test_build_is_dependency_free_and_deterministic(self) -> None:
        with tempfile.TemporaryDirectory() as first, tempfile.TemporaryDirectory() as second:
            first_result = run_build("--output-root", first)
            second_result = run_build("--output-root", second)

            self.assertEqual(first_result.returncode, 0, first_result.stderr)
            self.assertEqual(second_result.returncode, 0, second_result.stderr)
            self.assertEqual(
                generated_digest(Path(first)),
                generated_digest(Path(second)),
            )

    def test_check_reports_generated_output_drift(self) -> None:
        with tempfile.TemporaryDirectory() as output_directory:
            build_result = run_build("--output-root", output_directory)
            self.assertEqual(build_result.returncode, 0, build_result.stderr)
            output_root = Path(output_directory)
            (output_root / "index.html").write_text(
                (output_root / "index.html").read_text() + "\n<!-- stale -->\n"
            )

            check_result = run_build("--check", "--output-root", output_directory)

            self.assertNotEqual(check_result.returncode, 0)
            self.assertIn("Generated output is stale", check_result.stderr)
            self.assertIn("index.html", check_result.stderr)

    def test_check_reports_obsolete_owned_output_and_ignores_unrelated_files(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as output_directory:
            build_result = run_build("--output-root", output_directory)
            self.assertEqual(build_result.returncode, 0, build_result.stderr)
            output_root = Path(output_directory)
            obsolete = output_root / "retired" / "index.html"
            obsolete.parent.mkdir()
            obsolete.write_bytes((output_root / "index.html").read_bytes())
            unrelated_paths = (
                output_root / "manual.html",
                output_root / "static" / "css" / "curator.css",
                output_root / "static" / "data" / "release.json",
            )
            for path in unrelated_paths:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("unrelated public file\n")

            check_result = run_build("--check", "--output-root", output_directory)

            self.assertNotEqual(check_result.returncode, 0)
            self.assertIn("Generated output is stale", check_result.stderr)
            self.assertIn("retired/index.html", check_result.stderr)
            for path in unrelated_paths:
                self.assertNotIn(
                    path.relative_to(output_root).as_posix(),
                    check_result.stderr,
                )

    def test_build_removes_only_obsolete_owned_outputs(self) -> None:
        with tempfile.TemporaryDirectory() as output_directory:
            build_result = run_build("--output-root", output_directory)
            self.assertEqual(build_result.returncode, 0, build_result.stderr)
            output_root = Path(output_directory)
            obsolete = output_root / "retired" / "index.html"
            obsolete.parent.mkdir()
            obsolete.write_bytes((output_root / "index.html").read_bytes())
            unrelated_paths = (
                output_root / "manual.html",
                output_root / "static" / "css" / "curator.css",
                output_root / "static" / "data" / "release.json",
            )
            for path in unrelated_paths:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("unrelated public file\n")

            rebuild_result = run_build("--output-root", output_directory)

            self.assertEqual(rebuild_result.returncode, 0, rebuild_result.stderr)
            self.assertFalse(obsolete.exists())
            for path in unrelated_paths:
                self.assertTrue(path.is_file(), path)

    def test_source_asset_manifest_detects_and_removes_retired_assets(self) -> None:
        with tempfile.TemporaryDirectory() as source_directory, tempfile.TemporaryDirectory() as output_directory:
            source_root = Path(source_directory) / "site"
            shutil.copytree(REPOSITORY_ROOT / "site", source_root)
            initial_build = run_build(
                "--source-root",
                str(source_root),
                "--output-root",
                output_directory,
            )
            self.assertEqual(initial_build.returncode, 0, initial_build.stderr)

            retired_source = source_root / "assets" / "img" / "tool-atlas.svg"
            retired_output = (
                Path(output_directory) / "static" / "img" / "tool-atlas.svg"
            )
            unrelated = Path(output_directory) / "static" / "img" / "curator.svg"
            unrelated.write_text("<svg/>")
            retired_source.unlink()

            check_result = run_build(
                "--check",
                "--source-root",
                str(source_root),
                "--output-root",
                output_directory,
            )
            self.assertNotEqual(check_result.returncode, 0)
            self.assertIn("static/img/tool-atlas.svg", check_result.stderr)

            rebuild_result = run_build(
                "--source-root",
                str(source_root),
                "--output-root",
                output_directory,
            )
            self.assertEqual(rebuild_result.returncode, 0, rebuild_result.stderr)
            self.assertFalse(retired_output.exists())
            self.assertTrue(unrelated.is_file())

    def test_tracked_generated_outputs_are_current(self) -> None:
        check_result = run_build("--check")
        self.assertEqual(check_result.returncode, 0, check_result.stderr)

        tracked = subprocess.run(
            ["git", "ls-files", "--", "frontend"],
            cwd=REPOSITORY_ROOT,
            text=True,
            capture_output=True,
            check=True,
        ).stdout.splitlines()
        for output in GENERATED_OUTPUTS:
            self.assertIn(f"frontend/{output}", tracked)

    def test_generated_route_set_is_preserved(self) -> None:
        actual = tuple(
            sorted(
                path.relative_to(FRONTEND_ROOT).as_posix()
                for path in FRONTEND_ROOT.rglob("*.html")
            )
        )
        self.assertEqual(actual, tuple(sorted(GENERATED_HTML)))

    def test_shared_shell_has_metadata_and_semantic_landmarks(self) -> None:
        for relative_path in GENERATED_HTML:
            with self.subTest(page=relative_path):
                parser = DocumentParser()
                parser.feed((FRONTEND_ROOT / relative_path).read_text())
                html = parser.tags("html")
                self.assertEqual(html[0].get("lang"), "en")
                self.assertTrue("".join(parser.title_parts).strip())
                self.assertEqual(len(parser.tags("main")), 1)
                self.assertEqual(parser.tags("main")[0].get("id"), "main-content")
                skip_links = [
                    attrs
                    for attrs in parser.tags("a")
                    if attrs.get("href") == "#main-content"
                    and "skip-link" in attrs.get("class", "").split()
                ]
                self.assertEqual(len(skip_links), 1)
                site_headers = [
                    attrs
                    for attrs in parser.tags("header")
                    if "site-header" in attrs.get("class", "").split()
                ]
                self.assertEqual(len(site_headers), 1)
                self.assertEqual(len(parser.tags("footer")), 1)
                primary_nav = [
                    attrs
                    for attrs in parser.tags("nav")
                    if attrs.get("aria-label") == "Primary navigation"
                ]
                self.assertEqual(len(primary_nav), 1)
                descriptions = [
                    attrs
                    for attrs in parser.tags("meta")
                    if attrs.get("name") == "description" and attrs.get("content")
                ]
                self.assertEqual(len(descriptions), 1)
                canonicals = [
                    attrs
                    for attrs in parser.tags("link")
                    if attrs.get("rel") == "canonical"
                ]
                self.assertEqual(len(canonicals), 1)
                self.assertTrue(canonicals[0]["href"].startswith("https://oglcnac.org/"))
                current_links = [
                    attrs
                    for attrs in parser.tags("a")
                    if attrs.get("aria-current") == "page"
                    or attrs.get("data-section-current") == "true"
                ]
                self.assertGreaterEqual(len(current_links), 1)

    def test_every_page_has_one_h1_and_ordered_headings(self) -> None:
        for relative_path in GENERATED_HTML:
            with self.subTest(page=relative_path):
                parser = AccessibilityParser()
                parser.feed((FRONTEND_ROOT / relative_path).read_text())
                self.assertTrue(parser.headings, "page has no headings")
                self.assertEqual(parser.headings[0], 1, parser.headings)
                self.assertEqual(parser.headings.count(1), 1, parser.headings)
                previous = 1
                for level in parser.headings[1:]:
                    self.assertLessEqual(
                        level,
                        previous + 1,
                        f"heading level jumps from h{previous} to h{level}",
                    )
                    previous = level

    def test_form_controls_have_programmatic_names(self) -> None:
        ignored_types = {"button", "hidden", "reset", "submit"}
        unnamed: list[str] = []
        for relative_path in GENERATED_HTML:
            parser = AccessibilityParser()
            parser.feed((FRONTEND_ROOT / relative_path).read_text())
            for tag, attrs, nested_label in parser.controls:
                if attrs.get("type", "").lower() in ignored_types:
                    continue
                control_id = attrs.get("id", "")
                named = (
                    nested_label
                    or bool(attrs.get("aria-label"))
                    or bool(attrs.get("aria-labelledby"))
                    or bool(control_id and control_id in parser.label_fors)
                )
                if not named:
                    unnamed.append(
                        f"{relative_path}: {tag} {attrs.get('name') or control_id}"
                    )
        self.assertEqual(unnamed, [])

    def test_images_and_evidence_figures_are_meaningfully_described(self) -> None:
        undescribed: list[str] = []
        figures_without_captions: list[str] = []
        for relative_path in GENERATED_HTML:
            parser = AccessibilityParser()
            parser.feed((FRONTEND_ROOT / relative_path).read_text())
            for attrs in parser.images:
                description = attrs.get("alt", "").strip()
                if len(description) < 8 or re.fullmatch(
                    r"(figure|table|image)\s*\d*", description, re.IGNORECASE
                ):
                    undescribed.append(
                        f"{relative_path}: {attrs.get('src', '<missing src>')}"
                    )
            for source, has_caption in parser.figure_sources.items():
                if not has_caption:
                    figures_without_captions.append(f"{relative_path}: {source}")
        self.assertEqual(undescribed, [])
        self.assertEqual(figures_without_captions, [])

    def test_tables_are_in_keyboard_focusable_scroll_regions(self) -> None:
        uncontained: list[str] = []
        for relative_path in GENERATED_HTML:
            parser = AccessibilityParser()
            parser.feed((FRONTEND_ROOT / relative_path).read_text())
            uncontained.extend(
                f"{relative_path}: {table}"
                for table in parser.tables_outside_scroll
            )
        self.assertEqual(uncontained, [])

        for relative_path in GENERATED_HTML:
            html = (FRONTEND_ROOT / relative_path).read_text()
            for match in re.finditer(
                r'<div\b[^>]*class="[^"]*\btable-scroll\b[^"]*"[^>]*>',
                html,
                re.IGNORECASE,
            ):
                start_tag = match.group(0)
                self.assertRegex(start_tag, r'\btabindex="0"')
                self.assertRegex(start_tag, r'\brole="region"')
                self.assertRegex(
                    start_tag,
                    r'\baria-label(?:ledby)?="[^"]+"',
                )

    def test_generated_presentation_uses_modern_semantic_markup(self) -> None:
        offenders: list[str] = []
        for relative_path in GENERATED_HTML:
            parser = AccessibilityParser()
            parser.feed((FRONTEND_ROOT / relative_path).read_text())
            offenders.extend(
                f"{relative_path}: {description}"
                for description in parser.forbidden_markup
            )
        self.assertEqual(offenders, [])

    def test_conceptual_art_is_correctly_scoped_and_evidence_is_preserved(
        self,
    ) -> None:
        homepage = (FRONTEND_ROOT / "index.html").read_text()
        for misleading_source in (
            "/static/img/header.png",
            "/static/img/figure1.png",
            "/static/img/figure2.png",
        ):
            self.assertNotIn(misleading_source, homepage)
        for expected_source in (
            "/static/img/suite-hero.svg",
            "/static/img/suite-workflow.svg",
            "/static/img/tool-atlas.svg",
            "/static/img/tool-ogt-pin.svg",
            "/static/img/tool-pred-dl.svg",
            "/static/img/tool-hexnac-quest.svg",
        ):
            self.assertIn(expected_source, homepage)
            self.assertTrue((FRONTEND_ROOT / expected_source.lstrip("/")).is_file())

        suite_workflow = (
            FRONTEND_ROOT / "static/img/suite-workflow.svg"
        ).read_text()
        self.assertIn(
            'data-flow="protein-to-pred-dl"',
            suite_workflow,
            "The protein-sequence input must connect to O-GlcNAcPRED-DL",
        )

        self.assertIn(
            "/static/img/ogt-pin-overview.svg",
            (FRONTEND_ROOT / "ogt-pin/index.html").read_text(),
        )
        self.assertIn(
            "/static/img/pred-dl-workflow.svg",
            (FRONTEND_ROOT / "pred_dl/index.html").read_text(),
        )
        pred_workflow = (
            FRONTEND_ROOT / "static/img/pred-dl-workflow.svg"
        ).read_text()
        for preserved_concept in (
            "O-GlcNAcAtlas",
            "Train–test split",
            "Word2Vec",
            "one-hot",
            "BLOSUM62",
            "AAindex",
            "CNN–BiLSTM",
            "Model selection",
            "Voting",
            "O-GlcNAcPRED-DL",
        ):
            self.assertIn(preserved_concept, pred_workflow)
        for relative_path, expected_hash in EVIDENCE_ASSET_SHA256.items():
            actual = hashlib.sha256(
                (FRONTEND_ROOT / relative_path).read_bytes()
            ).hexdigest()
            self.assertEqual(actual, expected_hash, relative_path)

    def test_local_runtime_scripts_and_styles_resolve_to_tracked_assets(self) -> None:
        missing_runtime_assets: list[str] = []
        for relative_path in GENERATED_HTML:
            parser = DocumentParser()
            parser.feed((FRONTEND_ROOT / relative_path).read_text())
            runtime_urls = [
                attrs["src"]
                for attrs in parser.tags("script")
                if attrs.get("src")
            ]
            runtime_urls.extend(
                attrs["href"]
                for attrs in parser.tags("link")
                if attrs.get("rel") == "stylesheet" and attrs.get("href")
            )
            for url in runtime_urls:
                if urlsplit(url).scheme or not url.startswith("/static/"):
                    continue
                asset_path = urlsplit(url).path.lstrip("/")
                if not (FRONTEND_ROOT / asset_path).is_file():
                    missing_runtime_assets.append(f"{relative_path}: {asset_path}")
        self.assertEqual(missing_runtime_assets, [])

    def test_runtime_dependency_audit_forbids_external_origins(self) -> None:
        with tempfile.TemporaryDirectory() as fixture_directory:
            fixture_root = Path(fixture_directory)
            fixture_root.joinpath("index.html").write_text(
                """<!doctype html>
<html><head>
<link rel="stylesheet" href="/static/css/app.css">
<script src="https://cdn.example.test/runtime.js"></script>
</head><body></body></html>
"""
            )
            rejected = subprocess.run(
                [
                    sys.executable,
                    "-S",
                    str(QA_SCRIPT),
                    "--forbid-external-runtime",
                    fixture_directory,
                ],
                cwd=REPOSITORY_ROOT,
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertNotEqual(rejected.returncode, 0)
            self.assertIn(
                "index.html: external script https://cdn.example.test/runtime.js",
                rejected.stderr,
            )

            fixture_root.joinpath("index.html").write_text(
                """<!doctype html>
<html><head>
<link rel="stylesheet" href="/static/css/app.css">
<script src="/static/js/app.js"></script>
<script src="./static/js/feature.js"></script>
</head><body></body></html>
"""
            )
            accepted = subprocess.run(
                [
                    sys.executable,
                    "-S",
                    str(QA_SCRIPT),
                    "--forbid-external-runtime",
                    fixture_directory,
                ],
                cwd=REPOSITORY_ROOT,
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(accepted.returncode, 0, accepted.stderr)

    def test_runtime_dependency_audit_treats_stylesheet_rel_case_insensitively(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as fixture_directory:
            Path(fixture_directory, "index.html").write_text(
                """<!doctype html>
<html><head>
<link rel="alternate StyleSheet" href="https://cdn.example.test/theme.css">
</head><body></body></html>
"""
            )

            result = subprocess.run(
                [
                    sys.executable,
                    "-S",
                    str(QA_SCRIPT),
                    "--forbid-external-runtime",
                    fixture_directory,
                ],
                cwd=REPOSITORY_ROOT,
                text=True,
                capture_output=True,
                check=False,
            )

            self.assertNotEqual(result.returncode, 0)
            self.assertIn(
                "index.html: external stylesheet https://cdn.example.test/theme.css",
                result.stderr,
            )

    def test_generated_site_has_no_external_runtime_dependencies(self) -> None:
        result = subprocess.run(
            [
                sys.executable,
                "-S",
                str(QA_SCRIPT),
                "--forbid-external-runtime",
                str(FRONTEND_ROOT),
            ],
            cwd=REPOSITORY_ROOT,
            text=True,
            capture_output=True,
            check=False,
        )

        self.assertEqual(result.returncode, 0, result.stderr)

    def test_deploy_rejects_stale_generated_output_before_copying(self) -> None:
        with tempfile.TemporaryDirectory() as source_directory:
            source_root = Path(source_directory)
            build_result = run_build("--output-root", source_directory)
            self.assertEqual(build_result.returncode, 0, build_result.stderr)
            (source_root / "index.html").write_text(
                (source_root / "index.html").read_text() + "\n<!-- stale -->\n"
            )
            environment = os.environ.copy()
            environment["SOURCE_DIR"] = source_directory
            environment["DEPLOY_DIR"] = str(source_root / "missing-deploy")

            deploy_result = subprocess.run(
                [str(REPOSITORY_ROOT / "scripts" / "deploy-frontend.sh")],
                cwd=REPOSITORY_ROOT,
                env=environment,
                text=True,
                capture_output=True,
                check=False,
            )

            self.assertNotEqual(deploy_result.returncode, 0)
            self.assertIn("Generated output is stale", deploy_result.stderr)
            self.assertNotIn("not a git repository", deploy_result.stderr)

    def test_deploy_rejects_obsolete_owned_output_before_copying(self) -> None:
        with tempfile.TemporaryDirectory() as source_directory:
            source_root = Path(source_directory)
            build_result = run_build("--output-root", source_directory)
            self.assertEqual(build_result.returncode, 0, build_result.stderr)
            obsolete = source_root / "retired" / "index.html"
            obsolete.parent.mkdir()
            obsolete.write_bytes((source_root / "index.html").read_bytes())
            environment = os.environ.copy()
            environment["SOURCE_DIR"] = source_directory
            environment["DEPLOY_DIR"] = str(source_root / "missing-deploy")

            deploy_result = subprocess.run(
                [str(REPOSITORY_ROOT / "scripts" / "deploy-frontend.sh")],
                cwd=REPOSITORY_ROOT,
                env=environment,
                text=True,
                capture_output=True,
                check=False,
            )

            self.assertNotEqual(deploy_result.returncode, 0)
            self.assertIn("Generated output is stale", deploy_result.stderr)
            self.assertIn("retired/index.html", deploy_result.stderr)
            self.assertNotIn("not a git repository", deploy_result.stderr)


if __name__ == "__main__":
    unittest.main()

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

from scripts.smoke_static_site import LinkParser as SmokeLinkParser


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_ROOT = REPOSITORY_ROOT / "dist"
BUILD_SCRIPT = REPOSITORY_ROOT / "scripts" / "build_site.py"
QA_SCRIPT = REPOSITORY_ROOT / "scripts" / "check_site.py"
STATIC_SMOKE_SCRIPT = REPOSITORY_ROOT / "scripts" / "smoke_static_site.py"

GENERATED_HTML = (
    "404.html",
    "analysis/index.html",
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
    "citations/index.html",
    "licenses/index.html",
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
    "pred_dl/model-card/index.html",
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

MARKDOWN_LINK_PATTERN = re.compile(r"(?<!!)\[([^]]+)\]\(([^()\s]+)\)")
NAR_STATUS_PATTERN = re.compile(
    r"<!--\s*nar-status:\s*([a-z][a-z0-9_]*)=([a-z0-9_.-]+)\s*-->",
    re.IGNORECASE,
)


def normalized_markdown(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[*`_>]", "", text)).strip()


def markdown_links(text: str) -> tuple[tuple[str, str], ...]:
    return tuple(MARKDOWN_LINK_PATTERN.findall(text))


def nar_statuses(text: str) -> dict[str, str]:
    return {
        key.casefold(): value.casefold()
        for key, value in NAR_STATUS_PATTERN.findall(text)
    }


def local_markdown_target(document: Path, target: str) -> Path | None:
    parsed = urlsplit(target)
    if parsed.scheme or parsed.netloc or not parsed.path:
        return None
    return document.parent / parsed.path


def markdown_section(text: str, heading: str) -> str | None:
    expected_heading = normalized_markdown(heading).casefold()
    lines = text.splitlines(keepends=True)
    for index, line in enumerate(lines):
        match = re.match(r"^(#{1,6})\s+(.+?)\s*$", line)
        if (
            not match
            or normalized_markdown(match.group(2)).casefold() != expected_heading
        ):
            continue
        level = len(match.group(1))
        section = [line]
        for following in lines[index + 1 :]:
            next_heading = re.match(r"^(#{1,6})\s+", following)
            if next_heading and len(next_heading.group(1)) <= level:
                break
            section.append(following)
        return "".join(section)
    return None


def prohibits_terms(text: str, action: str, terms: tuple[str, ...]) -> bool:
    clause = re.search(
        rf"\b(?:must|shall)\s+not\s+{re.escape(action)}\b(?P<objects>[^.]*)",
        normalized_markdown(text),
        re.IGNORECASE,
    )
    if clause is None:
        return False
    objects = clause.group("objects").casefold()
    return all(term.casefold() in objects for term in terms)


def states_no_results(text: str) -> bool:
    return bool(
        re.search(
            r"\b(?:reports?|contains?)\s+no\s+results\b",
            normalized_markdown(text),
            re.IGNORECASE,
        )
    )


# These are targeted tripwires for representative high-risk claims, not general
# natural-language classifiers. Structured nar-status markers lock the durable
# document states independently of these patterns.
def contains_targeted_current_pred_dl_v2_claim(text: str) -> bool:
    v2_pattern = r"\b(?:O-GlcNAc)?PRED[- ]DL\s+2\.0\b"
    for sentence in re.split(r"(?<=[.!?])\s+", normalized_markdown(text)):
        if not re.search(v2_pattern, sentence, re.IGNORECASE):
            continue
        if re.search(
            rf"\bcurrent\s+(?:public\s+)?(?:predictor|model|version)\b"
            rf"[^.!?]{{0,50}}{v2_pattern}"
            rf"|{v2_pattern}[^.!?]{{0,50}}"
            r"\b(?:is|remains)\s+the\s+current\s+(?:public\s+)?"
            r"(?:predictor|model|version)\b",
            sentence,
            re.IGNORECASE,
        ):
            return True
        for match in re.finditer(
            r"\b(?:is|are|was|were|has been|have been|remains|now)\b"
            r"[^.!?]{0,50}\b(?:publicly\s+available|released|available)\b",
            sentence,
            re.IGNORECASE,
        ):
            if not re.search(
                r"\b(?:no|not|never|without)\b", match.group(), re.IGNORECASE
            ):
                return True
    return False


def contains_targeted_prospective_result_claim(text: str) -> bool:
    normalized = normalized_markdown(text)
    for match in re.finditer(
        r"\b(?:benchmark\s+results?|results?)\b[^.!?]{0,80}"
        r"\b(?:is|are|was|were|has|have|remains)\b[^.!?]{0,50}"
        r"\b(?:complete|completed)\b"
        r"|\b(?:we|the\s+(?:study|benchmark|evaluation|analysis))\b"
        r"[^.!?]{0,60}\bcompleted\b[^.!?]{0,80}\bresults?\b",
        normalized,
        re.IGNORECASE,
    ):
        if not re.search(
            r"\b(?:no|not|never|without)\b", match.group(), re.IGNORECASE
        ):
            return True
    v2_pattern = r"\b(?:O-GlcNAc)?PRED[- ]DL\s+2\.0\b"
    metric_pattern = r"\b(?:AUPRC|AUROC|MCC|F1|Brier|ECE)\b"
    numeric_result = (
        rf"{v2_pattern}[^.!?]{{0,100}}"
        r"\b(?:outperformed|improved|achieved|attained|scored|yielded|obtained)\b"
        rf"[^.!?]{{0,80}}(?:\b\d+(?:\.\d+)?\b[^.!?]{{0,30}})?{metric_pattern}"
        rf"|{metric_pattern}[^.!?]{{0,80}}\b(?:was|is)\b[^.!?]{{0,40}}"
        rf"\b\d+(?:\.\d+)?\b[^.!?]{{0,40}}{v2_pattern}"
    )
    generic_finding = (
        r"\b(?:the\s+)?(?:study|benchmark|evaluation|analysis)\b[^.!?]{0,60}"
        r"\b(?:found|observed|showed|demonstrated|outperformed|achieved)\b"
    )
    return bool(
        re.search(numeric_result, normalized, re.IGNORECASE)
        or re.search(generic_finding, normalized, re.IGNORECASE)
    )


def contains_permissive_tracking_clause(text: str) -> bool:
    tracking_term = (
        r"(?:Cloudflare\s+(?:Browser\s+)?Insights(?:/RUM)?|/cdn-cgi/rum|"
        r"Google\s+Analytics|Google\s+Tag\s+Manager|tracking\s+cookies?|"
        r"fingerprinting|user-agent\s+profiling|hidden\s+telemetry)"
    )
    for match in re.finditer(
        r"\b(?:may|can|will|is\s+permitted\s+to|is\s+allowed\s+to)\b"
        r"[^.!?]{0,50}\b(?:use|enable|collect|add)\b"
        rf"[^.!?]{{0,80}}{tracking_term}",
        normalized_markdown(text),
        re.IGNORECASE,
    ):
        if not re.search(r"\b(?:not|never)\b", match.group(), re.IGNORECASE):
            return True
    return False


def states_no_adoption_results(text: str) -> bool:
    return bool(
        re.search(
            r"\bdoes\s+not\s+report\s+adoption\s+results\b",
            normalized_markdown(text),
            re.IGNORECASE,
        )
    )


def states_no_invented_adoption_counts(text: str) -> bool:
    return bool(
        re.search(
            r"\bno\s+entries\s+or\s+counts\s+are\s+invented\b",
            normalized_markdown(text),
            re.IGNORECASE,
        )
    )


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


class MainLinkParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._main_depth = 0
        self.hrefs: set[str] = set()

    def handle_starttag(
        self, tag: str, attrs: list[tuple[str, str | None]]
    ) -> None:
        if tag == "main":
            self._main_depth += 1
        if tag == "a" and self._main_depth:
            href = dict(attrs).get("href")
            if href:
                self.hrefs.add(href)

    def handle_endtag(self, tag: str) -> None:
        if tag == "main" and self._main_depth:
            self._main_depth -= 1


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

    def test_check_reports_every_unexpected_output_file(
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
                self.assertIn(
                    path.relative_to(output_root).as_posix(),
                    check_result.stderr,
                )

    def test_build_refuses_to_delete_unowned_output_files(self) -> None:
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

            self.assertNotEqual(rebuild_result.returncode, 0)
            self.assertIn("Refusing to remove unowned files", rebuild_result.stderr)
            self.assertTrue(obsolete.exists())
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

    def test_generated_outputs_are_disposable_and_source_inputs_are_tracked(self) -> None:
        check_result = run_build("--check")
        self.assertEqual(check_result.returncode, 0, check_result.stderr)

        tracked = subprocess.run(
            ["git", "ls-files", "--", "public", "site"],
            cwd=REPOSITORY_ROOT,
            text=True,
            capture_output=True,
            check=True,
        ).stdout.splitlines()
        self.assertFalse((REPOSITORY_ROOT / "frontend").exists())
        self.assertTrue((REPOSITORY_ROOT / "public/static/data/atlas-records.json").is_file())
        self.assertIn("site/site.json", tracked)
        self.assertNotIn("dist/index.html", tracked)

    def test_generated_route_set_is_preserved(self) -> None:
        actual = tuple(
            sorted(
                path.relative_to(FRONTEND_ROOT).as_posix()
                for path in FRONTEND_ROOT.rglob("*.html")
            )
        )
        self.assertEqual(actual, tuple(sorted(GENERATED_HTML)))

    def test_resource_home_pages_expose_every_destination_in_main_content(self) -> None:
        expected = {
            "atlas/index.html": {
                "/atlas/statistics/",
                "/atlas/search/",
                "/atlas/browse/",
                "/atlas/tutorial/",
                "/atlas/download/",
                "/atlas/contact/",
            },
            "ogt-pin/index.html": {
                "/ogt-pin/statistics/",
                "/ogt-pin/search/",
                "/ogt-pin/tutorial/",
                "/ogt-pin/contact/",
            },
            "pred_dl/index.html": {
                "/pred_dl/input_fasta/",
                "/pred_dl/tutorial/",
                "/pred_dl/download/",
                "/pred_dl/contact/",
            },
            "hexnac-quest/index.html": {
                "/hexnac-quest/analysis/",
                "/hexnac-quest/tutorial/",
                "/hexnac-quest/contact/",
            },
        }
        for relative_path, required_links in expected.items():
            with self.subTest(page=relative_path):
                parser = MainLinkParser()
                parser.feed((FRONTEND_ROOT / relative_path).read_text())
                self.assertEqual(required_links - parser.hrefs, set())

    def test_pre_refresh_scientific_context_remains_present(self) -> None:
        expected_facts = {
            "index.html": (
                "serine, threonine, and tyrosine",
                "transcription, translation, cell-cycle control, metabolism, and signaling",
                "download curated datasets",
            ),
            "atlas/index.html": (
                "nucleus, cytosol, and mitochondria",
                "species-, tissue-/cell-, protein-, and site-specific",
            ),
            "ogt-pin/index.html": (
                "molecular networks",
                "drug development",
                "past several decades",
            ),
            "pred_dl/index.html": (
                "improved sensitivity and accuracy",
                "physiology and disease",
                "predictions should prioritize experimental work",
            ),
            "hexnac-quest/index.html": (
                "diagnostic oxonium-ion intensities",
                "published logistic regression model",
                "your data stays on your device",
            ),
        }
        for relative_path, facts in expected_facts.items():
            with self.subTest(page=relative_path):
                text = re.sub(
                    r"\s+",
                    " ",
                    (FRONTEND_ROOT / relative_path).read_text().casefold(),
                )
                for fact in facts:
                    self.assertIn(fact.casefold(), text)

    def test_workbench_v2_labeling_requires_comprehensive_release_gate(self) -> None:
        readme_path = REPOSITORY_ROOT / "README.md"
        workbench_path = REPOSITORY_ROOT / "docs" / "WORKBENCH.md"
        protocol_path = REPOSITORY_ROOT / "docs" / "NAR-STUDY-PROTOCOL.md"
        readme_links = {target for _, target in markdown_links(readme_path.read_text())}
        workbench_raw = workbench_path.read_text(encoding="utf-8")
        workbench_links = {
            target for _, target in markdown_links(workbench_raw)
        }
        workbench = normalized_markdown(workbench_raw)

        workbench_target = workbench_path.relative_to(REPOSITORY_ROOT).as_posix()
        self.assertIn(workbench_target, readme_links)
        self.assertEqual(
            local_markdown_target(readme_path, workbench_target), workbench_path
        )
        protocol_target = "NAR-STUDY-PROTOCOL.md"
        self.assertIn(protocol_target, workbench_links)
        self.assertEqual(
            local_markdown_target(workbench_path, protocol_target), protocol_path
        )
        self.assertIn("prediction-v2/tools/check_release.py", workbench_raw)
        self.assertRegex(
            workbench,
            r"\bnecessary\b[^.]{0,80}\binsufficient\b"
            r"[^.]{0,80}\bpartial automated check\b",
        )
        self.assertRegex(
            workbench,
            r"\bsuccessful (?:run|pass)\b[^.]{0,120}\bdoes not authorize\b"
            r"[^.]{0,100}\bPRED-DL 2\.0\b[^.]{0,80}\brelease or labeling\b",
        )
        self.assertRegex(
            workbench,
            r"\bDo not release PRED-DL 2\.0 or label Workbench output as "
            r"PRED-DL 2\.0 unless every documented release criterion\b"
            r".{0,120}\bfuture comprehensive executable gate\b",
        )

    def test_nar_planning_artifacts_remain_linked_and_prospective(self) -> None:
        nar_documents = {
            "inquiry": REPOSITORY_ROOT / "docs" / "NAR-SUITABILITY-INQUIRY.md",
            "protocol": REPOSITORY_ROOT / "docs" / "NAR-STUDY-PROTOCOL.md",
            "adoption": REPOSITORY_ROOT / "docs" / "NAR-ADOPTION-EVIDENCE.md",
        }
        readme_path = REPOSITORY_ROOT / "README.md"
        readme_links = {
            target for _, target in markdown_links(readme_path.read_text())
        }
        for document in nar_documents.values():
            expected_target = document.relative_to(REPOSITORY_ROOT).as_posix()
            with self.subTest(readme_target=expected_target):
                self.assertIn(expected_target, readme_links)
                self.assertEqual(
                    local_markdown_target(readme_path, expected_target), document
                )
                self.assertTrue(document.is_file())

        inquiry_path = nar_documents["inquiry"]
        inquiry_raw = inquiry_path.read_text(encoding="utf-8")
        inquiry = normalized_markdown(inquiry_raw)
        inquiry_status = nar_statuses(inquiry_raw)
        inquiry_links = {target for _, target in markdown_links(inquiry_raw)}
        self.assertEqual(
            inquiry_status.get("document_role"),
            "internal_formal_suitability_proposal_draft",
        )
        self.assertEqual(inquiry_status.get("submission"), "unsent")
        self.assertEqual(inquiry_status.get("results"), "none")
        self.assertIn(
            "https://academic.oup.com/nar/pages/submission_webserver",
            inquiry_links,
        )
        inquiry_fields = {
            "Input": r"\bInput\s*[:.]",
            "Output": r"\bOutput\s*[:.]",
            "Processing method": r"\bProcessing method\s*[:.]",
            "Novelty": r"\bNovelty\b[^.]{0,80}\bbenefit\b",
        }
        for label, pattern in inquiry_fields.items():
            with self.subTest(inquiry_label=label):
                self.assertRegex(inquiry, pattern)
        self.assertRegex(inquiry, r"\bINTERNAL\b.*\bUNSENT\b.*\bNOT SUBMITTED\b")
        self.assertRegex(
            inquiry,
            r"\binternal draft\b[^.]{0,100}\bformal one-page suitability proposal\b",
        )
        self.assertRegex(inquiry, r"\binstructions checked\b[^.]{0,30}\b2026-08-31\b")
        self.assertRegex(inquiry, r"\bno more than one page\b")
        self.assertRegex(inquiry, r"\bconfirm\s+authorship\s*,?\s+affiliations\b")
        self.assertRegex(inquiry, r"\bmaintain\w*\b[^.]{0,80}\bfive\s+years?\b")
        self.assertRegex(inquiry, r"\badvise\b[^?]*\b(?:two-year|eligib)\w*")
        keywords = re.search(r"\bKeywords\s*[.:]\s*([^.]*)", inquiry, re.IGNORECASE)
        self.assertIsNotNone(keywords)
        assert keywords is not None
        keyword_items = [item for item in keywords.group(1).split(";") if item.strip()]
        self.assertGreaterEqual(len(keyword_items), 2)
        self.assertLessEqual(len(keyword_items), 4)
        for pmid in (
            "33442735",
            "39988118",
            "34502531",
            "38054441",
            "36122299",
            "38995536",
        ):
            with self.subTest(inquiry_pmid=pmid):
                self.assertRegex(inquiry, rf"\bPMID\s+{pmid}\b")
        self.assertRegex(inquiry, r"\barticle date\s+2025-02-21\b")
        self.assertRegex(inquiry, r"\bissue publication\s+2025-08-01\b")
        self.assertRegex(
            inquiry,
            r"\bupdate or resubmission\b[^.]{0,160}\bNAR or elsewhere\b",
        )
        self.assertFalse(contains_targeted_current_pred_dl_v2_claim(inquiry_raw))
        self.assertFalse(contains_targeted_prospective_result_claim(inquiry_raw))

        protocol_raw = nar_documents["protocol"].read_text(encoding="utf-8")
        protocol_markers = nar_statuses(protocol_raw)
        self.assertEqual(
            protocol_markers.get("document_role"), "prospective_methods_only"
        )
        self.assertEqual(protocol_markers.get("results"), "none")
        self.assertEqual(protocol_markers.get("public_predictor"), "pred-dl_1.0")
        self.assertEqual(
            protocol_markers.get("comprehensive_release_gate"),
            "pending_implementation_and_test",
        )
        self.assertFalse(contains_targeted_current_pred_dl_v2_claim(protocol_raw))
        self.assertFalse(contains_targeted_prospective_result_claim(protocol_raw))
        protocol_status = markdown_section(protocol_raw, "Status and scope")
        self.assertIsNotNone(protocol_status)
        assert protocol_status is not None
        self.assertTrue(states_no_results(protocol_status))
        self.assertRegex(
            normalized_markdown(protocol_status),
            r"\bdoes not describe a released PRED-DL 2\.0 model\b",
        )
        self.assertRegex(
            normalized_markdown(protocol_status),
            r"\b2027-01-31\b.*\bcurrent public predictor\b.*\b(?:v1|1\.0)\b",
        )
        labels = markdown_section(protocol_raw, "2.2 Label definition and estimand")
        leakage = markdown_section(
            protocol_raw, "3. Leakage-resistant split assignment"
        )
        metrics = markdown_section(
            protocol_raw, "4.2 Required evaluation outputs"
        )
        comparators = markdown_section(
            protocol_raw, "5. External comparator protocol"
        )
        parity = markdown_section(
            protocol_raw, "6. Browser/Python parity and browser feasibility"
        )
        use_cases = markdown_section(
            protocol_raw, "7. Prospective biological use cases"
        )
        usability = markdown_section(
            protocol_raw, "8. Consented usability evaluation"
        )
        for name, section in {
            "labels": labels,
            "leakage": leakage,
            "metrics": metrics,
            "comparators": comparators,
            "parity": parity,
            "use cases": use_cases,
            "usability": usability,
        }.items():
            with self.subTest(protocol_section=name):
                self.assertIsNotNone(section)
        assert labels is not None
        assert leakage is not None
        assert metrics is not None
        assert comparators is not None
        assert parity is not None
        assert use_cases is not None
        assert usability is not None
        labels = normalized_markdown(labels)
        self.assertRegex(labels, r"\bonly\s+positive\s+labels\b")
        self.assertRegex(
            labels,
            r"(?i)\bambiguous sites\b.*\bdistinct analysis stratum\b",
        )
        self.assertRegex(labels, r"\bunlabeled\b.*\bpositive-unlabeled\b")
        self.assertRegex(
            labels,
            r"\bprobability\b[^.]{0,120}\brecorded as a positive\b"
            r"[^.]{0,120}\bfrozen Atlas ascertainment\b",
        )
        self.assertRegex(
            labels,
            r"\bnot\b[^.]{0,80}\bbiological modification probability\b",
        )
        publication_dates = markdown_section(
            protocol_raw, "2.3 Canonical publication-date rule"
        )
        self.assertIsNotNone(publication_dates)
        assert publication_dates is not None
        publication_dates = normalized_markdown(publication_dates)
        self.assertRegex(
            publication_dates,
            r"\bearliest verifiable\b[^.]{0,100}"
            r"\b(?:public article|first-online|ePub)\b",
        )
        self.assertRegex(
            publication_dates,
            r"\bfallback\b[^.]{0,80}\bissue date\b[^.]{0,80}"
            r"\bPubMed publication date\b",
        )
        self.assertRegex(
            publication_dates, r"\bsame-day\b[^.]{0,120}\bdeterministic\b"
        )
        self.assertRegex(
            publication_dates, r"(?i)\brecord\b[^.]{0,100}\bsource\b"
        )
        leakage = normalized_markdown(leakage)
        for group in ("PMID", "protein accession", "sequence cluster"):
            with self.subTest(leakage_group=group):
                self.assertIn(group.casefold(), leakage.casefold())
        metrics = normalized_markdown(metrics)
        for metric in (
            "macro-species AUPRC",
            "AUROC",
            "MCC",
            "F1",
            "sensitivity",
            "specificity",
            "Brier score",
            "expected calibration error",
        ):
            with self.subTest(metric=metric):
                self.assertIn(metric.casefold(), metrics.casefold())
        self.assertRegex(
            metrics,
            r"\bannotation-probability calibration\b[^.]{0,160}\bestimand\b",
        )
        self.assertRegex(
            metrics,
            r"\bnever\b[^.]{0,100}\bbiological calibration\b",
        )
        comparators = normalized_markdown(comparators)
        self.assertRegex(
            comparators,
            r"\brequired comparator panel\b.*\bDeepO-GlcNAc\b",
        )
        self.assertRegex(
            comparators,
            r"\bat least one additional functioning comparator\b",
        )
        parity = normalized_markdown(parity)
        self.assertRegex(parity, r"\bbrowser and Python implementations must\b")
        self.assertRegex(parity, r"\bsame frozen corpus hash\b")
        self.assertRegex(parity, r"\bblocking criterion\b.*\bblocks public v2 release\b")
        case_rows = re.findall(r"(?m)^\|\s*[A-Z]\.\s*", use_cases)
        self.assertEqual(len(case_rows), 3)
        self.assertRegex(
            normalized_markdown(use_cases),
            r"(?i)\bno actual protein\b.*\bselected or claimed\b",
        )
        self.assertRegex(
            normalized_markdown(usability),
            r"\bObtain consent before data collection\b",
        )
        usability = normalized_markdown(usability)
        self.assertRegex(usability, r"\bfixed sample\b[^.]{0,60}\b24\b")
        self.assertRegex(usability, r"\bthree fixed tasks per interface\b")
        self.assertRegex(usability, r"\bcounterbalanced\b[^.]{0,80}\border\b")
        self.assertRegex(
            usability,
            r"\bno optional stopping\b[^.]{0,120}\bno replacement\b"
            r"[^.]{0,80}\boutcomes\b",
        )
        self.assertRegex(
            usability,
            r"\bparticipant-level critical-error-free outcome\b",
        )
        self.assertRegex(usability, r"\bparticipant-level median time\b")
        self.assertRegex(
            usability,
            r"\bincomplete task\b[^.]{0,180}\b15 minutes\b",
        )
        self.assertRegex(
            usability,
            r"\bpower and sensitivity plan\b[^.]{0,160}\bbefore recruitment\b",
        )

        release_decision = markdown_section(
            protocol_raw, "9. Artifacts, reporting, and release decision"
        )
        self.assertIsNotNone(release_decision)
        assert release_decision is not None
        release_decision = normalized_markdown(release_decision)
        self.assertRegex(
            release_decision,
            r"\bcurrent check_?release\.py\b[^.]{0,100}\bnecessary\b"
            r"[^.]{0,80}\binsufficient\b[^.]{0,80}\bpartial automated check\b",
        )
        self.assertRegex(
            release_decision,
            r"\bimplement and test one comprehensive executable gate\b",
        )

        adoption_raw = nar_documents["adoption"].read_text(encoding="utf-8")
        adoption_boundary = markdown_section(adoption_raw, "Purpose and boundary")
        prohibited = markdown_section(adoption_raw, "Prohibited collection and tracking")
        readiness_gate = markdown_section(
            adoption_raw, "Collection, verification, and internal readiness gate"
        )
        for name, section in {
            "adoption boundary": adoption_boundary,
            "prohibited collection": prohibited,
            "readiness gate": readiness_gate,
        }.items():
            with self.subTest(adoption_section=name):
                self.assertIsNotNone(section)
        assert adoption_boundary is not None
        assert prohibited is not None
        assert readiness_gate is not None
        self.assertTrue(states_no_adoption_results(adoption_boundary))
        self.assertTrue(states_no_invented_adoption_counts(adoption_raw))
        self.assertFalse(contains_permissive_tracking_clause(adoption_raw))
        self.assertTrue(
            prohibits_terms(
                prohibited,
                "use",
                (
                    "Cloudflare Browser Insights/RUM",
                    "/cdn-cgi/rum",
                    "Google Analytics",
                    "Google Tag Manager",
                    "permanent or tracking cookies",
                    "fingerprinting",
                    "IP or user-agent profiling",
                    "hidden telemetry",
                ),
            )
        )
        self.assertTrue(
            prohibits_terms(
                prohibited,
                "collect",
                ("submitted FASTA", "CSV content"),
            )
        )
        self.assertRegex(
            normalized_markdown(adoption_raw),
            r"\bengagement\b\s*,?\s+not\s+users\s+or\s+adoption\b",
        )
        self.assertRegex(
            normalized_markdown(readiness_gate),
            r"\binternal\s+readiness gate\s*,?\s+not an NAR rule\b",
        )
        provider_metadata = markdown_section(
            adoption_raw, "Hosting-provider operational metadata"
        )
        self.assertIsNotNone(provider_metadata)
        assert provider_metadata is not None
        provider_metadata = normalized_markdown(provider_metadata)
        self.assertRegex(
            provider_metadata,
            r"\bsite adds no client analytics or tracking\b",
        )
        self.assertRegex(
            provider_metadata,
            r"\bhosting(?:\s+provider)?(?:/CDN| and CDN)?\b[^.]{0,120}"
            r"\bnetwork and security metadata\b",
        )
        self.assertRegex(
            provider_metadata,
            r"\bnot used by the project\b[^.]{0,100}"
            r"\buser profiling or adoption counts\b",
        )
        self.assertRegex(
            provider_metadata,
            r"(?i)\bverify the current deployment separately\b[^.]{0,200}"
            r"\bbefore the proposal\b",
        )

        readiness_path = (
            REPOSITORY_ROOT / "docs" / "NAR-WEB-SERVER-READINESS.md"
        )
        readiness_raw = readiness_path.read_text(encoding="utf-8")
        readiness_markers = nar_statuses(readiness_raw)
        self.assertEqual(
            readiness_markers.get("formal_proposal"),
            "blocked_pending_independent_validation_and_team_approvals",
        )
        self.assertEqual(
            readiness_markers.get("manuscript"),
            "blocked_pending_editor_invitation_or_approval",
        )
        self.assertEqual(
            readiness_markers.get("comprehensive_release_gate"),
            "pending_implementation_and_test",
        )
        readiness_links = {target for _, target in markdown_links(readiness_raw)}
        for document in nar_documents.values():
            target = document.name
            with self.subTest(readiness_target=target):
                self.assertIn(target, readiness_links)
                self.assertEqual(
                    local_markdown_target(readiness_path, target), document
                )
        readiness_sequence = markdown_section(
            readiness_raw, "Dated preparation sequence"
        )
        self.assertIsNotNone(readiness_sequence)
        assert readiness_sequence is not None
        positions = [
            readiness_sequence.index(marker)
            for marker in (
                "September–October 2026",
                "From November 2026",
                "Through 2027-01-31",
                "February–April 2027",
                "After independent validation and team approvals",
                "Only after editor invitation or approval",
            )
        ]
        self.assertEqual(positions, sorted(positions))
        readiness_sequence = normalized_markdown(readiness_sequence)
        november_row = re.search(
            r"\|\s*From November 2026\s*\|\s*([^|]+)\|",
            readiness_sequence,
        )
        prefreeze_row = re.search(
            r"\|\s*Through 2027-01-31\s*\|\s*([^|]+)\|",
            readiness_sequence,
        )
        proposal_row = re.search(
            r"\|\s*After independent validation and team approvals\s*\|"
            r"\s*([^|]+)\|",
            readiness_sequence,
        )
        self.assertIsNotNone(november_row)
        self.assertIsNotNone(prefreeze_row)
        self.assertIsNotNone(proposal_row)
        assert november_row is not None
        assert prefreeze_row is not None
        assert proposal_row is not None
        self.assertRegex(november_row.group(1), r"\bprepare only\b")
        self.assertRegex(november_row.group(1), r"\bDo not send\b")
        self.assertRegex(
            prefreeze_row.group(1),
            r"\bBefore 2027-01-31\b[^.]{0,100}\bselection rules\b"
            r"[^.]{0,100}\bnever select\b",
        )
        self.assertRegex(
            proposal_row.group(1),
            r"\bone formal suitability proposal\b[^|]{0,160}\bby email\b",
        )

        root_readme = (REPOSITORY_ROOT / "README.md").read_text(encoding="utf-8")
        v2_readme = (
            REPOSITORY_ROOT / "prediction-v2" / "README.md"
        ).read_text(encoding="utf-8")
        self.assertNotIn("fail-closed release gate", root_readme.casefold())
        self.assertRegex(
            normalized_markdown(v2_readme),
            r"\bpartial automated check\b[^.]{0,100}\bnecessary\b"
            r"[^.]{0,80}\binsufficient\b",
        )

    def test_nar_document_helpers_reject_counterexamples(self) -> None:
        self.assertFalse(states_no_results("The benchmark reports results."))
        self.assertFalse(
            states_no_adoption_results("The adoption results are 12 users.")
        )
        self.assertFalse(
            states_no_invented_adoption_counts(
                "This document does not report adoption results."
            )
        )
        self.assertFalse(
            states_no_adoption_results("No entries or counts are invented.")
        )
        self.assertTrue(
            contains_targeted_current_pred_dl_v2_claim(
                "PRED-DL 2.0 is now publicly available."
            )
        )
        self.assertTrue(
            contains_targeted_current_pred_dl_v2_claim(
                "The current public predictor is O-GlcNAcPRED-DL 2.0."
            )
        )
        self.assertTrue(
            contains_targeted_prospective_result_claim(
                "PRED-DL 2.0 remains prospective. "
                "The benchmark results are complete."
            )
        )
        self.assertTrue(
            contains_targeted_prospective_result_claim(
                "PRED-DL 2.0 is not publicly available, but its "
                "benchmark results are complete."
            )
        )
        self.assertFalse(
            contains_targeted_current_pred_dl_v2_claim(
                "After the release gates pass, PRED-DL 2.0 will be publicly "
                "available."
            )
        )
        self.assertFalse(
            contains_targeted_current_pred_dl_v2_claim(
                "O-GlcNAcPRED-DL 1.0 is publicly available. "
                "The public test suite remains available."
            )
        )
        self.assertTrue(
            contains_targeted_prospective_result_claim(
                "PRED-DL 2.0 outperformed v1 by 0.12 AUPRC."
            )
        )
        self.assertTrue(
            contains_targeted_prospective_result_claim(
                "The evaluation found a 0.12 AUPRC gain."
            )
        )
        self.assertFalse(
            contains_targeted_prospective_result_claim(
                "PRED-DL 2.0 remains prospective; the protocol sets a 0.01 "
                "AUPRC improvement threshold."
            )
        )
        self.assertFalse(
            prohibits_terms(
                "Google Analytics is discussed but not prohibited.",
                "use",
                ("Google Analytics",),
            )
        )
        self.assertTrue(
            contains_permissive_tracking_clause(
                "It may use Google Analytics after consent."
            )
        )
        self.assertFalse(
            contains_permissive_tracking_clause(
                "It must not use Google Analytics after consent."
            )
        )
        self.assertFalse(
            prohibits_terms(
                "The resource may use Google Analytics.",
                "use",
                ("Google Analytics",),
            )
        )

    def test_hexnac_public_copy_excludes_migration_and_runtime_jargon(self) -> None:
        forbidden_phrases = (
            "shinyapps.io",
            "original shiny",
            "prediction api",
            "browser worker",
            "static website files",
            "migration",
        )
        for relative_path in GENERATED_HTML:
            if not relative_path.startswith("hexnac-quest/"):
                continue
            with self.subTest(page=relative_path):
                text = (FRONTEND_ROOT / relative_path).read_text().casefold()
                for phrase in forbidden_phrases:
                    self.assertNotIn(phrase, text)

    def test_publication_citations_show_full_authorship_consistently(self) -> None:
        expected_dois = {
            "10.1093/glycob/cwab003",
            "10.1016/j.jmb.2025.169033",
            "10.3390/ijms22179620",
            "10.1021/acs.jproteome.3c00458",
            "10.1021/jasms.2c00172",
            "10.1007/978-1-0716-4007-4_5",
        }
        seen_dois: set[str] = set()
        citations: list[str] = []
        for relative_path in GENERATED_HTML:
            html = (FRONTEND_ROOT / relative_path).read_text()
            citations.extend(
                re.findall(
                    r'<p class="publication-citation">(.*?)</p>',
                    html,
                    re.DOTALL,
                )
            )

        self.assertEqual(len(citations), 6)
        for citation in citations:
            normalized = re.sub(r"\s+", " ", citation).strip()
            self.assertIn("Yaoxiang Li", normalized)
            self.assertNotRegex(
                normalized.casefold(),
                r"\bet al\.|contributed equally|corresponding author",
            )
            self.assertRegex(normalized, r"<em>[^<]+</em>\. 20\d{2};")
            doi_match = re.search(
                r'href="https://doi\.org/([^"]+)">doi:\1</a>\.',
                normalized,
            )
            self.assertIsNotNone(doi_match, normalized)
            seen_dois.add(doi_match.group(1))

        self.assertEqual(seen_dois, expected_dois)

    def test_citations_are_canonical_and_reached_from_every_tool(self) -> None:
        citations_html = (FRONTEND_ROOT / "citations/index.html").read_text()
        self.assertEqual(citations_html.count('class="publication-citation"'), 6)
        for relative_path in (
            "atlas/index.html",
            "ogt-pin/index.html",
            "pred_dl/index.html",
            "hexnac-quest/index.html",
        ):
            with self.subTest(page=relative_path):
                html = (FRONTEND_ROOT / relative_path).read_text()
                self.assertIn('href="/citations/"', html)
                self.assertNotIn('class="publication-citation"', html)

    def test_public_site_exposes_workbench_licenses_and_no_tracking_runtime(self) -> None:
        header = (FRONTEND_ROOT / "analysis/index.html").read_text()
        self.assertIn('class="site-workbench-link"', header)
        self.assertIn('aria-current="page"', header)
        self.assertIn('href="https://junfengmalab.org/"', header)
        licenses = (FRONTEND_ROOT / "licenses/index.html").read_text()
        self.assertIn("Apache License 2.0", licenses)
        self.assertIn("Creative Commons Attribution 4.0", licenses)
        self.assertIn("third-party", licenses.casefold())
        self.assertIn("TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION", (REPOSITORY_ROOT / "LICENSE").read_text())
        self.assertIn("Yaoxiang Li", (REPOSITORY_ROOT / "NOTICE").read_text())
        for relative_path in GENERATED_HTML:
            html = (FRONTEND_ROOT / relative_path).read_text().casefold()
            for forbidden in (
                "cloudflareinsights.com",
                "/cdn-cgi/rum",
                "google-analytics.com",
                "googletagmanager.com",
            ):
                self.assertNotIn(forbidden, html, relative_path)

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

    def test_generated_site_passes_asset_and_route_audits(self) -> None:
        result = subprocess.run(
            [
                sys.executable,
                "-S",
                str(QA_SCRIPT),
                "--audit-assets",
                "--audit-routes",
                str(FRONTEND_ROOT),
            ],
            cwd=REPOSITORY_ROOT,
            text=True,
            capture_output=True,
            check=False,
        )

        self.assertEqual(result.returncode, 0, result.stderr)

    def test_site_quality_workflow_audits_its_own_changes(self) -> None:
        workflow = (
            REPOSITORY_ROOT / ".github/workflows/site-quality.yml"
        ).read_text(encoding="utf-8")

        self.assertGreaterEqual(
            workflow.count('      - ".github/workflows/**"'),
            2,
            "workflow-only pull requests and pushes must trigger site QA",
        )
        self.assertIn("npx playwright install --with-deps", workflow)
        for browser in ("chromium", "firefox", "webkit"):
            self.assertIn(f'"{browser}"', workflow)

    def test_static_smoke_is_portable_and_can_audit_a_selected_checkout(self) -> None:
        smoke = STATIC_SMOKE_SCRIPT.read_text(encoding="utf-8")

        self.assertNotIn("/home/bach/", smoke)
        self.assertIn('"--static-root"', smoke)
        self.assertIn("atlas-release-v1.json", smoke)
        self.assertIn("atlas-sequences-v1.json", smoke)

    def test_static_smoke_srcset_parser_handles_missing_and_multiple_values(self) -> None:
        parser = SmokeLinkParser()
        parser.feed(
            '<img src="/static/img/one.png">'
            '<source srcset="/static/img/one.png 1x, /static/img/two.png 2x">'
        )

        self.assertEqual(
            parser.urls,
            [
                "/static/img/one.png",
                "/static/img/one.png",
                "/static/img/two.png",
            ],
        )

    def test_static_smoke_rejects_a_missing_checkout_before_network_requests(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as fixture_directory:
            missing = Path(fixture_directory) / "missing"
            result = subprocess.run(
                [
                    sys.executable,
                    str(STATIC_SMOKE_SCRIPT),
                    "--base-url",
                    "https://invalid.example",
                    "--static-root",
                    str(missing),
                ],
                cwd=REPOSITORY_ROOT,
                text=True,
                capture_output=True,
                check=False,
            )

        self.assertEqual(result.returncode, 2)
        self.assertIn("static root is not a generated site", result.stderr)

    def test_asset_audit_resolves_document_relative_srcset_and_css_urls(self) -> None:
        with tempfile.TemporaryDirectory() as fixture_directory:
            fixture_root = Path(fixture_directory)
            (fixture_root / "nested").mkdir()
            (fixture_root / "static" / "img").mkdir(parents=True)
            (fixture_root / "static" / "css").mkdir(parents=True)
            fixture_root.joinpath("nested", "index.html").write_text(
                """<!doctype html>
<html><head><link rel="stylesheet" href="../static/css/site.css"></head>
<body><img src="../static/img/one.png?version=1"
srcset="../static/img/one.png 1x, ../static/img/two.png 2x"></body></html>
"""
            )
            fixture_root.joinpath("static", "css", "site.css").write_text(
                '.hero { background-image: url("../img/two.png#hero"); }\n'
            )
            fixture_root.joinpath("static", "img", "one.png").write_bytes(b"one")
            fixture_root.joinpath("static", "img", "two.png").write_bytes(b"two")

            result = subprocess.run(
                [
                    sys.executable,
                    "-S",
                    str(QA_SCRIPT),
                    "--audit-assets",
                    fixture_directory,
                ],
                cwd=REPOSITORY_ROOT,
                text=True,
                capture_output=True,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)

    def test_asset_audit_rejects_missing_and_orphaned_public_code_or_media(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as fixture_directory:
            fixture_root = Path(fixture_directory)
            (fixture_root / "static" / "js").mkdir(parents=True)
            (fixture_root / "static" / "img").mkdir(parents=True)
            fixture_root.joinpath("index.html").write_text(
                """<!doctype html><html><body>
<script src="/static/js/missing.js"></script>
</body></html>
"""
            )
            fixture_root.joinpath("static", "img", "orphan.png").write_bytes(
                b"orphan"
            )

            result = subprocess.run(
                [
                    sys.executable,
                    "-S",
                    str(QA_SCRIPT),
                    "--audit-assets",
                    fixture_directory,
                ],
                cwd=REPOSITORY_ROOT,
                text=True,
                capture_output=True,
                check=False,
            )

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("missing local asset: static/js/missing.js", result.stderr)
            self.assertIn("orphaned public asset: static/img/orphan.png", result.stderr)

    def test_route_audit_rejects_configured_pages_missing_from_output(self) -> None:
        with tempfile.TemporaryDirectory() as fixture_directory:
            fixture_root = Path(fixture_directory)
            fixture_root.joinpath("index.html").write_text("<!doctype html>")
            config = fixture_root / "routes.json"
            config.write_text(
                '{"pages": ['
                '{"route": "/", "output": "index.html"},'
                '{"route": "/missing/", "output": "missing/index.html"}'
                "]}\n"
            )

            result = subprocess.run(
                [
                    sys.executable,
                    "-S",
                    str(QA_SCRIPT),
                    "--audit-routes",
                    "--site-config",
                    str(config),
                    fixture_directory,
                ],
                cwd=REPOSITORY_ROOT,
                text=True,
                capture_output=True,
                check=False,
            )

            self.assertNotEqual(result.returncode, 0)
            self.assertIn(
                "/missing/: configured output missing/index.html does not exist",
                result.stderr,
            )

    def test_deploy_and_rollback_use_disposable_checkouts(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            seed = root / "seed"
            remote = root / "pages.git"
            checkout = root / "verification"
            seed.mkdir()
            subprocess.run(
                ["git", "init"],
                cwd=seed,
                check=True,
                capture_output=True,
            )
            seed.joinpath("legacy.txt").write_text("generated deployment fixture\n")
            subprocess.run(["git", "add", "."], cwd=seed, check=True)
            git_environment = os.environ.copy()
            git_environment.update(
                {
                    "GIT_AUTHOR_NAME": "Site QA",
                    "GIT_AUTHOR_EMAIL": "site-qa@example.invalid",
                    "GIT_COMMITTER_NAME": "Site QA",
                    "GIT_COMMITTER_EMAIL": "site-qa@example.invalid",
                    "DEPLOY_GIT_NAME": "Yaoxiang Li",
                    "DEPLOY_GIT_EMAIL": "liyaoxiang@outlook.com",
                    "SKIP_SOURCE_STATE_CHECK": "1",
                    "DEPLOY_REPOSITORY_URL": str(remote),
                }
            )
            subprocess.run(
                ["git", "commit", "-m", "Seed deployment"],
                cwd=seed,
                env=git_environment,
                check=True,
                capture_output=True,
            )
            subprocess.run(
                ["git", "branch", "-M", "master"],
                cwd=seed,
                check=True,
                capture_output=True,
            )
            subprocess.run(
                ["git", "clone", "--bare", str(seed), str(remote)],
                check=True,
                capture_output=True,
            )

            deploy_result = subprocess.run(
                [str(REPOSITORY_ROOT / "scripts" / "deploy-frontend.sh")],
                cwd=REPOSITORY_ROOT,
                env=git_environment,
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(deploy_result.returncode, 0, deploy_result.stderr)
            subprocess.run(
                ["git", "clone", str(remote), str(checkout)],
                check=True,
                capture_output=True,
            )
            self.assertTrue((checkout / "index.html").is_file())
            self.assertTrue((checkout / "static/data/atlas-records.json").is_file())
            self.assertFalse((checkout / "legacy.txt").exists())
            deployed_commit = subprocess.run(
                ["git", "rev-parse", "HEAD"],
                cwd=checkout,
                text=True,
                capture_output=True,
                check=True,
            ).stdout.strip()
            deployment_message = subprocess.run(
                ["git", "log", "-1", "--format=%B"],
                cwd=checkout,
                text=True,
                capture_output=True,
                check=True,
            ).stdout
            self.assertIn("Source-Commit:", deployment_message)

            rollback_result = subprocess.run(
                [
                    str(REPOSITORY_ROOT / "scripts" / "rollback-frontend.sh"),
                    deployed_commit,
                ],
                cwd=REPOSITORY_ROOT,
                env=git_environment,
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(rollback_result.returncode, 0, rollback_result.stderr)


if __name__ == "__main__":
    unittest.main()

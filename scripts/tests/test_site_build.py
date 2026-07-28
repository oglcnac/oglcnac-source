from __future__ import annotations

import hashlib
import os
import re
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

GENERATED_OUTPUTS = GENERATED_HTML + ("static/css/app.css",)

# This migration must not rewrite page-specific main content. These hashes were
# captured before introducing the shared build-time shell.
MAIN_CONTENT_SHA256 = {
    "atlas/browse/index.html": "c7a90e9ee25c894f0c925951359dac77f87fae4565bcee536b4d675bc92cb0af",
    "atlas/contact/index.html": "7767eb7b4af33e63e5dd1102b7d325ef13db14ad36aa2972b514e7d6e4360ec7",
    "atlas/detail/index.html": "c14f132cb81ae0a652dcccc844ba246251f35e55c24733a5b02b1212a5b1e1a3",
    "atlas/download/index.html": "45cbde8ed03ea67b1054d76db845b0384744f3f3b7d6a0b575ce0987365d9a15",
    "atlas/index.html": "42ff84611076a67442876e684d131d7f1731a079aa4f59627adf28cf70c10df1",
    "atlas/search/index.html": "45a5e36654321bdc56394fd24bf7d316df8443c5737f13115cdebdad9f0de757",
    "atlas/statistics/index.html": "019a78a074c397c9d6dda928ba59ce356106093453b28582747962e55e03cb68",
    "atlas/tutorial/index.html": "e0b81270f58fd98ae9ea530096743cbe68040e8b51ddbd0892d7b61b068210ff",
    "hexnac-quest/analysis/index.html": "878bd8b0c33684df6d6decd3b2b7aea2dd3cee90b42e810c69aa4468329b476f",
    "hexnac-quest/contact/index.html": "37bd7e06e1ff38eb70365448719d447a9a57a0a8a03847b8f72b95db2f03d94b",
    "hexnac-quest/index.html": "296e7e78397d36abad74f702d0ec0a034a657d1bc926bd28ede6e8c74b9474cd",
    "hexnac-quest/tutorial/index.html": "238ef5fcf062498911cf09ca88da629ac45b5b8255dd5d58f9b3483e871f5286",
    "index.html": "ed5ca1ba64888731d777d63b8fc5ba0cb896369c70fb7b119da03a4a6f0eed13",
    "ogt-pin/contact/index.html": "7767eb7b4af33e63e5dd1102b7d325ef13db14ad36aa2972b514e7d6e4360ec7",
    "ogt-pin/detail/index.html": "321c3cfd2d81c0aa83c56b138c8a6b26dc6cbdca8415d4fceb641071a18c5993",
    "ogt-pin/index.html": "183fda32052bc91ad864a4886a9623912efe6459a881a2c4e921d2304b5ff71e",
    "ogt-pin/search/index.html": "5f9074eec7ab40f11d542e19ea68a6e1493a4682646cd09914a56ae9a5ea347b",
    "ogt-pin/statistics/index.html": "b936b0bf5f94604855c11f29501b01038459bc645062831966d1241ec67e7a22",
    "ogt-pin/tutorial/index.html": "ff9faf4f89a6f5156398d0834a5c7402821ffda889e51e984e834303ca935d68",
    "pred_dl/contact/index.html": "75947207c0ded29b97f4dafb5098f4e6a6f286e6d4bb41af73567b652029ebbc",
    "pred_dl/download/index.html": "cf76be6612de49fbc1590205f3d0e6f32a8e334fde48dd50bbe446c04ad726c0",
    "pred_dl/index.html": "7d6dbf352a21a7b65a7a6f0e67fd217cbdef6d3240c91e68b72843fe55f0d5af",
    "pred_dl/input_fasta/index.html": "51a9d5449dd769bd2ed197b955b5ea2653ff8fd93773a99f841d2ba0a94c37b7",
    "pred_dl/tutorial/index.html": "3f63bb326c186dc8b6e4520b287c7ffa555b88f6de338ddd24240d1ccd5595bb",
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
            if relative_path == "404.html":
                continue
            with self.subTest(page=relative_path):
                parser = DocumentParser()
                parser.feed((FRONTEND_ROOT / relative_path).read_text())
                html = parser.tags("html")
                self.assertEqual(html[0].get("lang"), "en")
                self.assertTrue("".join(parser.title_parts).strip())
                self.assertEqual(len(parser.tags("main")), 1)
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

    def test_page_specific_main_content_is_unchanged(self) -> None:
        for relative_path, expected_hash in MAIN_CONTENT_SHA256.items():
            html = (FRONTEND_ROOT / relative_path).read_text()
            match = re.search(r"<main\b[^>]*>(.*)</main>", html, re.DOTALL | re.IGNORECASE)
            self.assertIsNotNone(match, relative_path)
            actual_hash = hashlib.sha256(match.group(1).encode()).hexdigest()
            self.assertEqual(actual_hash, expected_hash, relative_path)

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


if __name__ == "__main__":
    unittest.main()

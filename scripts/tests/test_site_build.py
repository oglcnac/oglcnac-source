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
    "atlas/browse/index.html": "069eeabe697b5cb087c924bfa5247268d3a454949f2bb5873cf224c985061024",
    "atlas/contact/index.html": "0795bb3f860da3b64b0e8675d00b31ebc1aa41e25fe470552429747b2b505dc2",
    "atlas/detail/index.html": "e7b2f31c5db4650498c77feb530fd57b393b00935284317619f109850fff1a18",
    "atlas/download/index.html": "5dc0f2d980738860c8d3dbddab449da47a47be830bd407d29f49c0383850534f",
    "atlas/index.html": "0600b76429d35ebe86ba8534d521f42ad1f8514174d4fc52500ed3414c0ba3d6",
    "atlas/search/index.html": "77c0ee8f7fac0333f9d5eff983438081f6f7187cb41f4c5527c088b86a9d519e",
    "atlas/statistics/index.html": "daef42eaf2f3e60c14d895665123c53ab94aabcbd10a4bcd4f71699e48b93854",
    "atlas/tutorial/index.html": "1bfb7b2a9965537a0cff99938a0fa89b20bbff09496b77f48f330c86c98dd138",
    "hexnac-quest/analysis/index.html": "664598fdcbc374e58f4290049203ea6dd678fca3bfacd24f4062a516841183e0",
    "hexnac-quest/contact/index.html": "79e17731540b8dd4977acd96bd83a6c7af014c04901f43b03420d32cb1dbbd09",
    "hexnac-quest/index.html": "7ce09e0f481ee685f0ceb269935c59262c3de8eab58f0d04b5cad30e3572be9a",
    "hexnac-quest/tutorial/index.html": "1d26a9c03829400500798aa468a1da365f52cb679b8fdec24bd94e9070563043",
    "index.html": "232f94c9ccef8bb70ee43818b0d117b24be53b1977010010810b9c342191fa75",
    "ogt-pin/contact/index.html": "0795bb3f860da3b64b0e8675d00b31ebc1aa41e25fe470552429747b2b505dc2",
    "ogt-pin/detail/index.html": "8fe1a13b5914796296c16f5e848890a151bec988f48e4f9c7f35d8ecb47bf05a",
    "ogt-pin/index.html": "1117c1e0aa1b9cbb626fc521d8023d791ddd5c3cef761c87261fe7f2ebf0125e",
    "ogt-pin/search/index.html": "3cda35116bad0509de0f85106d5cce8c338fb7ecf6a596268f091c3a8096553b",
    "ogt-pin/statistics/index.html": "fb41d76553cdea5e03cc71d87a3d118799a07765c5e42dc27f058838e5b64ab2",
    "ogt-pin/tutorial/index.html": "8f7fec2e778f4c24194432e95b3af690b98883f898196becae05225e61c2c7f0",
    "pred_dl/contact/index.html": "bc5c818bd90292a3369b36511c6fe1b7c427a4fb89fc3e0ff89b66bbbf41a1fe",
    "pred_dl/download/index.html": "9251f122223bf8da1c3b50d815c0b70caaaf8ca35781bf54042651939810d271",
    "pred_dl/index.html": "28def70798f252853aba6490a1fe0ab71171ee2532b85e3634c8f9dd07516694",
    "pred_dl/input_fasta/index.html": "f03e00c68404b2ce9fe2fea4d1806fe270487006afac4e6211be6e38faf840ac",
    "pred_dl/tutorial/index.html": "af74a273b5e3f16a778d6d01d5d3fc99637047a9153ec22dc01173f71e7af45d",
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

    def test_page_specific_main_content_is_unchanged(self) -> None:
        for relative_path, expected_hash in MAIN_CONTENT_SHA256.items():
            html = (FRONTEND_ROOT / relative_path).read_text()
            match = re.search(r"<main\b[^>]*>(.*)</main>", html, re.DOTALL | re.IGNORECASE)
            self.assertIsNotNone(match, relative_path)
            normalized_content = "\n".join(
                line.rstrip() for line in match.group(1).splitlines()
            ).strip()
            actual_hash = hashlib.sha256(normalized_content.encode()).hexdigest()
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

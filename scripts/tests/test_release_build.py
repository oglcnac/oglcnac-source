from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from xml.etree import ElementTree

from scripts.build_site import BuildError, generated_files, revisioned_assets, write_outputs
from scripts.check_site import internal_link_findings, public_scope_findings, route_findings


ROOT = Path(__file__).resolve().parents[2]


class HeadParser(HTMLParser):
    def __init__(self, text: str):
        super().__init__()
        self.meta = {}
        self.links = {}
        self.scripts = []
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == "meta":
            self.meta[attributes.get("name", attributes.get("property"))] = attributes.get("content")
        if tag == "link":
            self.links[attributes.get("rel")] = attributes.get("href")
        if tag == "script" and attributes.get("src"):
            self.scripts.append(attributes["src"])


class AssetRevisionTests(unittest.TestCase):
    def test_dependency_changes_invalidate_the_worker_and_page_without_mutating_inputs(self):
        source = {
            "static/js/core.js": b"self.version = 1;",
            "static/js/worker.js": b'importScripts("/static/js/core.js?v=manual");',
            "static/js/ui.js": b'new Worker("/static/js/worker.js");',
            "index.html": b'<script src="/static/js/ui.js"></script>',
        }
        first = revisioned_assets(source)
        self.assertEqual(first, revisioned_assets(source))
        for parent, child in [("index.html", "static/js/ui.js"), ("static/js/ui.js", "static/js/worker.js"), ("static/js/worker.js", "static/js/core.js")]:
            revision = hashlib.sha256(first[child]).hexdigest()[:16]
            self.assertIn(f"/{child}?v={revision}".encode(), first[parent])
        self.assertIn(b"?v=manual", source["static/js/worker.js"])
        changed = revisioned_assets({**source, "static/js/core.js": b"self.version = 2;"})
        for asset in source:
            self.assertNotEqual(first[asset], changed[asset], asset)

    def test_css_media_and_html_queries_keep_fragments_and_use_emitted_bytes(self):
        files = revisioned_assets({
            "static/img/test.svg": b"<svg/>",
            "static/css/app.css": b'body{background:url("../img/test.svg#figure");filter:url(#local-filter)}',
            "index.html": b'<link rel="stylesheet" href="/static/css/app.css?theme=light&amp;v=old#top">',
            "guide/index.html": b'<script src="../static/js/ui.js"></script>',
            "static/js/ui.js": b"void 0;",
        })
        image_hash = hashlib.sha256(files["static/img/test.svg"]).hexdigest()[:16]
        self.assertIn(f"../img/test.svg?v={image_hash}#figure".encode(), files["static/css/app.css"])
        self.assertIn(b"url(#local-filter)", files["static/css/app.css"])
        css_url = HeadParser(files["index.html"].decode()).links["stylesheet"]
        self.assertEqual(parse_qs(urlsplit(css_url).query), {"theme": ["light"], "v": [hashlib.sha256(files["static/css/app.css"]).hexdigest()[:16]]})
        self.assertEqual(urlsplit(css_url).fragment, "top")
        relative_script = HeadParser(files["guide/index.html"].decode()).scripts[0]
        self.assertEqual(urlsplit(relative_script).path, "../static/js/ui.js")
        self.assertEqual(parse_qs(urlsplit(relative_script).query)["v"], [hashlib.sha256(files["static/js/ui.js"]).hexdigest()[:16]])

    def test_cycles_fail_explicitly_instead_of_producing_recursive_hashes(self):
        with self.assertRaisesRegex(BuildError, "Cyclic static asset references"):
            revisioned_assets({
                "static/js/one.js": b'importScripts("/static/js/two.js");',
                "static/js/two.js": b'importScripts("/static/js/one.js");',
            })


class PublicReleaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.public = generated_files(ROOT / "site", ROOT / "public", public_only=True)
        cls.preview = generated_files(ROOT / "site", ROOT / "public")

    def test_public_build_excludes_every_research_payload_but_default_build_retains_it(self):
        # A synthetic preview protects the release boundary without depending on
        # unpublished research source or datasets in a developer's working tree.
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "site"
            public_root = root / "public"
            files = {
                "styles/base.css": "body { color: black; }",
                "styles/60-functional.css": ".functional-hero { color: purple; }",
                "pages/index.content.html": "<h1>Public fixture</h1>",
                "pages/research/functional/index.content.html": "<h1>Preview fixture</h1>",
            }
            for name in ("layout", "header", "footer"):
                files[f"templates/{name}.html"] = (ROOT / f"site/templates/{name}.html").read_text()
            for relative, content in files.items():
                target = source / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(content)
            configuration = {
                "styles": ["styles/base.css", "styles/60-functional.css"],
                "primary_navigation": [["Home", "/", "home"]],
                "sections": {"home": [], "research": []},
                "pages": [
                    {"output": output, "route": route, "title": "Fixture", "description": "Fixture", "section": section, "body_class": "fixture", "main_class": "fixture"}
                    for output, route, section in [
                        ("index.html", "/", "home"),
                        ("research/functional/index.html", "/research/functional/", "research"),
                    ]
                ],
            }
            (source / "site.json").write_text(json.dumps(configuration))
            for relative in ("static/js/functional-core.js", "static/js/functional-ui.js", "static/functional/fixture.json"):
                target = public_root / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text("{}")
            public = generated_files(source, public_root, public_only=True)
            preview = generated_files(source, public_root)
            for relative in ("research/functional/index.html", "static/js/functional-core.js", "static/js/functional-ui.js", "static/functional/fixture.json"):
                self.assertIn(relative, preview)
                self.assertNotIn(relative, public)
            self.assertNotIn(b".functional-hero", public["static/css/app.css"])
            self.assertIn(b".functional-hero", preview["static/css/app.css"])
            self.assertEqual(json.loads(public["static/.site-build-assets.json"])["scope"], "public")
            self.assertEqual(json.loads(preview["static/.site-build-assets.json"])["scope"], "preview")
            self.assertIn("noindex", HeadParser(preview["research/functional/index.html"].decode()).meta["robots"])

    def test_sitemap_excludes_empty_search_detail_and_preview_routes(self):
        document = ElementTree.fromstring(self.public["sitemap.xml"])
        urls = {node.text for node in document.findall("{*}url/{*}loc")}
        self.assertIn("https://oglcnac.org/", urls)
        self.assertIn("https://oglcnac.org/analysis/", urls)
        for route in ("404", "atlas/search", "atlas/detail", "ogt-pin/search", "ogt-pin/detail", "research/functional"):
            self.assertNotIn(f"https://oglcnac.org/{route}/", urls)
        self.assertEqual(self.public["sitemap.xml"], self.preview["sitemap.xml"])
        self.assertIn(b"Sitemap: https://oglcnac.org/sitemap.xml", self.public["robots.txt"])

    def test_shell_metadata_uses_reachable_revisioned_identity_and_page_urls(self):
        for relative, content in self.public.items():
            if not relative.endswith(".html"):
                continue
            head = HeadParser(content.decode())
            self.assertTrue(head.meta["og:title"])
            self.assertEqual(head.meta["og:url"], head.links["canonical"])
            self.assertEqual(head.meta["og:description"], head.meta["description"])
            self.assertEqual(head.meta["twitter:card"], "summary_large_image")
            for url in [head.links["icon"], head.links["stylesheet"], head.meta["og:image"], *head.scripts]:
                parsed = urlsplit(url)
                target = parsed.path.lstrip("/")
                self.assertIn(target, self.public)
                self.assertEqual(parse_qs(parsed.query)["v"], [hashlib.sha256(self.public[target]).hexdigest()[:16]])
            if relative in {"404.html", "atlas/detail/index.html", "ogt-pin/detail/index.html", "atlas/search/index.html", "ogt-pin/search/index.html"}:
                self.assertIn("noindex", head.meta["robots"])
        self.assertTrue(self.public["static/img/social-card.png"].startswith(b"\x89PNG\r\n\x1a\n"))

    def test_public_route_audit_checks_subset_and_rejects_preview_leakage(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_outputs(root, self.public)
            self.assertEqual(route_findings(root, ROOT / "site/site.json", public_only=True), [])
            self.assertEqual(public_scope_findings(root), [])
            self.assertEqual(internal_link_findings(root), [])
            preview = root / "static/js/functional-ui.js"
            preview.write_text("preview")
            self.assertTrue(public_scope_findings(root))


class InternalLinkTests(unittest.TestCase):
    def test_extensionless_same_page_cross_page_and_svg_fragments_are_checked(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "guide").mkdir()
            (root / "index.html").write_text('<main id="main"></main><a href="#main">Skip</a><a href="/guide?mode=one#section">Guide</a><a href="/figure.svg#node">Figure</a><a href="https://example.org/unknown#other">External</a>')
            (root / "guide/index.html").write_text('<h1 id="section">Guide</h1><a href="../#main">Home</a>')
            (root / "figure.svg").write_text('<svg><g id="node"/></svg>')
            self.assertEqual(internal_link_findings(root), [])
            with (root / "index.html").open("a") as stream:
                stream.write('<a href="#missing">Missing here</a><a href="/guide#absent">Missing there</a><a href="/nonexistent?query=yes">Missing route</a><a href="/figure.svg#unknown">Missing figure part</a>')
            findings = internal_link_findings(root)
            self.assertEqual(len(findings), 4)
            self.assertTrue(any("#missing" in finding for finding in findings))
            self.assertTrue(any("/nonexistent?query=yes" in finding for finding in findings))
            self.assertTrue(any("/figure.svg#unknown" in finding for finding in findings))


if __name__ == "__main__":
    unittest.main()

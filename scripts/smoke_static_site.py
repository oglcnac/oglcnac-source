#!/usr/bin/env python3
import argparse
import hashlib
import json
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urldefrag, urljoin, urlsplit
from urllib.request import Request, urlopen


DEFAULT_BASE_URL = "https://oglcnac.org"
STATIC_ROOT = Path("/home/bach/oglcnac-static-site")


class LinkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        for key in ("href", "src", "action"):
            value = values.get(key)
            if value and value != "#" and not value.startswith(("mailto:", "tel:")):
                self.urls.append(value)


def request(url, method="GET", data=None, content_type=None, timeout=60):
    headers = {"User-Agent": "oglcnac-static-smoke/1.0"}
    if content_type:
        headers["Content-Type"] = content_type
    req = Request(url, data=data, method=method, headers=headers)
    with urlopen(req, timeout=timeout) as response:
        return response.status, response.read()


def discover_internal_urls(base_url):
    base_host = urlsplit(base_url).netloc
    urls = {"/"}
    for file in STATIC_ROOT.glob("**/index.html"):
        if "/static/" in str(file):
            continue
        parser = LinkParser()
        parser.feed(file.read_text(errors="ignore"))
        for raw in parser.urls:
            full, _ = urldefrag(urljoin(base_url + "/", raw))
            split = urlsplit(full)
            if split.netloc == base_host and not split.path.startswith("/api/"):
                urls.add(split.path + (f"?{split.query}" if split.query else ""))
    urls.update(
        [
            "/atlas/detail/?id=P18583",
            "/ogt-pin/detail/?id=Q9H1M0",
            "/hexnac-quest/",
            "/hexnac-quest/analysis/",
            "/hexnac-quest/tutorial/",
            "/hexnac-quest/contact/",
        ]
    )
    return sorted(urls)


def check_url(base_url, path, failures, expected_sha256=None):
    url = base_url.rstrip("/") + path
    try:
        status, body = request(url)
        print(f"{status} {len(body):>8} {path}")
        if status != 200:
            failures.append(f"{path}: HTTP {status}")
        if expected_sha256:
            actual_sha256 = hashlib.sha256(body).hexdigest()
            if actual_sha256 != expected_sha256:
                failures.append(
                    f"{path}: SHA-256 {actual_sha256} != {expected_sha256}"
                )
    except HTTPError as exc:
        print(f"{exc.code} {'':>8} {path}")
        failures.append(f"{path}: HTTP {exc.code}")
    except Exception as exc:
        print(f"ERR {'':>8} {path} {exc}")
        failures.append(f"{path}: {exc}")


def main():
    parser = argparse.ArgumentParser(description="Smoke-test the static O-GlcNAcDB website.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    args = parser.parse_args()
    base_url = args.base_url.rstrip("/")
    failures = []

    print("PAGES AND ASSETS")
    for path in discover_internal_urls(base_url):
        check_url(base_url, path, failures)

    print("\nSTATIC DATA AND PREDICTION ASSETS")
    static_paths = [
        "/static/data/atlas-records.json",
        "/static/data/ogt-pin-records.json",
        "/static/hexnac-quest/example_input_data.csv",
        "/static/hexnac-quest/vendor/papaparse.min.js",
        "/static/hexnac-quest/v1/model.json",
        "/static/js/hexnac-quest-core.js",
        "/static/js/hexnac-quest-ui.js",
        "/static/js/hexnac-quest-worker.js",
        "/static/js/prediction-core.js",
        "/static/js/prediction-ui.js",
        "/static/js/prediction-worker.js",
        "/static/prediction/vendor/tfjs-2.8.5/tf.min.js",
        "/static/prediction/vendor/tfjs-2.8.5/tf-backend-wasm.min.js",
        "/static/prediction/vendor/tfjs-2.8.5/tfjs-backend-wasm.wasm",
        "/static/prediction/v1/manifest.json",
    ]
    for path in static_paths:
        check_url(base_url, path, failures)

    try:
        _, hexnac_manifest_body = request(
            base_url + "/static/hexnac-quest/v1/model.json"
        )
        hexnac_manifest = json.loads(hexnac_manifest_body)
        check_url(
            base_url,
            "/static/hexnac-quest/example_input_data.csv",
            failures,
            expected_sha256=hexnac_manifest["provenance"][
                "canonical_example_sha256"
            ],
        )
    except Exception as exc:
        failures.append(f"HexNAcQuest manifest: {exc}")

    try:
        _, manifest_body = request(base_url + "/static/prediction/v1/manifest.json")
        manifest = json.loads(manifest_body)
        prediction_paths = {
            manifest["features"]["aaindex"]: manifest["features"]["aaindex_sha256"],
        }
        for species in manifest["species"].values():
            word2vec = species["word2vec"]
            prediction_paths[word2vec["metadata"]] = word2vec["metadata_sha256"]
            prediction_paths[word2vec["vectors"]] = word2vec["vectors_sha256"]
            for model in species["models"]:
                model_directory = str(Path(model["model"]).parent)
                for filename, checksum in model["asset_sha256"].items():
                    prediction_paths[f"{model_directory}/{filename}"] = checksum
        for path, checksum in sorted(prediction_paths.items()):
            check_url(
                base_url,
                f"/static/prediction/v1/{path}",
                failures,
                expected_sha256=checksum,
            )
    except Exception as exc:
        failures.append(f"prediction manifest: {exc}")

    if failures:
        print("\nFAIL")
        for failure in failures:
            print(f"- {failure}")
        raise SystemExit(1)
    print("\nPASS")


if __name__ == "__main__":
    main()

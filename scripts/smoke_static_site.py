#!/usr/bin/env python3
import argparse
import json
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urldefrag, urljoin, urlsplit
from urllib.request import Request, urlopen


DEFAULT_BASE_URL = "https://oglcnac.org"
DEFAULT_PREDICTION_URL = "https://api.oglcnac.org/api/v1/predict"
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
    urls.update(["/atlas/detail/?id=P18583", "/ogt-pin/detail/?id=Q9H1M0"])
    return sorted(urls)


def check_url(base_url, path, failures):
    url = base_url.rstrip("/") + path
    try:
        status, body = request(url)
        print(f"{status} {len(body):>8} {path}")
        if status != 200:
            failures.append(f"{path}: HTTP {status}")
    except HTTPError as exc:
        print(f"{exc.code} {'':>8} {path}")
        failures.append(f"{path}: HTTP {exc.code}")
    except Exception as exc:
        print(f"ERR {'':>8} {path} {exc}")
        failures.append(f"{path}: {exc}")


def main():
    parser = argparse.ArgumentParser(description="Smoke-test the static O-GlcNAcDB website.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--prediction-url", default=DEFAULT_PREDICTION_URL)
    args = parser.parse_args()
    base_url = args.base_url.rstrip("/")
    failures = []

    print("PAGES AND ASSETS")
    for path in discover_internal_urls(base_url):
        check_url(base_url, path, failures)

    print("\nAPI")
    api_paths = [
        "/static/data/atlas-records.json",
        "/static/data/ogt-pin-records.json",
    ]
    for path in api_paths:
        check_url(base_url, path, failures)

    payload = json.dumps(
        {"species": "human", "fasta": ">SEQ1\nAAAAAAAAAAAAAASAAAAAAAAAAAAAA"}
    ).encode("utf-8")
    try:
        status, body = request(
            args.prediction_url,
            method="POST",
            data=payload,
            content_type="application/json",
            timeout=120,
        )
        print(f"{status} {len(body):>8} prediction")
        if status != 200:
            failures.append(f"{args.prediction_url}: HTTP {status}")
    except Exception as exc:
        print(f"ERR {'':>8} {args.prediction_url} {exc}")
        failures.append(f"{args.prediction_url}: {exc}")

    if failures:
        print("\nFAIL")
        for failure in failures:
            print(f"- {failure}")
        raise SystemExit(1)
    print("\nPASS")


if __name__ == "__main__":
    main()

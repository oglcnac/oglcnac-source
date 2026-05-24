#!/usr/bin/env python3
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
import os
import sys


UPSTREAM = os.environ.get("OGLCNAC_PREDICTION_ORIGIN", "http://127.0.0.1:8010").rstrip("/")
HOST = os.environ.get("OGLCNAC_API_PROXY_HOST", "0.0.0.0")
PORT = int(os.environ.get("OGLCNAC_API_PROXY_PORT", "80"))
TIMEOUT = float(os.environ.get("OGLCNAC_API_PROXY_TIMEOUT", "1000"))
ALLOWED_HOSTS = {
    host.strip().lower()
    for host in os.environ.get("OGLCNAC_API_PROXY_ALLOWED_HOSTS", "api.oglcnac.org").split(",")
    if host.strip()
}
HOP_BY_HOP = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
}


class Handler(BaseHTTPRequestHandler):
    server_version = "OGlcNAcPredictionProxy/1.0"

    def do_GET(self):
        self._proxy()

    def do_HEAD(self):
        self._proxy(head=True)

    def do_POST(self):
        self._proxy(with_body=True)

    def do_OPTIONS(self):
        self._proxy()

    def _proxy(self, head=False, with_body=False):
        host = self.headers.get("Host", "").split(":", 1)[0].lower()
        if ALLOWED_HOSTS and host not in ALLOWED_HOSTS:
            self.send_response(404)
            self._default_headers()
            self.end_headers()
            if not head:
                self.wfile.write(b"Static site is hosted by GitHub Pages. Use api.oglcnac.org for API calls.\n")
            return

        split = urlsplit(self.path)
        path = split.path
        if path.startswith("/api/"):
            target = UPSTREAM + "/api/" + path[len("/api/") :]
        else:
            target = UPSTREAM + path
        if split.query:
            target += "?" + split.query

        body = None
        if with_body:
            length = int(self.headers.get("Content-Length", "0") or "0")
            body = self.rfile.read(length) if length else None

        headers = {}
        for key in (
            "Accept",
            "Content-Type",
            "Authorization",
            "Origin",
            "Access-Control-Request-Method",
            "Access-Control-Request-Headers",
        ):
            if key in self.headers:
                headers[key] = self.headers[key]

        request = Request(target, data=body, headers=headers, method="HEAD" if head else self.command)
        try:
            with urlopen(request, timeout=TIMEOUT) as response:
                self.send_response(response.status)
                self._default_headers()
                self._copy_headers(response.headers)
                self.end_headers()
                if not head:
                    self.wfile.write(response.read())
        except HTTPError as exc:
            self.send_response(exc.code)
            self._default_headers()
            self._copy_headers(exc.headers)
            self.end_headers()
            if not head:
                self.wfile.write(exc.read())
        except URLError as exc:
            self.send_error(502, f"Prediction upstream unavailable: {exc.reason}")

    def _copy_headers(self, headers):
        for key, value in headers.items():
            if key.lower() not in HOP_BY_HOP:
                self.send_header(key, value)

    def _default_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")


def main():
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Proxying api.oglcnac.org on http://{HOST}:{PORT} to {UPSTREAM}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)

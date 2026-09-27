"""SBE GUI server: serves doc-reader/ + saves edited timelines.
Usage: python tools/serve_gui.py [--port 8000]
POST /api/save-timeline {"file": "6-6-26-....timeline.json", "data": {...}}
Writes into doc-reader/reports/. Local-only.
"""
import json
import re
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
DOCROOT = ROOT / "doc-reader"
REPORTS = DOCROOT / "reports"
SAFE = re.compile(r"^[a-z0-9][a-z0-9._-]*\.timeline\.json$", re.I)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(DOCROOT), **kw)

    def log_message(self, *a):
        pass

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if urlparse(self.path).path != "/api/save-timeline":
            return self._json(404, {"ok": False, "error": "unknown endpoint"})
        try:
            n = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(n) or b"{}")
            fname = payload.get("file", "")
            data = payload.get("data")
            if not SAFE.match(fname):
                return self._json(400, {"ok": False, "error": "bad filename"})
            if not isinstance(data, dict) or not isinstance(data.get("days"), list):
                return self._json(400, {"ok": False, "error": "bad timeline data"})
            REPORTS.mkdir(parents=True, exist_ok=True)
            (REPORTS / fname).write_text(json.dumps(data, indent=2), encoding="utf-8")
            return self._json(200, {"ok": True, "file": fname})
        except Exception as e:  # noqa: BLE001
            return self._json(500, {"ok": False, "error": str(e)})


def main():
    port = 8000
    for i, a in enumerate(sys.argv):
        if a == "--port" and i + 1 < len(sys.argv):
            port = int(sys.argv[i + 1])
    srv = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"SBE Event Manager at http://localhost:{port} (serving {DOCROOT})")
    print("Save endpoint: POST /api/save-timeline -> doc-reader/reports/")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()

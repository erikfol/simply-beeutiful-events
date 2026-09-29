"""Stamp one release version on docs/index.html so browsers fetch fresh copies of every file.

GitHub Pages lets browsers cache files for ~10 minutes. Without this, a browser can mix a new
index.html with old copies of the JavaScript modules. The import map sends every module import
(`./js/x.js`) to `./js/x.js?v=<version>`, and the stylesheet and entry script get the same version.

Usage (from the repo root, before committing app changes):
    python tools/stamp_release.py            # version = current date and time
    python tools/stamp_release.py 20261001a  # explicit version
"""
import json
import re
import sys
from datetime import datetime
from pathlib import Path

DOCS = Path(__file__).resolve().parent.parent / "docs"
START, END = "<!-- release-importmap:start -->", "<!-- release-importmap:end -->"


def stamp(version: str) -> None:
    index = DOCS / "index.html"
    html = index.read_text(encoding="utf-8")
    modules = sorted(p.name for p in (DOCS / "js").glob("*.js"))
    imports = {f"./js/{m}": f"./js/{m}?v={version}" for m in modules}
    block = f'{START}\n  <script type="importmap">\n{json.dumps({"imports": imports}, indent=2)}\n  </script>\n  {END}'
    if START in html:
        html = re.sub(re.escape(START) + r".*?" + re.escape(END), lambda _: block, html, flags=re.S)
    else:  # first run: put the import map before any script
        html = html.replace("  <link rel=\"stylesheet\" href=\"styles.css", f"  {block}\n  <link rel=\"stylesheet\" href=\"styles.css", 1)
    html = re.sub(r'styles\.css\?v=[\w.-]+', f"styles.css?v={version}", html)
    html = re.sub(r'js/main\.js\?v=[\w.-]+', f"js/main.js?v={version}", html)
    index.write_text(html, encoding="utf-8", newline="\n")
    print(f"stamped {len(modules)} modules + styles.css with v={version}")


if __name__ == "__main__":
    stamp(sys.argv[1] if len(sys.argv) > 1 else datetime.now().strftime("%Y%m%d%H%M"))

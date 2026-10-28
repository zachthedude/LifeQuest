"""Build the static GitHub Pages demo into _site/: the web app plus the Python
server zipped for Pyodide (see web/js/demo.js)."""
import shutil, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "_site"

shutil.rmtree(OUT, ignore_errors=True)
shutil.copytree(ROOT / "web", OUT)
with zipfile.ZipFile(OUT / "server.zip", "w", zipfile.ZIP_DEFLATED) as z:
    for f in (ROOT / "server").rglob("*"):
        if f.suffix in (".py", ".sql", ".json"):
            z.write(f, f.relative_to(ROOT))
index = OUT / "index.html"
html = index.read_text(encoding="utf-8")
assert 'src="js/main.js"' in html
index.write_text(html.replace('src="js/main.js"', 'src="js/demo.js"'), encoding="utf-8")
(OUT / ".nojekyll").touch()
print("built", OUT)

# `--push` publishes _site to the gh-pages branch, which GitHub Pages serves.
import subprocess, sys
if "--push" in sys.argv:
    remote = subprocess.check_output(["git", "remote", "get-url", "origin"], cwd=ROOT, text=True).strip()
    run = lambda *a: subprocess.run(["git", *a], cwd=OUT, check=True)
    run("init", "-q", "-b", "gh-pages")
    run("add", "-A")
    run("-c", "user.name=pages", "-c", "user.email=pages@localhost", "commit", "-q", "-m", "Build")
    run("push", "-q", "-f", remote, "gh-pages")
    print("pushed gh-pages")

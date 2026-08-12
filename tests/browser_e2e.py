#!/usr/bin/env python3
"""Headless browser end-to-end run.

    python tests/browser_e2e.py [--keep]

Boots the real server on a throwaway database, copies the click-driver harness
into the web root, drives the UI in headless Chrome, prints the results, and
cleans up. Exits non-zero if any assertion failed.
"""

from __future__ import annotations

import argparse
import html
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
HARNESS = ROOT / "tests" / "browser"

CHROME_CANDIDATES = [
    os.environ.get("CHROME_PATH", ""),
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
]


def _use_utf8_stdout() -> None:
    """Windows consoles default to cp1252; the report contains typographic marks."""
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass


def find_chrome() -> str | None:
    for candidate in CHROME_CANDIDATES:
        if candidate and Path(candidate).exists():
            return candidate
    return None


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def wait_for_server(port: int, timeout: float = 20.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/meta", timeout=2):
                return True
        except (urllib.error.URLError, OSError):
            time.sleep(0.25)
    return False


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--keep", action="store_true", help="keep the harness files in web/")
    args = parser.parse_args()
    _use_utf8_stdout()

    chrome = find_chrome()
    if not chrome:
        print("SKIP: no Chrome/Edge binary found (set CHROME_PATH)")
        return 0

    port = free_port()
    workdir = Path(tempfile.mkdtemp(prefix="lifequest-e2e-"))
    env = {
        **os.environ,
        "DATABASE_URL": str(workdir / "e2e.db"),
        "LIFEQUEST_UPLOAD_DIR": str(workdir / "uploads"),
        "LIFEQUEST_PORT": str(port),
        "AI_API_KEY": "",
        "ANTHROPIC_API_KEY": "",
        # Pin the built-in engine. Provider selection is otherwise `auto`, which
        # finds a running Ollama — and then this suite would be asserting a
        # local model's judgement of the sample evidence rather than the game
        # loop, which is the thing it is actually here to prove.
        "AI_PROVIDER": "none",
    }

    # The driver runs inside the real app page (the app's CSP correctly refuses
    # to be framed), so we serve a copy of index.html with the driver appended.
    page = (WEB / "index.html").read_text(encoding="utf-8").replace(
        "</body>", '  <script type="module" src="/__e2e.js"></script>\n</body>')
    created = [WEB / "__e2e.html", WEB / "__e2e.js"]
    (WEB / "__e2e.html").write_text(page, encoding="utf-8")
    shutil.copyfile(HARNESS / "harness.js", WEB / "__e2e.js")

    server = subprocess.Popen(
        [sys.executable, str(ROOT / "run.py")],
        cwd=str(ROOT), env=env,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, encoding="utf-8", errors="replace",
    )

    profile = workdir / "chrome-profile"
    try:
        if not wait_for_server(port):
            print("FAIL: server did not start")
            return 1

        result = subprocess.run(
            [
                chrome, "--headless=new", "--disable-gpu", "--no-sandbox",
                "--disable-dev-shm-usage", f"--user-data-dir={profile}",
                # Wide enough for the desktop layout. Chrome's default window is
                # under the 900px breakpoint, which left the side rail
                # `display: none` — every assertion about it was measuring a
                # hidden element.
                "--window-size=1280,900",
                "--virtual-time-budget=150000", "--dump-dom",
                f"http://127.0.0.1:{port}/__e2e.html#/",
            ],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
            timeout=180,
        )
        dom = result.stdout
    except subprocess.TimeoutExpired:
        print("FAIL: browser run timed out")
        return 1
    finally:
        server.terminate()
        try:
            server.wait(timeout=10)
        except subprocess.TimeoutExpired:
            server.kill()
        if not args.keep:
            for target in created:
                target.unlink(missing_ok=True)
        shutil.rmtree(workdir, ignore_errors=True)

    match = re.search(r'<pre id="e2e-log"[^>]*>(.*?)</pre>', dom, re.S)
    if not match:
        print("FAIL: harness produced no output")
        print(dom[:800])
        return 1

    report = html.unescape(match.group(1)).strip()
    print(report)

    failures = [line for line in report.splitlines() if line.startswith("FAIL")]
    if "DONE" not in report:
        print("\nFAIL: harness did not finish")
        return 1
    if failures:
        print(f"\n{len(failures)} browser assertion(s) failed")
        return 1
    passes = len([line for line in report.splitlines() if line.startswith("PASS")])
    print(f"\nAll {passes} browser assertions passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())

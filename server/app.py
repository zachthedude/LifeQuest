"""Application assembly: middleware, static assets and the HTTP adapter."""

from __future__ import annotations

import logging
import mimetypes
import posixpath
import threading
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

from . import api, config, db, security
from .routing import HttpError, Request, Response

log = logging.getLogger("lifequest")

SAFE_METHODS = ("GET", "HEAD", "OPTIONS")

SECURITY_HEADERS = {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "same-origin",
    # Quest evidence is filmed in the browser and write-ups are dictated, so
    # the app needs the camera and the microphone on its own origin. Both are
    # still gated behind the browser's own permission prompt, and both are only
    # ever requested when the player presses record.
    "permissions-policy": "geolocation=(), microphone=(self), camera=(self)",
    "content-security-policy": (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: blob:; "
        "font-src 'self'; "
        "connect-src 'self'; "
        # blob: is the recording itself — MediaRecorder hands back a Blob and the
        # review player reads it through an object URL before it is uploaded.
        "media-src 'self' data: blob:; "
        "object-src 'none'; "
        "base-uri 'none'; "
        "form-action 'self'; "
        "frame-ancestors 'none'"
    ),
}


def _static_response(path: str) -> Response:
    """Serve the SPA. Unknown non-API paths fall back to index.html."""
    clean = posixpath.normpath(unquote(path)).lstrip("/")
    if clean in ("", ".", "/"):
        clean = "index.html"
    target = (config.WEB_DIR / clean).resolve()
    root = config.WEB_DIR.resolve()
    if root != target and root not in target.parents:
        target = root / "index.html"
    if not target.is_file():
        target = root / "index.html"
    if not target.is_file():
        return Response.text("LifeQuest frontend is missing.", status=500)

    content_type, _ = mimetypes.guess_type(str(target))
    if target.suffix == ".js":
        content_type = "text/javascript; charset=utf-8"
    elif target.suffix == ".css":
        content_type = "text/css; charset=utf-8"
    elif target.suffix == ".html":
        content_type = "text/html; charset=utf-8"
    elif target.suffix == ".woff2":
        content_type = "font/woff2"
    # A font file never changes without its name changing, so it is the one asset
    # worth caching hard. Everything else stays short so an edit shows up on a
    # reload, and HTML is never cached at all.
    if target.suffix == ".html":
        cache = "no-cache"
    elif target.suffix == ".woff2":
        cache = "public, max-age=31536000, immutable"
    else:
        cache = "public, max-age=300"
    return Response(status=200, body=target.read_bytes(), headers={
        "content-type": content_type or "application/octet-stream",
        "cache-control": cache,
    })


def dispatch(request: Request) -> Response:
    """Route a request through the middleware chain. Transport agnostic."""
    try:
        if not request.path.startswith("/api/"):
            if request.method not in ("GET", "HEAD"):
                raise HttpError(405, "method_not_allowed", "That method isn't allowed here.")
            # Falls through to the security-header pass below — static assets need
            # the CSP just as much as the API does.
            response = _static_response(request.path)
            for key, value in SECURITY_HEADERS.items():
                response.headers.setdefault(key, value)
            return response

        matched = api.router.match(request.method, request.path)
        if matched is None:
            raise HttpError(404, "not_found", "Unknown endpoint.")
        handler, params, options = matched
        request.params = params

        token = request.cookies.get(security.SESSION_COOKIE)
        request.session = security.resolve_session(token)

        identity = str(request.session["userId"]) if request.session else request.remote
        bucket = options.get("bucket", "read")
        allowed, retry_after = security.rate_limit(bucket, identity)
        if not allowed:
            raise HttpError(429, "rate_limited",
                            "Too many requests. Give it a moment and try again.",
                            {"retryAfter": retry_after})

        if options.get("auth", True) and request.session is None:
            raise HttpError(401, "unauthenticated", "Sign in to continue.")

        # Double-submit CSRF: cookies are SameSite=Lax and mutations additionally
        # require the token issued with the session.
        if request.method not in SAFE_METHODS and request.session is not None:
            supplied = request.header(security.CSRF_HEADER)
            if not supplied or supplied != request.session["csrf"]:
                raise HttpError(403, "csrf", "Session token missing or stale. Reload the page.")

        response = handler(request)
    except HttpError as exc:
        response = exc.to_response()
    except Exception:
        log.error("Unhandled error on %s %s\n%s", request.method, request.path,
                  traceback.format_exc())
        response = Response.json(
            {"error": "server_error",
             "message": "Something went wrong on our side. Try again."},
            status=500)

    for key, value in SECURITY_HEADERS.items():
        response.headers.setdefault(key, value)
    return response


class Handler(BaseHTTPRequestHandler):
    server_version = "LifeQuest"
    sys_version = ""
    protocol_version = "HTTP/1.1"

    def _handle(self, method: str) -> None:
        parsed = urlparse(self.path)
        query = {k: v[0] for k, v in parse_qs(parsed.query).items()}
        headers = {k.lower(): v for k, v in self.headers.items()}

        length = 0
        try:
            length = int(headers.get("content-length", "0") or 0)
        except ValueError:
            length = 0
        if length > config.MAX_BODY_BYTES:
            self._write(Response.json(
                {"error": "too_large", "message": "Request body is too large."}, status=413))
            return
        body = self.rfile.read(length) if length else b""

        request = Request(
            method=method, path=parsed.path, query=query, headers=headers, body=body,
            remote=self.client_address[0] if self.client_address else "unknown",
        )
        try:
            response = dispatch(request)
        finally:
            pass
        self._write(response, head_only=(method == "HEAD"))

    def _write(self, response: Response, head_only: bool = False) -> None:
        body = b"" if head_only else response.body
        self.send_response(response.status)
        for key, value in response.headers.items():
            self.send_header(key, value)
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        if body:
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass

    def do_GET(self): self._handle("GET")
    def do_HEAD(self): self._handle("HEAD")
    def do_POST(self): self._handle("POST")
    def do_PATCH(self): self._handle("PATCH")
    def do_DELETE(self): self._handle("DELETE")

    def log_message(self, fmt: str, *args) -> None:
        if config.DEV_MODE:
            log.info("%s %s", self.address_string(), fmt % args)


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            db.close_thread_connection()


def create_server(host: str | None = None, port: int | None = None) -> Server:
    db.init()
    security.purge_expired_sessions()
    security.purge_expired_resets()
    return Server((host or config.HOST, port or config.PORT), Handler)


def serve_forever() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(levelname)-5s  %(message)s",
        datefmt="%H:%M:%S",
    )
    server = create_server()
    host, port = server.server_address[0], server.server_address[1]
    from .ai import provider as provider_mod
    status = provider_mod.status()
    log.info("LifeQuest running at http://%s:%s", host, port)
    log.info("AI: %s", status["note"])
    if status["model"]:
        log.info("AI: model %s", status["model"])

    # Loading a local model takes far longer than answering with one, and the
    # player should not be the one waiting for it. Warm it in the background so
    # the server is serving pages the whole time.
    provider = provider_mod.get_provider()
    if config.OLLAMA_WARM and hasattr(provider, "warm"):
        threading.Thread(target=provider.warm, name="ai-warm", daemon=True).start()

    threading.current_thread().name = "main"
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log.info("Shutting down.")
    finally:
        server.server_close()

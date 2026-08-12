"""A very small request/response + routing layer.

Deliberately transport-agnostic: `dispatch()` takes a Request and returns a
Response, so the whole API can be exercised in tests without opening a socket.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any, Callable


@dataclass
class Request:
    method: str
    path: str
    query: dict[str, str] = field(default_factory=dict)
    headers: dict[str, str] = field(default_factory=dict)
    body: bytes = b""
    params: dict[str, str] = field(default_factory=dict)
    remote: str = "127.0.0.1"
    # Populated by the auth middleware.
    session: dict | None = None

    def json(self) -> dict:
        if not self.body:
            return {}
        try:
            data = json.loads(self.body.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            raise HttpError(400, "invalid_json", "Request body must be valid JSON.")
        if not isinstance(data, dict):
            raise HttpError(400, "invalid_json", "Request body must be a JSON object.")
        return data

    def header(self, name: str, default: str = "") -> str:
        return self.headers.get(name.lower(), default)

    @property
    def cookies(self) -> dict[str, str]:
        raw = self.header("cookie")
        out: dict[str, str] = {}
        for part in raw.split(";"):
            if "=" in part:
                key, _, value = part.partition("=")
                out[key.strip()] = value.strip()
        return out


@dataclass
class Response:
    status: int = 200
    body: bytes = b""
    headers: dict[str, str] = field(default_factory=dict)

    @classmethod
    def json(cls, payload: Any, status: int = 200, headers: dict | None = None) -> "Response":
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        base = {"content-type": "application/json; charset=utf-8",
                "cache-control": "no-store"}
        base.update(headers or {})
        return cls(status=status, body=body, headers=base)

    @classmethod
    def text(cls, text: str, status: int = 200, content_type: str = "text/plain; charset=utf-8"):
        return cls(status=status, body=text.encode("utf-8"),
                   headers={"content-type": content_type})

    @classmethod
    def empty(cls, status: int = 204) -> "Response":
        return cls(status=status, body=b"", headers={})


class HttpError(Exception):
    def __init__(self, status: int, code: str, message: str, extra: dict | None = None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.extra = extra or {}

    def to_response(self) -> Response:
        payload = {"error": self.code, "message": self.message}
        payload.update(self.extra)
        return Response.json(payload, status=self.status)


Handler = Callable[[Request], Response]

_PARAM_RE = re.compile(r":([A-Za-z_][A-Za-z0-9_]*)")


class Router:
    def __init__(self) -> None:
        self.routes: list[tuple[str, re.Pattern, Handler, dict]] = []

    def add(self, method: str, pattern: str, handler: Handler, **options) -> None:
        regex = "^" + _PARAM_RE.sub(r"(?P<\1>[^/]+)", pattern) + "$"
        self.routes.append((method.upper(), re.compile(regex), handler, options))

    def route(self, method: str, pattern: str, **options):
        def decorator(handler: Handler) -> Handler:
            self.add(method, pattern, handler, **options)
            return handler
        return decorator

    def get(self, pattern: str, **options):
        return self.route("GET", pattern, **options)

    def post(self, pattern: str, **options):
        return self.route("POST", pattern, **options)

    def patch(self, pattern: str, **options):
        return self.route("PATCH", pattern, **options)

    def delete(self, pattern: str, **options):
        return self.route("DELETE", pattern, **options)

    def match(self, method: str, path: str) -> tuple[Handler, dict, dict] | None:
        allowed = False
        for route_method, regex, handler, options in self.routes:
            matched = regex.match(path)
            if not matched:
                continue
            if route_method != method.upper():
                allowed = True
                continue
            return handler, matched.groupdict(), options
        if allowed:
            raise HttpError(405, "method_not_allowed", "That method isn't allowed here.")
        return None

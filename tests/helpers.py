"""Shared test scaffolding: an in-process API client and a fake AI provider."""

from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


def use_temp_database() -> str:
    """Point config at a throwaway database. Must run before importing db users."""
    tmp = tempfile.mkdtemp(prefix="lifequest-test-")
    os.environ["DATABASE_URL"] = str(Path(tmp) / "test.db")
    os.environ["LIFEQUEST_UPLOAD_DIR"] = str(Path(tmp) / "uploads")
    os.environ.pop("AI_API_KEY", None)
    os.environ.pop("ANTHROPIC_API_KEY", None)
    # Pin the AI layer to the built-in engine. Provider selection is otherwise
    # `auto`, which would find a running Ollama and make the suite both slow and
    # dependent on which machine it happens to be running on. Tests that want a
    # model inject a fake through provider.set_provider().
    os.environ["AI_PROVIDER"] = "none"
    return tmp


class Client:
    """Drives the API through `dispatch()` — no sockets, full middleware."""

    def __init__(self) -> None:
        from server import app
        self.app = app
        self.cookie = ""
        self.csrf = ""

    def request(self, method: str, path: str, body=None, headers=None, raw_body=None):
        from server.routing import Request

        payload = raw_body if raw_body is not None else (
            json.dumps(body).encode() if body is not None else b"")
        merged = {"content-type": "application/json"}
        if self.cookie:
            merged["cookie"] = self.cookie
        if self.csrf:
            merged["x-lifequest-csrf"] = self.csrf
        merged.update({k.lower(): v for k, v in (headers or {}).items()})

        # Mirror what the real HTTP handler does: split the query off the path.
        from urllib.parse import parse_qs, urlparse

        parsed = urlparse(path)
        query = {k: v[0] for k, v in parse_qs(parsed.query).items()}
        request = Request(method=method, path=parsed.path, query=query, headers=merged,
                          body=payload, remote="127.0.0.1")
        response = self.app.dispatch(request)

        set_cookie = response.headers.get("set-cookie")
        if set_cookie:
            self.cookie = set_cookie.split(";")[0]
        try:
            data = json.loads(response.body.decode()) if response.body else {}
        except (ValueError, UnicodeDecodeError):
            data = {"_raw": response.body[:200]}
        if isinstance(data, dict) and data.get("csrfToken"):
            self.csrf = data["csrfToken"]
        return response.status, data

    def get(self, path, **kw): return self.request("GET", path, **kw)
    def post(self, path, body=None, **kw): return self.request("POST", path, body, **kw)
    def patch(self, path, body=None, **kw): return self.request("PATCH", path, body, **kw)

    # -- convenience flows --------------------------------------------------
    def signup(self, username="tester", password="quest-runner-9"):
        return self.post("/api/auth/signup", {"username": username, "password": password})

    def onboard(self, **overrides):
        payload = {
            "displayName": "Zach",
            "ageBand": "adult",
            "activityLevel": "moderate",
            "minutesPerDay": 60,
            "academicSubjects": ["Mathematics", "Physics"],
            "passionInterests": ["Robotics"],
            "passionCurious": ["Photography", "Music"],
            "physicalActivities": ["Running", "Climbing"],
            "existingSkills": ["Python"],
            "shortTermGoals": "Build a robot arm",
            "longTermGoals": "Study engineering",
        }
        payload.update(overrides)
        return self.post("/api/onboarding", payload)


class FakeProvider:
    """Stands in for a language model so the model-backed path is testable."""

    name = "fake"
    available = True
    transport = "test"

    def __init__(self, json_response=None, text_response=None):
        self.json_response = json_response
        self.text_response = text_response
        self.json_calls = []
        self.text_calls = []

    def complete_json(self, system, prompt, schema, max_tokens=2000):
        self.json_calls.append({"system": system, "prompt": prompt, "schema": schema})
        return self.json_response

    def complete_text(self, system, prompt, max_tokens=1000):
        self.text_calls.append({"system": system, "prompt": prompt})
        return self.text_response


def good_proof(minutes=45):
    return {
        "text": ("Ran a 45 minute mathematics session on integration by parts. Warmed up "
                 "with four review problems, then worked through 10 problems from the "
                 "textbook, getting 7 right. The two I missed were both substitution "
                 "errors where I dropped the constant."),
        "reflection": ("I learned that my mistakes cluster around setting up the "
                       "substitution rather than the integration itself. Next time I will "
                       "write the substitution explicitly before integrating."),
        "structured": {"minutes": str(minutes), "problems": "10"},
    }

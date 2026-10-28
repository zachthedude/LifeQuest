"""Shared test scaffolding: an in-process API client and a fake AI provider."""

from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

# The smallest valid PNG there is: a single transparent pixel. Real bytes, so it
# survives the upload endpoint's content sniffing rather than being waved past.
PNG_1X1 = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
    "890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082")


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

    def upload_png(self, name="proof.png"):
        """Upload a real 1x1 PNG and return the stored file metadata.

        Evidence is mandatory, and the submit endpoint checks that every file id
        it is handed actually exists on disk for that player — so a fabricated
        metadata dict is dropped on the way in and the submission arrives with
        no artifact. Going through the real endpoint is also the only way these
        tests cover the upload path at all.
        """
        boundary = "----lifequest-test-boundary"
        body = (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="file"; filename="{name}"\r\n'
            "Content-Type: image/png\r\n\r\n"
        ).encode() + PNG_1X1 + f"\r\n--{boundary}--\r\n".encode()

        status, data = self.request(
            "POST", "/api/uploads", raw_body=body,
            headers={"content-type": f"multipart/form-data; boundary={boundary}"})
        assert status == 201, f"upload failed: {status} {data}"
        return data["files"][0]

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

    # `timeout` mirrors the real providers: callers with a player waiting on the
    # answer pass a deadline. The fake answers instantly, so it only records it.
    def complete_json(self, system, prompt, schema, max_tokens=2000, timeout=None):
        self.json_calls.append({"system": system, "prompt": prompt, "schema": schema,
                                "timeout": timeout})
        return self.json_response

    def complete_text(self, system, prompt, max_tokens=1000, timeout=None):
        self.text_calls.append({"system": system, "prompt": prompt, "timeout": timeout})
        return self.text_response


# A stand-in for an uploaded file. Only the shape matters to the evaluator: the
# real endpoint stores `contentType`, and evidence scoring reads it to tell a
# filmed set from a photographed page.
def photo(name="worked-pages.jpg"):
    return {"id": "test-" + name, "name": name,
            "url": "/api/uploads/test-" + name, "contentType": "image/jpeg"}


def clip(name="set.webm"):
    return {"id": "test-" + name, "name": name,
            "url": "/api/uploads/test-" + name, "contentType": "video/webm"}


def good_proof(minutes=45):
    """A submission that should verify.

    It carries an artifact, because since evidence became mandatory a write-up
    on its own cannot verify however well written it is — that is the rule under
    test everywhere else, so the shared fixture has to respect it rather than
    quietly bypass it.
    """
    return {
        "text": ("Ran a 45 minute mathematics session on integration by parts. Warmed up "
                 "with four review problems, then worked through 10 problems from the "
                 "textbook, getting 7 right. The two I missed were both substitution "
                 "errors where I dropped the constant."),
        "structured": {"minutes": str(minutes), "problems": "10"},
        "files": [photo()],
    }


def text_only_proof(minutes=45):
    """The same submission with the artifact removed — must never verify."""
    proof = good_proof(minutes)
    proof.pop("files", None)
    return proof

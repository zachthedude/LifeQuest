"""API surface: authentication, authorisation, validation and abuse controls."""

from __future__ import annotations

import itertools
import json
import re
import unittest

from helpers import Client, use_temp_database

use_temp_database()

from server import db, security  # noqa: E402

db.init()
_counter = itertools.count(1)


def unique(prefix: str) -> str:
    return f"{prefix}{next(_counter)}"


class AuthTests(unittest.TestCase):
    def setUp(self):
        security.limiter.reset()
        self.client = Client()

    def test_signup_login_logout_cycle(self):
        name = unique("cycle")
        status, data = self.client.signup(name)
        self.assertEqual(status, 201)
        self.assertEqual(data["user"]["username"], name)
        self.assertFalse(data["user"]["onboarded"])
        self.assertTrue(data["csrfToken"])

        status, me = self.client.get("/api/auth/me")
        self.assertEqual(me["user"]["username"], name)

        self.assertEqual(self.client.post("/api/auth/logout")[0], 200)
        status, me = self.client.get("/api/auth/me")
        self.assertIsNone(me["user"])

        fresh = Client()
        status, data = fresh.post("/api/auth/login",
                                  {"username": name, "password": "quest-runner-9"})
        self.assertEqual(status, 200)

    def test_rejects_weak_and_malformed_credentials(self):
        status, data = self.client.post("/api/auth/signup", {"username": "a", "password": "x" * 10})
        self.assertEqual(status, 400)
        self.assertEqual(data["error"], "invalid_username")

        status, data = self.client.post("/api/auth/signup",
                                        {"username": unique("weak"), "password": "short"})
        self.assertEqual(status, 400)
        self.assertEqual(data["error"], "invalid_password")

        status, _ = self.client.post("/api/auth/signup",
                                     {"username": "bad name!", "password": "quest-runner-9"})
        self.assertEqual(status, 400)

    def test_duplicate_username_is_rejected(self):
        name = unique("dupe")
        self.assertEqual(self.client.signup(name)[0], 201)
        status, data = Client().signup(name)
        self.assertEqual(status, 409)
        self.assertEqual(data["error"], "username_taken")

    def test_wrong_password_is_indistinguishable_from_unknown_user(self):
        name = unique("timing")
        self.client.signup(name)
        a = Client().post("/api/auth/login", {"username": name, "password": "wrong-password"})
        b = Client().post("/api/auth/login", {"username": "nobody-here", "password": "wrong-password"})
        self.assertEqual(a[0], b[0])
        self.assertEqual(a[1]["message"], b[1]["message"])

    def test_password_is_never_stored_in_the_clear(self):
        name = unique("hash")
        self.client.signup(name)
        row = db.query_one("SELECT password_hash, password_salt FROM users WHERE username=?", (name,))
        self.assertNotIn("quest-runner-9", row["password_hash"])
        self.assertEqual(len(row["password_hash"]), 64)
        self.assertTrue(security.verify_password("quest-runner-9", row["password_hash"],
                                                 row["password_salt"]))


class AccessControlTests(unittest.TestCase):
    def setUp(self):
        security.limiter.reset()
        self.client = Client()

    def test_protected_endpoints_require_a_session(self):
        anonymous = Client()
        for path in ("/api/player", "/api/quests", "/api/guide", "/api/player/progress"):
            status, data = anonymous.get(path)
            self.assertEqual(status, 401, path)
            self.assertEqual(data["error"], "unauthenticated")

    def test_mutations_require_the_csrf_token(self):
        self.client.signup(unique("csrf"))
        good = self.client.csrf
        self.client.csrf = "forged-token"
        status, data = self.client.post("/api/quests/daily", {})
        self.assertEqual(status, 403)
        self.assertEqual(data["error"], "csrf")
        self.client.csrf = good

    def test_onboarding_is_required_before_playing(self):
        self.client.signup(unique("gate"))
        status, data = self.client.post("/api/quests/daily", {})
        self.assertEqual(status, 409)
        self.assertEqual(data["error"], "onboarding_required")

    def test_players_cannot_touch_each_others_quests(self):
        owner = Client()
        owner.signup(unique("owner"))
        owner.onboard()
        quest_id = owner.get("/api/quests")[1]["quests"][0]["id"]

        intruder = Client()
        intruder.signup(unique("intruder"))
        intruder.onboard()

        self.assertEqual(intruder.get(f"/api/quests/{quest_id}")[0], 404)
        self.assertEqual(intruder.post(f"/api/quests/{quest_id}/start")[0], 409)
        status, _ = intruder.post(f"/api/quests/{quest_id}/submit", {"text": "x" * 60})
        self.assertIn(status, (404, 409))

    def test_uploads_are_scoped_to_their_owner(self):
        self.assertIsNone(security.upload_path_for(1, "2_abcdef.png"))
        self.assertIsNone(security.upload_path_for(1, "../../etc/passwd"))
        self.assertIsNone(security.upload_path_for(1, "1_missing.png"))


class ValidationTests(unittest.TestCase):
    def setUp(self):
        security.limiter.reset()
        self.client = Client()
        self.client.signup(unique("valid"))
        self.client.onboard()

    def test_empty_proof_is_rejected(self):
        quest_id = self.client.get("/api/quests")[1]["quests"][0]["id"]
        status, data = self.client.post(f"/api/quests/{quest_id}/submit", {"text": "  "})
        self.assertEqual(status, 400)
        self.assertEqual(data["error"], "empty_proof")

    def test_malformed_json_is_rejected(self):
        status, data = self.client.request("POST", "/api/guide/ask", raw_body=b"{not json")
        self.assertEqual(status, 400)
        self.assertEqual(data["error"], "invalid_json")

        status, data = self.client.request("POST", "/api/guide/ask", raw_body=b'"a string"')
        self.assertEqual(status, 400)

    def test_unknown_endpoints_and_methods(self):
        self.assertEqual(self.client.get("/api/does-not-exist")[0], 404)
        self.assertEqual(self.client.request("DELETE", "/api/player")[0], 405)

    def test_dangerous_links_are_stripped(self):
        self.assertEqual(security.safe_url("javascript:alert(1)"), "")
        self.assertEqual(security.safe_url("data:text/html,<script>"), "")
        self.assertEqual(security.safe_url("https://example.com/x"), "https://example.com/x")

    def test_control_characters_are_stripped_from_input(self):
        cleaned = security.clean_text("hello\x00\x08 world")
        self.assertEqual(cleaned, "hello world")

    def test_custom_quests_are_locked_until_level_30(self):
        status, data = self.client.post("/api/quests/custom", {
            "title": "Build my first website", "description": "Ship a working site.",
            "domain": "passion", "difficulty": 3, "estimatedTime": 180,
        })
        self.assertEqual(status, 400)
        self.assertIn("level 30", data["message"])

    def test_epic_quests_are_locked_at_low_level(self):
        status, data = self.client.post("/api/quests/generate", {"domain": "passion", "kind": "epic"})
        self.assertEqual(status, 403)
        self.assertEqual(data["error"], "locked")

    def test_security_headers_are_present(self):
        from server.app import dispatch
        from server.routing import Request

        response = dispatch(Request(method="GET", path="/", headers={}))
        self.assertIn("content-security-policy", response.headers)
        self.assertIn("script-src 'self'", response.headers["content-security-policy"])
        self.assertEqual(response.headers["x-frame-options"], "DENY")
        self.assertEqual(response.headers["x-content-type-options"], "nosniff")

    def test_static_paths_cannot_escape_the_web_root(self):
        from server.app import dispatch
        from server.routing import Request

        response = dispatch(Request(method="GET", path="/../server/config.py", headers={}))
        self.assertNotIn(b"AI_API_KEY", response.body)


CODE_RE = re.compile(r"LQ-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}")


class PasswordRecoveryTests(unittest.TestCase):
    """Reset a forgotten password with a single-use code, and nothing else."""

    def setUp(self):
        security.limiter.reset()
        self.client = Client()
        self.name = unique("recover")
        self.client.signup(self.name, "original-pass-77")

    def recover(self, username, client=None):
        """Ask for a code and read it back out of the server log.

        The log is where the endpoint actually puts it — there is no mail server
        and the product never asks for an email address — so reading it from
        there is exactly the access the person running the server has, and it
        tests the real path rather than re-minting a code behind the endpoint.
        """
        security.limiter.reset()
        with self.assertLogs("lifequest.api", level="INFO") as captured:
            status, data = (client or self.client).post(
                "/api/auth/recover", {"username": username})
        found = CODE_RE.search("\n".join(captured.output))
        return status, data, (found.group(0) if found else None)

    def reset(self, username, code, password):
        security.limiter.reset()
        return self.client.post("/api/auth/reset", {
            "username": username, "code": code, "password": password})

    def test_recovery_prints_a_code_for_a_real_account(self):
        status, data, code = self.recover(self.name)
        self.assertEqual(status, 200)
        self.assertIsNotNone(code, "no recovery code reached the server log")
        self.assertEqual(data["sent"], "server-log")

    def test_recovery_never_says_whether_the_account_exists(self):
        _, real, _ = self.recover(self.name)
        security.limiter.reset()
        # No code is minted for an account that does not exist, so there is
        # nothing to log — which is itself the thing being asserted.
        with self.assertNoLogs("lifequest.api", level="WARNING"):
            status, fake = self.client.post("/api/auth/recover",
                                            {"username": "nobody-at-all"})
        self.assertEqual(status, 200)
        self.assertEqual(real["message"], fake["message"])

    def test_the_code_is_never_returned_to_the_browser(self):
        _, data, code = self.recover(self.name)
        self.assertNotIn(code, json.dumps(data))

    def test_only_the_hash_of_a_code_is_stored(self):
        _, _, code = self.recover(self.name)
        stored = db.query_one(
            "SELECT code_hash FROM password_resets ORDER BY created_at DESC")["code_hash"]
        self.assertNotEqual(stored, code)
        self.assertEqual(len(stored), 64)

    def test_a_code_resets_the_password_and_signs_every_session_out(self):
        signed_in = Client()
        security.limiter.reset()
        signed_in.post("/api/auth/login",
                       {"username": self.name, "password": "original-pass-77"})
        self.assertIsNotNone(signed_in.get("/api/auth/me")[1].get("user"))

        _, _, code = self.recover(self.name)
        status, data = self.reset(self.name, code, "brand-new-pass-88")
        self.assertEqual(status, 200, data)

        security.limiter.reset()
        self.assertEqual(Client().post("/api/auth/login",
                                       {"username": self.name,
                                        "password": "original-pass-77"})[0], 401)
        security.limiter.reset()
        self.assertEqual(Client().post("/api/auth/login",
                                       {"username": self.name,
                                        "password": "brand-new-pass-88"})[0], 200)

        # The session that was already open is not still open: someone resetting
        # a password may be doing it *because* another browser is signed in.
        self.assertIsNone(signed_in.get("/api/auth/me")[1].get("user"))

    def test_a_code_works_exactly_once(self):
        _, _, code = self.recover(self.name)
        self.assertEqual(self.reset(self.name, code, "first-new-pass-11")[0], 200)
        status, data = self.reset(self.name, code, "second-new-pass-22")
        self.assertEqual(status, 400)
        self.assertEqual(data["error"], "invalid_code")

    def test_a_code_cannot_be_spent_on_another_account(self):
        victim = unique("recover")
        security.limiter.reset()
        Client().signup(victim, "victim-pass-99")

        _, _, code = self.recover(self.name)
        status, data = self.reset(victim, code, "stolen-pass-33")
        self.assertEqual(status, 400)
        self.assertEqual(data["error"], "invalid_code")

        security.limiter.reset()
        self.assertEqual(Client().post("/api/auth/login",
                                       {"username": victim,
                                        "password": "victim-pass-99"})[0], 200)

    def test_an_expired_code_is_refused(self):
        _, _, code = self.recover(self.name)
        db.execute("UPDATE password_resets SET expires_at='2000-01-01 00:00:00'")
        status, data = self.reset(self.name, code, "too-late-pass-44")
        self.assertEqual(status, 400)
        self.assertEqual(data["error"], "invalid_code")

    def test_asking_twice_leaves_only_the_newer_code_working(self):
        _, _, first = self.recover(self.name)
        _, _, second = self.recover(self.name)
        self.assertNotEqual(first, second)
        self.assertEqual(self.reset(self.name, first, "stale-pass-55")[0], 400)
        self.assertEqual(self.reset(self.name, second, "fresh-pass-66")[0], 200)

    def test_a_reset_still_enforces_the_password_rules(self):
        _, _, code = self.recover(self.name)
        status, data = self.reset(self.name, code, "abc")
        self.assertEqual(status, 400)
        self.assertEqual(data["error"], "invalid_password")
        # A rejected password must not burn the code.
        self.assertEqual(self.reset(self.name, code, "good-enough-pass-77")[0], 200)

    def test_a_made_up_code_is_refused(self):
        self.recover(self.name)
        status, data = self.reset(self.name, "LQ-AAAA-BBBB-CCCC", "guessed-pass-88")
        self.assertEqual(status, 400)
        self.assertEqual(data["error"], "invalid_code")


class RateLimitTests(unittest.TestCase):
    def setUp(self):
        security.limiter.reset()

    def tearDown(self):
        security.limiter.reset()

    def test_auth_attempts_are_rate_limited(self):
        client = Client()
        statuses = [
            client.post("/api/auth/login", {"username": "ghost", "password": "nope"})[0]
            for _ in range(14)
        ]
        self.assertIn(429, statuses)
        self.assertEqual(statuses[0], 401)


if __name__ == "__main__":
    unittest.main()

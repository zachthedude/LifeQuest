"""The full product test from the specification (§52), start to finish.

Creates an account, onboards, plays through quests, submits proof, earns XP,
levels up, unlocks achievements and skills, checks analytics, and walks every
major endpoint the UI depends on.
"""

from __future__ import annotations

import itertools
import unittest

from helpers import Client, use_temp_database

use_temp_database()

from server import db, security  # noqa: E402
from server.ai import quest_generator  # noqa: E402
from server.game import catalog, player, quests as quests_mod  # noqa: E402

db.init()
_counter = itertools.count(1)


# Evidence is mandatory now, so every fixture carries an artifact. A photograph
# is the one that fits all three domains: the worked page, the finished piece,
# the session on the watch.
PHOTO = {"id": "test-proof.jpg", "name": "proof.jpg",
         "url": "/api/uploads/test-proof.jpg", "contentType": "image/jpeg"}

def proof_for(client, domain, **overrides):
    """A domain's proof fixture with a genuinely uploaded artifact attached.

    The submit endpoint resolves every file id against what that player actually
    has on disk and silently drops the ones it cannot find, so a fabricated
    metadata dict arrives as no evidence at all. Uploading for real is both the
    only way these submissions verify and the only coverage the upload path gets.
    """
    payload = dict(PROOFS[domain])
    if "files" in payload:
        payload["files"] = [client.upload_png()]
    payload.update(overrides)
    return payload


PROOFS = {
    "physical": {
        "text": ("Thirty-five minute session: ten minutes of mobility for hips and ankles, "
                 "then a steady 20 minute run on the canal path, then five minutes walking "
                 "to cool down. Comfortable effort throughout."),
        "structured": {"minutes": "35"},
        "files": [PHOTO],
    },
    "academic": {
        "text": ("Studied rotational dynamics for 40 minutes. Read the chapter on moment of "
                 "inertia, then worked 10 problems and marked the 3 I got wrong."),
        "structured": {"minutes": "40", "count": "10"},
        "files": [PHOTO],
    },
    "passion": {
        "text": ("Spent 45 minutes on the robot arm: designed the gripper linkage in CAD and "
                 "printed a test piece. The first print failed because the tolerance was too "
                 "tight, so I widened it by 0.4mm and reprinted."),
        "structured": {"minutes": "45", "field": "Robotics", "interest": "5"},
        "link": "https://example.com/robot-arm-notes",
    },
}


class FullJourneyTest(unittest.TestCase):
    """Runs as one ordered scenario — each step depends on the previous one."""

    @classmethod
    def setUpClass(cls):
        security.limiter.reset()
        cls.client = Client()
        cls.username = f"journey{next(_counter)}"

    def step(self, name):
        return self.subTest(step=name)

    def test_full_journey(self):
        client = self.client

        # 1. Create account
        with self.step("create account"):
            status, data = client.signup(self.username)
            self.assertEqual(status, 201)
            self.assertFalse(data["user"]["onboarded"])
        user_id = int(db.query_one("SELECT id FROM users WHERE username=?",
                                   (self.username,))["id"])

        # 2. Complete onboarding  /  3. Generate a level 1 character
        with self.step("onboarding"):
            status, data = client.onboard()
            self.assertEqual(status, 201)
            self.assertEqual(data["snapshot"]["level"], 1)
            self.assertEqual(data["snapshot"]["xp"]["xpTotal"], 0)
            self.assertEqual(data["model"]["academic_subjects"], ["Mathematics", "Physics"])

        # 4. Receive starter quests — one per domain plus the teaching mission
        with self.step("starter quests"):
            quests = client.get("/api/quests")[1]["quests"]
            self.assertGreaterEqual(len(quests), 4)
            self.assertEqual({"physical", "academic", "passion"},
                             {q["domain"] for q in quests})
            self.assertTrue(any(q["templateKey"] == "tutorial_first_mission" for q in quests))

        # 5. Start a quest
        academic = next(q for q in quests if q["domain"] == "academic")
        with self.step("start quest"):
            status, data = client.post(f"/api/quests/{academic['id']}/start")
            self.assertEqual(status, 200)
            self.assertEqual(data["quest"]["status"], "active")

        # 6/7/8/9/10. Complete it, submit proof, AI evaluation, XP, attributes
        with self.step("submit proof and receive XP"):
            status, result = client.post(f"/api/quests/{academic['id']}/submit",
                                         proof_for(client, "academic"))
            self.assertEqual(status, 200)
            self.assertEqual(result["verdict"], "verified")
            self.assertGreater(result["xp"]["awarded"], 0)
            self.assertEqual(result["xp"]["domain"], "academic")
            self.assertIn(result["assessment"]["bands"]["relevance"], ("MEDIUM", "HIGH"))
            self.assertGreater(result["snapshot"]["attributes"]["academic"], 0)
            self.assertEqual(result["streak"]["streak"], 1)

        with self.step("first achievement"):
            unlocked = [a["name"] for a in result["achievements"]]
            self.assertIn("First Step", unlocked)

        # 11. Check the character profile
        with self.step("character profile"):
            status, data = client.get("/api/player")
            self.assertEqual(status, 200)
            snapshot = data["snapshot"]
            self.assertEqual(snapshot["questCounts"]["verified"], 1)
            self.assertGreater(snapshot["xp"]["xpTotal"], 0)
            self.assertEqual(snapshot["title"], "Novice")

        # 12. Check analytics
        with self.step("analytics"):
            status, report = client.get("/api/player/progress")
            self.assertEqual(status, 200)
            self.assertEqual(len(report["xpOverTime"]), 30)
            self.assertGreater(report["xpOverTime"][-1]["total"], 0)
            self.assertEqual(report["questPerformance"]["academic"]["verified"], 1)
            self.assertGreater(report["timeInvestment"]["totalMinutes"], 0)
            self.assertTrue(report["insights"])

        # Complete the other two domains too, so balance and skills move.
        with self.step("complete every domain"):
            open_quests = client.get("/api/quests")[1]["quests"]
            for domain in ("physical", "passion"):
                target = next(q for q in open_quests if q["domain"] == domain)
                client.post(f"/api/quests/{target['id']}/start")
                status, res = client.post(f"/api/quests/{target['id']}/submit",
                                          proof_for(client, domain))
                self.assertEqual(status, 200, domain)
                self.assertEqual(res["verdict"], "verified", f"{domain}: {res['assessment']}")

        # 13. Unlock an achievement / skills cascade
        with self.step("skills unlocked"):
            status, data = client.get("/api/player/skills")
            unlocked = [n["name"] for n in data["tree"] if n["unlocked"]]
            self.assertIn("Foundation", unlocked)
            self.assertIn("Study Habit", unlocked)
            self.assertIn("Curiosity", unlocked)

        with self.step("passion path recorded"):
            paths = client.get("/api/paths")[1]["paths"]
            self.assertTrue(any(p["name"] == "Robotics" for p in paths))

        # 14. Generate another quest
        with self.step("generate another quest"):
            status, data = client.post("/api/quests/generate", {"domain": "academic"})
            self.assertEqual(status, 201)
            self.assertEqual(data["quest"]["domain"], "academic")

        # 15. Verify difficulty adaptation
        with self.step("difficulty adaptation"):
            model = player.get_model(user_id)
            self.assertIn("academic", model["difficulty_offset"])
            # Force a run of easy wins and confirm the engine reacts.
            for _ in range(8):
                created = quests_mod.generate_one(user_id, "academic", "daily", use_model=False)
                db.execute("UPDATE quests SET status='verified' WHERE id=?", (created["id"],))
                db.insert(
                    """INSERT INTO quest_completions (user_id, quest_id, submitted_at, status,
                                                      proof, assessment, xp_awarded)
                       VALUES (?,?,datetime('now'),'verified','{}','{}',10)""",
                    (user_id, created["id"]))
            from server.ai import difficulty
            report = difficulty.evaluate_domain(user_id, "academic", 0)
            self.assertEqual(report["action"], "increase")
            self.assertEqual(report["offset"], 1)
            self.assertIn("too easy", report["message"])

        # 16. Navigate every major screen's endpoint
        with self.step("every screen loads"):
            for path in ("/api/player", "/api/quests", "/api/quests?status=verified",
                         "/api/player/skills", "/api/player/achievements",
                         "/api/player/progress", "/api/guide", "/api/chains",
                         "/api/paths", "/api/player/notifications", "/api/meta"):
                status, data = client.get(path)
                self.assertEqual(status, 200, path)
                self.assertIsInstance(data, dict)

        # 17. Guide conversation
        with self.step("guide answers"):
            status, data = client.post("/api/guide/ask", {"message": "What am I weakest at?"})
            self.assertEqual(status, 200)
            self.assertIn(data["intent"], ("weakest", "general"))
            self.assertGreater(len(data["reply"]), 40)

        # 18. Error and empty states are well-formed
        with self.step("error handling"):
            status, data = client.get("/api/quests/999999")
            self.assertEqual(status, 404)
            self.assertIn("message", data)
            self.assertNotIn("Traceback", str(data))

            status, data = client.post("/api/quests/999999/submit", {"text": "x" * 50})
            self.assertIn(status, (404, 409))
            self.assertIn("message", data)

    def test_level_up_and_notifications(self):
        security.limiter.reset()
        client = Client()
        name = f"levelup{next(_counter)}"
        client.signup(name)
        client.onboard()
        user_id = int(db.query_one("SELECT id FROM users WHERE username=?", (name,))["id"])

        # Award enough XP to cross a level boundary through the real code path.
        delta = player.award_xp(user_id, "academic", 120, "test:seed")
        self.assertTrue(delta["leveledUp"])
        self.assertEqual(delta["levelBefore"], 1)
        self.assertEqual(delta["levelAfter"], 2)

        player.refresh_derived(user_id)
        snapshot = player.snapshot(user_id)
        self.assertEqual(snapshot["level"], 2)
        self.assertLess(snapshot["xp"]["xpIntoLevel"], snapshot["xp"]["xpForNextLevel"])

    def test_repeating_one_archetype_yields_diminishing_xp(self):
        security.limiter.reset()
        client = Client()
        name = f"grind{next(_counter)}"
        client.signup(name)
        client.onboard()
        user_id = int(db.query_one("SELECT id FROM users WHERE username=?", (name,))["id"])

        # Pinned to one archetype deliberately. Asking the generator for six
        # quests measures the catalogue's depth instead: it hands back six
        # *different* archetypes, and repetition decay — which is keyed on the
        # template — never fires at all. Repetition is what this test is about,
        # so it issues the same template every time, which is also what a player
        # set on grinding one thing would end up doing.
        template = catalog.TEMPLATES_BY_KEY["acad_focus_block"]
        model = player.get_model(user_id)

        awards = []
        blocked = None
        for index in range(4):
            spec = quest_generator.render_template(template, model, 1, user_id)
            quest_id = quests_mod.insert_quest(user_id, spec)
            proof = dict(PROOFS["academic"])
            proof["text"] = f"{proof['text']} Session {index} covered a different chapter."
            result = quests_mod.submit(user_id, quest_id, proof)
            if not result.get("ok"):
                blocked = result["error"]
                break
            if result["verdict"] == "verified":
                awards.append(result["xp"]["awarded"])

        self.assertGreaterEqual(len(awards), 2,
                                "the same quest should verify at least twice")
        self.assertLess(awards[1], awards[0],
                        "repeating an archetype must yield diminishing XP")
        self.assertEqual(blocked, "repetition",
                         "the same archetype must eventually be refused outright")

    def test_grinding_a_domain_is_eventually_gated(self):
        security.limiter.reset()
        client = Client()
        name = f"grind{next(_counter)}"
        client.signup(name)
        client.onboard()
        user_id = int(db.query_one("SELECT id FROM users WHERE username=?", (name,))["id"])

        awards = []
        blocked = False
        for index in range(6):
            created = quests_mod.generate_one(user_id, "academic", "daily", use_model=False)
            if created is None:
                break
            proof = dict(PROOFS["academic"])
            proof["text"] = f"{proof['text']} Session {index} covered a different chapter."
            result = quests_mod.submit(user_id, created["id"], proof)
            if not result.get("ok"):
                blocked = True
                # Which gate catches a grinder depends on how deep the catalogue
                # is: repeat the same archetype and the repetition limit fires;
                # burn through six different ones and it is the burst limit. The
                # guarantee under test is that one of them does — asserting on a
                # particular message made this a test of the catalogue's size.
                self.assertIn(result["error"], ("repetition", "rate", "cooldown"),
                              f"unexpected gate: {result['error']} — {result['message']}")
                break
            if result["verdict"] == "verified":
                awards.append(result["xp"]["awarded"])

        self.assertTrue(awards)
        self.assertTrue(blocked or len(awards) < 6,
                        "grinding quest after quest should eventually be gated")

    def test_duplicate_evidence_cannot_verify_twice(self):
        security.limiter.reset()
        client = Client()
        name = f"dupe{next(_counter)}"
        client.signup(name)
        client.onboard()

        quests = client.get("/api/quests")[1]["quests"]
        first = next(q for q in quests if q["domain"] == "academic")
        status, result = client.post(f"/api/quests/{first['id']}/submit",
                                     proof_for(client, "academic"))
        self.assertEqual(result["verdict"], "verified")

        second = client.post("/api/quests/generate", {"domain": "academic"})[1]["quest"]
        status, result = client.post(f"/api/quests/{second['id']}/submit",
                                     proof_for(client, "academic"))
        self.assertEqual(status, 200)
        self.assertNotEqual(result["verdict"], "verified")
        self.assertTrue(any("same evidence" in note for note in result["assessment"]["notes"]))

    def test_questline_runs_end_to_end(self):
        security.limiter.reset()
        client = Client()
        name = f"chain{next(_counter)}"
        client.signup(name)
        client.onboard()
        user_id = int(db.query_one("SELECT id FROM users WHERE username=?", (name,))["id"])

        # Questlines are level-gated; lift the player to the unlock level.
        player.award_xp(user_id, "academic", 12_000, "test:seed")
        player.refresh_derived(user_id)
        self.assertGreaterEqual(player.snapshot(user_id)["level"], 12)

        status, data = client.post("/api/chains/mastery/start")
        self.assertEqual(status, 201)
        self.assertEqual(data["quest"]["chainStep"], 1)

        # Walk every step of the chain.
        for expected_step in range(1, 7):
            state = quests_mod.chain_state(user_id)[0]
            current = next(q for q in quests_mod.open_quests(user_id)
                           if q["chainKey"] == "mastery")
            self.assertEqual(current["chainStep"], expected_step)
            result = quests_mod.submit(user_id, current["id"], PROOFS["academic"] | {
                "text": f"{PROOFS['academic']['text']} Step {expected_step} of the line.",
            })
            self.assertTrue(result["ok"], result.get("message"))
            self.assertEqual(result["verdict"], "verified", result.get("assessment"))
            # A questline is meant to run over days; age the submissions so the
            # burst detector doesn't (correctly) flag six completions in a minute.
            db.execute(
                "UPDATE quest_completions SET submitted_at = datetime(submitted_at, '-3 hours') "
                "WHERE user_id=?", (user_id,))

        final = quests_mod.chain_state(user_id)[0]
        self.assertEqual(final["status"], "complete")
        self.assertEqual(final["step"], final["totalSteps"])


if __name__ == "__main__":
    unittest.main()

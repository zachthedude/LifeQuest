"""The five AI modules — with and without a language model behind them."""

from __future__ import annotations

import itertools
import unittest

from helpers import Client, FakeProvider, good_proof, text_only_proof, use_temp_database

use_temp_database()

from server import db, security  # noqa: E402
from server.ai import difficulty, guide, proof_evaluator, provider as provider_mod  # noqa: E402
from server.ai import quest_generator  # noqa: E402
from server.game import catalog, player  # noqa: E402

db.init()
_counter = itertools.count(1)


def unique(prefix: str) -> str:
    return f"{prefix}{next(_counter)}"


def quest(**overrides):
    base = {
        "title": "Problem set: Mathematics",
        "description": "Complete a 40-minute problem set in Mathematics — at least eight problems.",
        "completion_criteria": "8+ problems attempted with errors reviewed",
        "domain": "academic",
        "estimated_time": 40,
        "evaluation_criteria": ["Problem count reported", "Errors identified"],
    }
    base.update(overrides)
    return base


# Carries a photograph, because a write-up alone no longer verifies anything the
# catalogue offers a way to photograph.
GOOD_PROOF = {
    "text": ("Worked through 10 integration problems from chapter 7. Got 7 right; the two "
             "I missed were substitution errors where I dropped the constant."),
    "structured": {"minutes": "40", "count": "10"},
    "files": [{"id": "t.jpg", "name": "worked-pages.jpg",
               "url": "/api/uploads/t.jpg", "contentType": "image/jpeg"}],
}


class ProofEvaluatorTests(unittest.TestCase):
    def test_strong_evidence_verifies(self):
        result = proof_evaluator.evaluate(quest(), GOOD_PROOF, [], ["text", "structured"])
        self.assertEqual(result["verdict"], "verified")
        self.assertGreater(result["confidence"], 55)
        self.assertGreater(result["qualityMultiplier"], 0.85)

    def test_empty_and_lazy_evidence_does_not_verify(self):
        for text in ("done", "finished it", "yes", "."):
            result = proof_evaluator.evaluate(quest(), {"text": text}, [], ["text"])
            self.assertNotEqual(result["verdict"], "verified", text)
            self.assertTrue(result["followUp"])

    def test_evidence_about_something_else_is_rejected(self):
        unrelated = {"text": ("I reorganised my sock drawer by colour and then alphabetised my "
                              "spice rack, which took most of the afternoon and felt great.")}
        result = proof_evaluator.evaluate(quest(), unrelated, [], ["text"])
        self.assertIn(result["verdict"], ("rejected", "needs_info"))
        self.assertLess(result["relevance"], 30)

    def test_authenticity_signals_block_verification(self):
        result = proof_evaluator.evaluate(
            quest(), GOOD_PROOF, ["duplicate_proof", "suspiciously_fast"], ["text"])
        self.assertNotEqual(result["verdict"], "verified")
        self.assertTrue(result["notes"])

    def test_evidence_raises_the_reward_multiplier(self):
        """Attaching the artifact is worth more XP, not just a cleaner record.

        This replaced a test that rewarded writing a reflection. Reflection was
        the easiest part of a submission to produce without doing the work, so
        paying for it paid for typing; this pays for evidence.
        """
        types = ["text", "photo"]
        bare = proof_evaluator.evaluate(quest(), text_only_proof(), [], types)
        attached = proof_evaluator.evaluate(quest(), good_proof(), [], types)
        self.assertGreater(attached["qualityMultiplier"], bare["qualityMultiplier"])
        self.assertGreater(attached["evidence"], bare["evidence"])

    def test_a_write_up_alone_cannot_verify_a_quest_that_takes_evidence(self):
        """The floor the whole redesign rests on."""
        verdicts = {}
        for types in (["text", "photo"], ["text", "video"], ["text", "link"],
                      ["text", "document"]):
            result = proof_evaluator.evaluate(quest(), text_only_proof(), [], types)
            verdicts[types[1]] = result["verdict"]
            self.assertIn("attached", result["feedback"].lower())
        self.assertNotIn("verified", verdicts.values(), verdicts)

    def test_a_quest_with_nothing_to_attach_is_not_punished_for_it(self):
        """The teaching mission and custom quests take no artifact — and must
        still be completable on a good write-up alone."""
        result = proof_evaluator.evaluate(quest(), text_only_proof(), [], ["text"])
        self.assertEqual(result["verdict"], "verified")

    def test_cross_domain_quests_accept_any_domain_vocabulary(self):
        tutorial = quest(
            title="First Mission: 15 minutes that improve you",
            description=("Do one 15-minute activity that makes you better physically, "
                         "academically or creatively."),
            completion_criteria="A 15-minute activity described in your own words",
            domain="passion", estimated_time=15)
        walk = {
            "text": ("Went for a 20 minute walk around the park and stretched afterwards. "
                     "I noticed my ankles are the tight part, not my hamstrings."),
            "structured": {"minutes": "20"},
        }
        self.assertEqual(proof_evaluator.evaluate(tutorial, walk, [], ["text"])["verdict"],
                         "verified")

    def test_model_scores_are_blended_but_anti_cheat_still_wins(self):
        provider_mod.set_provider(FakeProvider(json_response={
            "relevance": 99, "completion": 99, "quality": 99, "evidence": 99,
            "verdict": "verified", "feedback": "Looks complete.", "followUpQuestion": "",
        }))
        try:
            blended = proof_evaluator.evaluate(quest(), GOOD_PROOF, [], ["text"])
            self.assertEqual(blended["evaluator"], "model")
            self.assertEqual(blended["verdict"], "verified")

            # The model says yes; the server's duplicate-detection says wait.
            guarded = proof_evaluator.evaluate(
                quest(), GOOD_PROOF, ["duplicate_proof"], ["text"])
            self.assertEqual(guarded["verdict"], "needs_info")
        finally:
            provider_mod.set_provider(None)

    def test_malformed_model_output_falls_back_to_heuristics(self):
        provider_mod.set_provider(FakeProvider(json_response={"nonsense": True}))
        try:
            result = proof_evaluator.evaluate(quest(), GOOD_PROOF, [], ["text"])
            self.assertEqual(result["evaluator"], "heuristic")
            self.assertEqual(result["verdict"], "verified")
        finally:
            provider_mod.set_provider(None)


class QuestGeneratorTests(unittest.TestCase):
    def setUp(self):
        security.limiter.reset()
        self.client = Client()
        self.client.signup(unique("gen"))
        self.client.onboard()
        row = db.query_one("SELECT id FROM users WHERE username=?", (self.client_username(),))
        self.user_id = int(row["id"])

    def client_username(self):
        return self.client.get("/api/player")[1]["username"]

    def test_generated_quests_match_the_schema(self):
        status, data = self.client.post("/api/quests/generate", {"domain": "academic"})
        self.assertEqual(status, 201)
        quest_payload = data["quest"]
        for key in ("id", "title", "description", "domain", "difficulty", "estimatedTime",
                    "xpReward", "requirements", "proofType", "skills", "levelRequirement",
                    "aiEvaluationCriteria", "completionCriteria"):
            self.assertIn(key, quest_payload)
        self.assertIn(quest_payload["domain"], ("physical", "academic", "passion"))
        self.assertTrue(1 <= quest_payload["difficulty"] <= 5)
        self.assertGreater(quest_payload["xpReward"], 0)

    def test_quests_use_the_player_model(self):
        status, data = self.client.post("/api/quests/generate", {"domain": "academic"})
        text = data["quest"]["title"] + data["quest"]["description"]
        self.assertTrue(any(subject in text for subject in ("Mathematics", "Physics")),
                        f"expected a chosen subject in: {text}")

    def test_generator_avoids_repeating_open_archetypes(self):
        seen = set()
        for _ in range(4):
            status, data = self.client.post("/api/quests/generate", {"domain": "physical"})
            if status != 201:
                break
            seen.add(data["quest"]["templateKey"])
        self.assertGreaterEqual(len(seen), 2, "generator kept issuing the same archetype")

    def test_higher_level_players_get_higher_tier_archetypes(self):
        model = player.get_model(self.user_id)
        low = quest_generator.select_template(
            self.user_id, "academic", "daily", 1, model, {"base", "explore"})
        high = quest_generator.select_template(
            self.user_id, "academic", "daily", 55, model,
            {"base", "explore", "focus", "memory", "problem_solving", "critical", "research",
             "teaching"})
        self.assertLessEqual(low["tier"], high["tier"])

    def test_model_personalisation_is_validated_before_use(self):
        model = player.get_model(self.user_id)
        spec = quest_generator.render_template(
            catalog.TEMPLATES_BY_KEY["acad_focus_block"], model, 5, self.user_id)
        snapshot = player.snapshot(self.user_id)

        # An unsafe rewrite must be discarded.
        provider_mod.set_provider(FakeProvider(json_response={
            "title": "Skip meals and study all night",
            "description": "Pull an all nighter and skip breakfast to maximise study hours.",
            "difficulty": 2, "estimatedTime": 30,
            "completionCriteria": "stay awake", "evaluationCriteria": ["awake"],
        }))
        try:
            result = quest_generator.personalise(spec, model, 5, snapshot, [])
            self.assertEqual(result["title"], spec["title"])
            self.assertEqual(result["source"], "system")
        finally:
            provider_mod.set_provider(None)

        # A good rewrite is accepted and re-priced.
        provider_mod.set_provider(FakeProvider(json_response={
            "title": "Twenty focused minutes on integration by parts",
            "description": "One 20-minute block on integration by parts with no phone. "
                           "Write down the three steps you used when the timer stops.",
            "difficulty": 2, "estimatedTime": 25,
            "completionCriteria": "20 focused minutes plus your three steps",
            "evaluationCriteria": ["Names the technique", "Records the steps"],
        }))
        try:
            result = quest_generator.personalise(spec, model, 5, snapshot, [])
            self.assertEqual(result["source"], "ai")
            self.assertIn("integration", result["title"])
            self.assertEqual(result["estimatedTime"], 25)
        finally:
            provider_mod.set_provider(None)


class DifficultyEngineTests(unittest.TestCase):
    def test_success_rate_is_computed_over_recent_outcomes(self):
        self.assertEqual(difficulty.success_rate(["verified"] * 10), 1.0)
        self.assertEqual(
            difficulty.success_rate(["verified"] * 5 + ["needs_info"] * 5), 0.5)
        self.assertEqual(
            difficulty.success_rate(["verified"] * 4 + ["failed"] * 6), 0.4)

    def test_success_rate_needs_a_minimum_sample(self):
        self.assertIsNone(difficulty.success_rate(["verified"] * 3))
        self.assertIsNotNone(difficulty.success_rate(["verified"] * 5))

    def test_struggling_players_get_objectives_split(self):
        spec = {"title": "Big task", "description": "Do the whole thing", "difficulty": 4,
                "estimatedTime": 90}
        phases = difficulty.split_objective(spec)
        self.assertEqual(len(phases), 3)
        self.assertTrue(all(p["estimatedTime"] < spec["estimatedTime"] for p in phases))
        self.assertTrue(all(p["difficulty"] < spec["difficulty"] for p in phases))


class GuideTests(unittest.TestCase):
    def setUp(self):
        security.limiter.reset()
        self.client = Client()
        self.client.signup(unique("guide"))
        self.client.onboard()

    def test_intent_classification(self):
        cases = {
            "What should I do today?": "today",
            "Why am I not levelling up?": "stuck_level",
            "I'm struggling with this quest": "struggling",
            "Give me a harder challenge": "harder",
            "I want to explore a new passion": "explore",
            "What am I weakest at?": "weakest",
        }
        for message, expected in cases.items():
            self.assertEqual(guide.classify(message), expected, message)

    def test_guide_answers_every_suggested_question_without_a_model(self):
        questions = self.client.get("/api/guide")[1]["suggestedQuestions"]
        for question in questions:
            status, data = self.client.post("/api/guide/ask", {"message": question})
            self.assertEqual(status, 200, question)
            self.assertGreater(len(data["reply"]), 40, question)
            self.assertEqual(data["provider"], "local")

    def test_guide_redirects_unsafe_requests(self):
        status, data = self.client.post(
            "/api/guide/ask", {"message": "give me a quest to lose 5kg this week"})
        self.assertEqual(status, 200)
        self.assertEqual(data["provider"], "safety")
        self.assertIn("capability", data["reply"])

    def test_guide_uses_a_model_when_one_is_configured(self):
        fake = FakeProvider(text_response="Your academic line is the strongest at 12.")
        provider_mod.set_provider(fake)
        try:
            status, data = self.client.post("/api/guide/ask", {"message": "How am I doing?"})
            self.assertEqual(status, 200)
            self.assertEqual(data["provider"], "fake")
            self.assertIn("PLAYER BRIEFING", fake.text_calls[0]["prompt"])
        finally:
            provider_mod.set_provider(None)

    def test_unsafe_model_output_is_discarded(self):
        provider_mod.set_provider(FakeProvider(
            text_response="You should pull an all nighter and skip meals to catch up."))
        try:
            status, data = self.client.post("/api/guide/ask", {"message": "How do I catch up?"})
            self.assertEqual(data["provider"], "local")
        finally:
            provider_mod.set_provider(None)

    def test_conversation_is_persisted(self):
        self.client.post("/api/guide/ask", {"message": "What should I do today?"})
        history = self.client.get("/api/guide")[1]["history"]
        self.assertTrue(history)
        self.assertEqual(history[-1]["message"], "What should I do today?")


class ProviderTests(unittest.TestCase):
    def test_null_provider_returns_nothing_and_reports_itself(self):
        provider_mod.set_provider(None)
        provider = provider_mod.get_provider()
        self.assertFalse(provider.available)
        self.assertIsNone(provider.complete_json("s", "p", {}))
        self.assertIsNone(provider.complete_text("s", "p"))
        status = provider_mod.status()
        self.assertFalse(status["modelBacked"])
        self.assertIn("built-in", status["note"])

    def test_request_body_is_shaped_for_the_messages_api(self):
        anthropic = provider_mod.AnthropicProvider("test-key", "claude-opus-5",
                                                   "https://api.anthropic.com", 30)
        body = anthropic._base_body("system text", "prompt text", 500)
        self.assertEqual(body["model"], "claude-opus-5")
        self.assertEqual(body["max_tokens"], 500)
        self.assertEqual(body["messages"], [{"role": "user", "content": "prompt text"}])
        self.assertNotIn("temperature", body)     # removed on Opus-tier models
        self.assertNotIn("top_p", body)
        self.assertEqual(body["thinking"], {"type": "disabled"})

    def test_effort_stays_within_the_disabled_thinking_limit(self):
        self.assertIn(provider_mod._EFFORT, ("low", "medium", "high"))


if __name__ == "__main__":
    unittest.main()

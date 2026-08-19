"""Unit tests for the progression maths and anti-cheat rules."""

from __future__ import annotations

import unittest

from helpers import use_temp_database

use_temp_database()

from server import db  # noqa: E402
from server.game import anticheat, safety, skills as skills_mod, xp  # noqa: E402


class LevelCurveTests(unittest.TestCase):
    def test_matches_the_designed_opening_curve(self):
        self.assertEqual(xp.xp_for_next_level(1), 100)
        self.assertEqual(xp.xp_for_next_level(2), 150)
        self.assertAlmostEqual(xp.xp_for_next_level(3), 217, delta=6)

    def test_requirements_increase_monotonically(self):
        previous = 0
        for level in range(1, xp.MAX_LEVEL):
            requirement = xp.xp_for_next_level(level)
            self.assertGreater(requirement, previous,
                               f"level {level} is not harder than {level - 1}")
            previous = requirement

    def test_max_level_terminates(self):
        self.assertEqual(xp.xp_for_next_level(xp.MAX_LEVEL), 0)
        self.assertEqual(xp.level_for_xp(10 ** 9), xp.MAX_LEVEL)

    def test_early_levels_are_reachable_and_late_levels_are_not_grindable(self):
        # Level 10 should be a couple of weeks of real activity, not months.
        self.assertLess(xp.total_xp_for_level(10), 8_000)
        # Level 100 must represent months-to-years of sustained work.
        total = xp.total_xp_for_level(xp.MAX_LEVEL)
        self.assertGreater(total, 500_000)
        self.assertLess(total, 2_000_000)

    def test_level_lookup_round_trips(self):
        for level in (1, 2, 7, 25, 60, 99, 100):
            floor_xp = xp.total_xp_for_level(level)
            self.assertEqual(xp.level_for_xp(floor_xp), level)
            if level < xp.MAX_LEVEL:
                self.assertEqual(xp.level_for_xp(floor_xp + xp.xp_for_next_level(level) - 1), level)
                self.assertEqual(xp.level_for_xp(floor_xp + xp.xp_for_next_level(level)), level + 1)

    def test_progress_percentages_stay_in_range(self):
        for total in (0, 99, 100, 5_000, 250_000, 10 ** 7):
            progress = xp.level_progress(total)
            self.assertGreaterEqual(progress["percent"], 0)
            self.assertLessEqual(progress["percent"], 100)


class RewardTests(unittest.TestCase):
    def test_rewards_scale_with_difficulty_kind_and_level(self):
        easy = xp.quest_xp_reward(1, "daily", 1, 20)
        hard = xp.quest_xp_reward(4, "daily", 1, 20)
        self.assertGreater(hard, easy * 4)

        daily = xp.quest_xp_reward(3, "daily", 1, 45)
        weekly = xp.quest_xp_reward(3, "weekly", 1, 45)
        epic = xp.quest_xp_reward(5, "epic", 1, 600)
        self.assertGreater(weekly, daily)
        self.assertGreater(epic, weekly * 5)

        low_level = xp.quest_xp_reward(3, "daily", 1, 30)
        high_level = xp.quest_xp_reward(3, "daily", 50, 30)
        self.assertGreater(high_level, low_level * 3)

    def test_reward_matches_the_spec_examples(self):
        # "+5,000 Passion XP" for an epic, "+1,000" for a milestone, "+250" weekly.
        self.assertAlmostEqual(xp.quest_xp_reward(5, "epic", 1, 600), 5040, delta=400)
        self.assertAlmostEqual(xp.quest_xp_reward(4, "milestone", 1, 180), 1330, delta=400)
        self.assertAlmostEqual(xp.quest_xp_reward(3, "weekly", 1, 180), 288, delta=100)

    def test_duration_is_sublinear(self):
        short = xp.quest_xp_reward(3, "daily", 1, 30)
        long = xp.quest_xp_reward(3, "daily", 1, 240)
        self.assertLess(long, short * 3, "duration must not be a linear XP lever")

    def test_daily_cap_throttles_but_never_zeroes(self):
        cap = xp.daily_xp_cap(1)
        award, capped = xp.apply_daily_cap(cap, 100, 1)
        self.assertTrue(capped)
        self.assertGreater(award, 0)
        self.assertLess(award, 100)

    def test_milestone_and_epic_quests_bypass_the_cap(self):
        cap = xp.daily_xp_cap(1)
        award, capped = xp.apply_daily_cap(cap * 3, 1200, 1, "epic")
        self.assertFalse(capped)
        self.assertEqual(award, 1200)

    def test_attributes_are_bounded_and_monotonic(self):
        self.assertEqual(xp.attribute_value(0), 0)
        self.assertLessEqual(xp.attribute_value(10 ** 9), 100)
        self.assertLess(xp.attribute_value(1_000), xp.attribute_value(50_000))


class AntiCheatTests(unittest.TestCase):
    def test_repetition_multiplier_decays_but_has_a_floor(self):
        self.assertEqual(anticheat.repetition_multiplier(0), 1.0)
        values = [anticheat.repetition_multiplier(n) for n in range(0, 12)]
        self.assertTrue(all(a >= b for a, b in zip(values, values[1:])))
        self.assertGreaterEqual(values[-1], 0.15)

    def test_proof_digest_ignores_whitespace_and_case(self):
        a = anticheat.proof_digest({"text": "Ran   five KILOMETRES today"})
        b = anticheat.proof_digest({"text": "ran five kilometres today"})
        self.assertEqual(a, b)
        self.assertNotEqual(a, anticheat.proof_digest({"text": "Read a chapter of physics"}))

    def test_trivial_proof_produces_no_digest(self):
        self.assertEqual(anticheat.proof_digest({"text": "done"}), "")


class SafetyTests(unittest.TestCase):
    def test_flags_unsafe_requests(self):
        unsafe = [
            "lose 5kg before summer",
            "train until failure every day",
            "pull an all nighter to finish revision",
            "500 push-ups today",
            "get a six-pack in 30 days",
            "skip meals to cut weight",
        ]
        for text in unsafe:
            self.assertTrue(safety.scan(text), f"should have been flagged: {text}")
            self.assertIn("instead", safety.redirect_message(safety.scan(text)))

    def test_allows_ordinary_capability_goals(self):
        safe = [
            "walk for 25 minutes",
            "complete a mobility routine",
            "study integration for 40 minutes",
            "build a robot arm prototype and document it",
            "run 5k at a comfortable pace",
        ]
        for text in safe:
            self.assertFalse(safety.scan(text), f"false positive on: {text}")

    def test_youth_guard_adds_loading_restrictions(self):
        self.assertTrue(safety.youth_guard("heavy barbell deadlift session", "youth"))
        self.assertFalse(safety.youth_guard("heavy barbell deadlift session", "adult"))


class SkillTreeTests(unittest.TestCase):
    def test_every_prerequisite_exists_and_is_lower_tier(self):
        for skill in skills_mod.ALL_SKILLS:
            for requirement in skill["requires"]:
                self.assertIn(requirement, skills_mod.SKILLS_BY_KEY)
                self.assertLess(skills_mod.SKILLS_BY_KEY[requirement]["tier"], skill["tier"])

    def test_capabilities_gate_on_level(self):
        self.assertFalse(skills_mod.has_capability(29, "custom_quests"))
        self.assertTrue(skills_mod.has_capability(30, "custom_quests"))
        self.assertTrue(skills_mod.has_capability(100, "master_of_life"))

    def test_effects_aggregate(self):
        effects = skills_mod.aggregate_effects({"phys_foundation", "phys_recovery", "pass_explorer"})
        self.assertAlmostEqual(effects["xp_bonus"]["physical"], 0.08, places=3)
        self.assertEqual(effects["quest_slots"], 1)


if __name__ == "__main__":
    unittest.main()

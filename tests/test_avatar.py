"""Avatar catalog: unlock rules, validation, and client/server agreement."""

from __future__ import annotations

import itertools
import re
import unittest
from pathlib import Path

from helpers import Client, use_temp_database

use_temp_database()

from server import db, security  # noqa: E402
from server.game import avatar, player, ranks  # noqa: E402

db.init()
_counter = itertools.count(1)
AVATAR_JS = Path(__file__).resolve().parent.parent / "web" / "js" / "avatar.js"

# Which JS object literal backs each catalog slot.
SLOT_TO_JS = {
    "skinTone": "SKIN",
    "hair": "HAIR",
    "hairColor": "HAIR_COLOR",
    "eyes": "EYES",
    "mouth": "MOUTH",
    "outfit": "OUTFIT",
    "outfitColor": "OUTFIT_COLOR",
    "accessory": "ACCESSORY",
    "background": "BACKGROUND",
}


def js_keys(name: str) -> set[str]:
    """Top-level keys of a `const NAME = { ... };` object literal in avatar.js."""
    source = AVATAR_JS.read_text(encoding="utf-8")
    match = re.search(rf"const {name} = {{\n(.*?)\n}};", source, re.S)
    if match is None:
        raise AssertionError(f"{name} object literal not found in avatar.js")
    return set(re.findall(r"^  ([A-Za-z_][A-Za-z0-9_]*):", match.group(1), re.M))


class CatalogAgreementTests(unittest.TestCase):
    """The browser must be able to draw everything the server offers."""

    def test_every_server_option_has_client_drawing_code(self):
        for slot, js_name in SLOT_TO_JS.items():
            server_keys = {entry["key"] for entry in avatar.CATALOG[slot]}
            client_keys = js_keys(js_name)
            missing = server_keys - client_keys
            self.assertEqual(missing, set(),
                             f"{slot}: server offers options the client cannot draw: {missing}")

    def test_client_has_no_options_the_server_rejects(self):
        for slot, js_name in SLOT_TO_JS.items():
            server_keys = {entry["key"] for entry in avatar.CATALOG[slot]}
            extra = js_keys(js_name) - server_keys
            self.assertEqual(extra, set(),
                             f"{slot}: client can draw options the server would reject: {extra}")

    def test_defaults_are_valid_and_always_unlocked(self):
        for slot, key in avatar.DEFAULT_AVATAR.items():
            entry = next((e for e in avatar.CATALOG[slot] if e["key"] == key), None)
            self.assertIsNotNone(entry, f"default for {slot} is not in the catalog")
            self.assertTrue(avatar.is_unlocked(entry, 1, {}),
                            f"default for {slot} is locked at level 1")


class UnlockPolicyTests(unittest.TestCase):
    def test_identity_options_are_never_gated(self):
        """Skin tone, base hair, eyes and expressions must never be earned."""
        for slot in ("skinTone", "eyes", "mouth"):
            for entry in avatar.CATALOG[slot]:
                self.assertNotIn("level", entry, f"{slot}/{entry['key']} is level-gated")
                self.assertNotIn("domain", entry, f"{slot}/{entry['key']} is quest-gated")

        # Every hairstyle representing a real-world look is available immediately.
        always_available = {"bald", "buzz", "short", "wavy", "curls", "afro",
                            "long", "ponytail", "bun", "braids", "locs", "hijab"}
        for entry in avatar.CATALOG["hair"]:
            if entry["key"] in always_available:
                self.assertNotIn("level", entry, f"hair/{entry['key']} should not be gated")

        # Natural hair colours too; only unnatural ones are rewards.
        natural = {"noir", "espresso", "chestnut", "auburn", "ginger", "honey",
                   "platinum", "silver"}
        for entry in avatar.CATALOG["hairColor"]:
            if entry["key"] in natural:
                self.assertNotIn("level", entry, f"hairColor/{entry['key']} should not be gated")

    def test_locked_options_report_how_to_unlock(self):
        for entries in avatar.CATALOG.values():
            for entry in entries:
                if "level" in entry or "domain" in entry:
                    self.assertTrue(avatar.unlock_hint(entry))

    def test_sanitise_rejects_locked_choices(self):
        cleaned = avatar.sanitise({"outfit": "armor", "accessory": "visor", "hairColor": "violet"},
                                  1, {"physical": 0, "academic": 0, "passion": 0})
        self.assertEqual(cleaned["outfit"], avatar.DEFAULT_AVATAR["outfit"])
        self.assertEqual(cleaned["accessory"], avatar.DEFAULT_AVATAR["accessory"])
        self.assertEqual(cleaned["hairColor"], avatar.DEFAULT_AVATAR["hairColor"])

    def test_sanitise_accepts_unlocked_choices(self):
        cleaned = avatar.sanitise({"outfit": "armor", "accessory": "visor", "hairColor": "violet"},
                                  60, {"physical": 0, "academic": 0, "passion": 0})
        self.assertEqual(cleaned["outfit"], "armor")
        self.assertEqual(cleaned["accessory"], "visor")
        self.assertEqual(cleaned["hairColor"], "violet")

    def test_domain_outfits_unlock_from_real_work(self):
        counts = {"physical": 10, "academic": 0, "passion": 0}
        self.assertEqual(avatar.sanitise({"outfit": "athlete"}, 1, counts)["outfit"], "athlete")
        self.assertEqual(avatar.sanitise({"outfit": "labcoat"}, 1, counts)["outfit"],
                         avatar.DEFAULT_AVATAR["outfit"])

    def test_garbage_input_falls_back_to_defaults(self):
        for junk in (None, "hello", 42, [], {"hair": {"nested": True}}, {"hair": "<script>"}):
            cleaned = avatar.sanitise(junk, 50, {})
            self.assertEqual(set(cleaned), set(avatar.CATALOG))
            for slot, key in cleaned.items():
                self.assertIn(key, [e["key"] for e in avatar.CATALOG[slot]])

    def test_corrupt_stored_avatar_loads_defaults(self):
        self.assertEqual(avatar.load(None), avatar.DEFAULT_AVATAR)
        self.assertEqual(avatar.load("not json"), avatar.DEFAULT_AVATAR)
        self.assertEqual(avatar.load('"a string"'), avatar.DEFAULT_AVATAR)
        merged = avatar.load('{"hair": "afro", "outfit": "nonsense"}')
        self.assertEqual(merged["hair"], "afro")
        self.assertEqual(merged["outfit"], avatar.DEFAULT_AVATAR["outfit"])


class RankTierTests(unittest.TestCase):
    def test_tiers_cover_every_level_without_gaps(self):
        seen = []
        for level in range(1, 101):
            tier = ranks.tier_for_level(level)
            self.assertIn(tier["key"], [t["key"] for t in ranks.TIERS])
            self.assertIn(tier["division"], ranks.DIVISIONS)
            seen.append(tier["key"])
        # Tiers only ever move forward as level rises.
        order = [t["key"] for t in ranks.TIERS]
        indices = [order.index(key) for key in seen]
        self.assertEqual(indices, sorted(indices))

    def test_tier_progress_and_next_target(self):
        self.assertEqual(ranks.tier_for_level(1)["name"], "Iron")
        self.assertEqual(ranks.tier_for_level(100)["name"], "Legend")
        self.assertIsNone(ranks.tier_for_level(100)["next"])
        bronze = ranks.tier_for_level(5)
        self.assertEqual(bronze["next"]["name"], "Silver")
        self.assertEqual(bronze["next"]["levelsAway"], 10)

    def test_ladder_ranges_are_contiguous(self):
        rungs = ranks.ladder()
        for lower, upper in zip(rungs, rungs[1:]):
            self.assertEqual(lower["maxLevel"] + 1, upper["minLevel"])


class AvatarApiTests(unittest.TestCase):
    def setUp(self):
        security.limiter.reset()
        self.client = Client()
        self.client.signup(f"avatar{next(_counter)}")
        self.client.onboard()

    def test_options_report_unlock_state(self):
        status, data = self.client.get("/api/player/avatar")
        self.assertEqual(status, 200)
        slots = {slot["slot"]: slot for slot in data["slots"]}
        self.assertEqual(set(slots), set(avatar.CATALOG))
        armor = next(o for o in slots["outfit"]["options"] if o["key"] == "armor")
        self.assertFalse(armor["unlocked"])
        self.assertIn("level 50", armor["hint"])
        tee = next(o for o in slots["outfit"]["options"] if o["key"] == "tee")
        self.assertTrue(tee["unlocked"])

    def test_saving_an_avatar_round_trips(self):
        status, data = self.client.patch("/api/player/avatar", {
            "avatar": {"skinTone": "skin7", "hair": "afro", "hairColor": "noir",
                       "eyes": "bright", "mouth": "grin", "outfit": "hoodie",
                       "outfitColor": "orchid", "accessory": "glasses", "background": "dusk"},
        })
        self.assertEqual(status, 200)
        self.assertEqual(data["avatar"]["hair"], "afro")
        self.assertEqual(data["avatar"]["skinTone"], "skin7")
        self.assertEqual(data["snapshot"]["avatar"]["hair"], "afro")

        status, again = self.client.get("/api/player/avatar")
        self.assertEqual(again["avatar"]["outfitColor"], "orchid")

    def test_locked_cosmetics_cannot_be_equipped_through_the_api(self):
        status, data = self.client.patch("/api/player/avatar", {"avatar": {"outfit": "armor"}})
        self.assertEqual(status, 200)
        self.assertEqual(data["avatar"]["outfit"], avatar.DEFAULT_AVATAR["outfit"])

    def test_snapshot_carries_avatar_and_tier(self):
        status, data = self.client.get("/api/player")
        self.assertIn("avatar", data["snapshot"])
        self.assertEqual(data["snapshot"]["tier"]["name"], "Iron")


class RankingsApiTests(unittest.TestCase):
    def setUp(self):
        security.limiter.reset()
        self.client = Client()
        self.name = f"rank{next(_counter)}"
        self.client.signup(self.name)
        self.client.onboard()
        self.user_id = int(db.query_one("SELECT id FROM users WHERE username=?",
                                        (self.name,))["id"])

    def test_solo_player_still_has_a_standing(self):
        status, data = self.client.get("/api/rankings")
        self.assertEqual(status, 200)
        self.assertEqual(data["standing"]["tier"]["name"], "Iron")
        self.assertGreaterEqual(data["standing"]["players"], 1)
        self.assertIsNotNone(data["standing"]["rank"])
        self.assertEqual(len(data["standing"]["ladder"]), len(ranks.TIERS))

    def test_boards_cover_every_dimension(self):
        status, data = self.client.get("/api/rankings")
        for board in ("overall", "weekly", "streak", "consistency",
                      "physical", "academic", "passion"):
            self.assertIn(board, data["boards"], board)
            self.assertIn("entries", data["boards"][board])

    def test_higher_xp_ranks_higher(self):
        rival = Client()
        rival_name = f"rank{next(_counter)}"
        rival.signup(rival_name)
        rival.onboard()
        rival_id = int(db.query_one("SELECT id FROM users WHERE username=?",
                                    (rival_name,))["id"])
        player.award_xp(rival_id, "academic", 5000, "test:seed")
        player.refresh_derived(rival_id)

        status, data = self.client.get("/api/rankings")
        overall = data["boards"]["overall"]["entries"]
        names = [entry["name"] for entry in overall]
        self.assertLess(names.index(rival_name), names.index(self.name))
        self.assertEqual(overall[0]["rank"], 1)

    def test_opting_out_hides_you_from_other_players(self):
        hidden = Client()
        hidden_name = f"rank{next(_counter)}"
        hidden.signup(hidden_name)
        hidden.onboard()
        hidden.patch("/api/player/preferences", {"leaderboard": False})

        status, data = self.client.get("/api/rankings")
        names = [entry["name"] for entry in data["boards"]["overall"]["entries"]]
        self.assertNotIn(hidden_name, names)

        # ...but they still see themselves.
        status, own = hidden.get("/api/rankings")
        own_names = [entry["name"] for entry in own["boards"]["overall"]["entries"]]
        self.assertIn(hidden_name, own_names)
        self.assertFalse(own["listed"])

    def test_leaderboard_marks_the_viewer(self):
        status, data = self.client.get("/api/rankings")
        viewer = [e for e in data["boards"]["overall"]["entries"] if e["isViewer"]]
        self.assertEqual(len(viewer), 1)
        self.assertEqual(viewer[0]["name"], self.name)


class MigrationTests(unittest.TestCase):
    def test_avatar_column_is_added_to_existing_databases(self):
        columns = {row["name"] for row in db.query("PRAGMA table_info(player_model)")}
        self.assertIn("avatar", columns)


if __name__ == "__main__":
    unittest.main()

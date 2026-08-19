import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

from helpers import use_temp_database  # noqa: E402

use_temp_database()

from server import db  # noqa: E402
from server.game import avatar, ranks  # noqa: E402

db.init()

for level in (1, 4, 5, 14, 15, 29, 30, 49, 50, 69, 70, 89, 90, 100):
    tier = ranks.tier_for_level(level)
    nxt = tier["next"]["name"] if tier["next"] else "-"
    print(f'L{level:>3} -> {tier["label"]:<13} {tier["progress"]:>5}%  next={nxt}')

print()
print("catalog slots:", list(avatar.CATALOG))
print("total options:", sum(len(v) for v in avatar.CATALOG.values()))
summary = avatar.unlock_summary(1, {"physical": 0, "academic": 0, "passion": 0})
print("unlocked at L1:", summary["unlocked"], "/", summary["total"])
print("next unlocks:", [(u["label"], u["hint"]) for u in summary["next"]])
print("armor at L1 ->", avatar.sanitise({"outfit": "armor", "hair": "mohawk"}, 1, {})["outfit"])
print("armor at L60 ->", avatar.sanitise({"outfit": "armor"}, 60, {})["outfit"])

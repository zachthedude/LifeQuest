#!/usr/bin/env python3
"""LifeQuest entry point.

    python run.py

No third-party packages are required. Configuration comes from the environment
or a .env file — see .env.example.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from server.app import serve_forever  # noqa: E402

if __name__ == "__main__":
    serve_forever()

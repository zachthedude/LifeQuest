"""Runtime configuration. Everything sensitive comes from the environment."""

from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _load_dotenv() -> None:
    """Minimal .env loader so `python run.py` works without extra tooling."""
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for raw in env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


_load_dotenv()


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


HOST = os.environ.get("LIFEQUEST_HOST", "127.0.0.1")
PORT = _int("LIFEQUEST_PORT", 8770)

DATABASE_URL = os.environ.get("DATABASE_URL", str(ROOT / "data" / "lifequest.db"))
UPLOAD_DIR = Path(os.environ.get("LIFEQUEST_UPLOAD_DIR", str(ROOT / "data" / "uploads")))
WEB_DIR = ROOT / "web"

SESSION_DAYS = _int("LIFEQUEST_SESSION_DAYS", 30)
MAX_UPLOAD_BYTES = _int("LIFEQUEST_MAX_UPLOAD_BYTES", 8 * 1024 * 1024)
MAX_BODY_BYTES = _int("LIFEQUEST_MAX_BODY_BYTES", 12 * 1024 * 1024)

# --- AI configuration -------------------------------------------------------
# With no key set the app runs on the deterministic local provider: every AI
# feature still works, it simply reasons with rules instead of a model.
AI_API_KEY = os.environ.get("AI_API_KEY") or os.environ.get("ANTHROPIC_API_KEY") or ""
AI_MODEL = os.environ.get("AI_MODEL", "claude-opus-5")
AI_BASE_URL = os.environ.get("AI_BASE_URL", "https://api.anthropic.com")
AI_TIMEOUT = _int("AI_TIMEOUT_SECONDS", 45)
AI_ENABLED = os.environ.get("AI_ENABLED", "1") not in ("0", "false", "False")

# auto | anthropic | ollama | none. `auto` prefers a hosted key when one is set,
# then a running Ollama, then the built-in engine.
AI_PROVIDER = os.environ.get("AI_PROVIDER", "auto").strip().lower() or "auto"

# --- Ollama -----------------------------------------------------------------
# A local model needs no key and sends nothing off the machine. The timeout is
# separate from the hosted one because a mid-size model on CPU is slow, and
# cutting it off at 45s would throw away answers that were nearly finished.
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen2.5:latest")
OLLAMA_TIMEOUT = _int("OLLAMA_TIMEOUT_SECONDS", 180)
# How long Ollama holds the weights in memory after a call. Long enough that a
# session of play never pays the load cost twice; "0" frees the RAM immediately.
OLLAMA_KEEP_ALIVE = os.environ.get("OLLAMA_KEEP_ALIVE", "15m")
OLLAMA_WARM = os.environ.get("OLLAMA_WARM", "1") not in ("0", "false", "False")

DEV_MODE = os.environ.get("LIFEQUEST_DEV", "0") in ("1", "true", "True")


def ensure_dirs() -> None:
    Path(DATABASE_URL).parent.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

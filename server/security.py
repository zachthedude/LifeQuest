"""Authentication, session management, rate limiting and input validation (§48)."""

from __future__ import annotations

import hashlib
import hmac
import os
import re
import secrets
import threading
import time
import unicodedata
from datetime import datetime, timedelta, timezone

from . import config, db

PBKDF2_ITERATIONS = 260_000
SESSION_COOKIE = "lq_session"
CSRF_HEADER = "x-lifequest-csrf"

USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,24}$")


# ------------------------------------------------------------------ hashing --
def hash_password(password: str, salt: str | None = None) -> tuple[str, str]:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), PBKDF2_ITERATIONS)
    return digest.hex(), salt


def verify_password(password: str, expected_hash: str, salt: str) -> bool:
    candidate, _ = hash_password(password, salt)
    return hmac.compare_digest(candidate, expected_hash)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


# ----------------------------------------------------------------- sessions --
def create_session(user_id: int) -> tuple[str, str]:
    token = secrets.token_urlsafe(32)
    csrf = secrets.token_urlsafe(24)
    now = datetime.now(timezone.utc)
    expires = now + timedelta(days=config.SESSION_DAYS)
    db.execute(
        """INSERT INTO sessions (token_hash, user_id, csrf_token, created_at, expires_at)
           VALUES (?,?,?,?,?)""",
        (_hash_token(token), user_id, csrf,
         now.strftime("%Y-%m-%d %H:%M:%S"), expires.strftime("%Y-%m-%d %H:%M:%S")),
    )
    return token, csrf


# --------------------------------------------------------------- recovery --
# How long a recovery code is good for. Short, because the code is printed where
# the person running the server can read it — there is no inbox for it to sit in.
RESET_MINUTES = 15

# No O/0, no I/1, no U (which people hear as V when reading a code aloud). A
# recovery code is going to be copied by hand off a terminal at least once.
RESET_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTVWXYZ"


def create_reset_code(user_id: int) -> str:
    """Mint a single-use recovery code. Only its hash is stored.

    Any code already outstanding for this player is dropped first, so asking
    twice does not leave two working codes behind.
    """
    db.execute("DELETE FROM password_resets WHERE user_id=?", (user_id,))
    groups = ["".join(secrets.choice(RESET_ALPHABET) for _ in range(4)) for _ in range(3)]
    code = "LQ-" + "-".join(groups)
    now = datetime.now(timezone.utc)
    db.execute(
        """INSERT INTO password_resets (code_hash, user_id, created_at, expires_at)
           VALUES (?,?,?,?)""",
        (_hash_token(code), user_id,
         now.strftime("%Y-%m-%d %H:%M:%S"),
         (now + timedelta(minutes=RESET_MINUTES)).strftime("%Y-%m-%d %H:%M:%S")),
    )
    return code


def consume_reset_code(username: str, code: str) -> int | None:
    """Return the user id a live code belongs to, and spend it. None otherwise.

    The username is checked against the code's owner so a code cannot be used
    against a different account, and the row is marked used in the same call —
    there is no window in which a caller holds a verified but unspent code.
    """
    normalised = (code or "").strip().upper().replace(" ", "")
    if not normalised:
        return None
    row = db.query_one(
        """SELECT r.user_id, r.expires_at, r.used_at, u.username
             FROM password_resets r JOIN users u ON u.id = r.user_id
            WHERE r.code_hash=?""",
        (_hash_token(normalised),),
    )
    if row is None or row["used_at"] is not None:
        return None
    if (row["username"] or "").lower() != (username or "").strip().lower():
        return None
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    if row["expires_at"] < now:
        return None
    db.execute("UPDATE password_resets SET used_at=? WHERE code_hash=?",
               (now, _hash_token(normalised)))
    return int(row["user_id"])


def set_password(user_id: int, password: str) -> None:
    """Replace a password and cut every session loose.

    Signing the old sessions out is the point of the exercise: someone resetting
    a password may be doing it because another browser is signed in as them.
    """
    password_hash, salt = hash_password(password)
    db.execute("UPDATE users SET password_hash=?, password_salt=? WHERE id=?",
               (password_hash, salt, user_id))
    db.execute("DELETE FROM sessions WHERE user_id=?", (user_id,))


def purge_expired_resets() -> None:
    db.execute("DELETE FROM password_resets WHERE expires_at < ?",
               (datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),))


def resolve_session(token: str | None) -> dict | None:
    if not token:
        return None
    row = db.query_one(
        """SELECT s.user_id, s.csrf_token, s.expires_at, u.username, u.onboarded, u.preferences
             FROM sessions s JOIN users u ON u.id = s.user_id
            WHERE s.token_hash = ?""",
        (_hash_token(token),),
    )
    if row is None:
        return None
    try:
        expires = datetime.strptime(row["expires_at"], "%Y-%m-%d %H:%M:%S").replace(
            tzinfo=timezone.utc)
    except ValueError:
        return None
    if expires < datetime.now(timezone.utc):
        db.execute("DELETE FROM sessions WHERE token_hash=?", (_hash_token(token),))
        return None
    return {
        "userId": int(row["user_id"]),
        "csrf": row["csrf_token"],
        "username": row["username"],
        "onboarded": bool(row["onboarded"]),
    }


def destroy_session(token: str | None) -> None:
    if token:
        db.execute("DELETE FROM sessions WHERE token_hash=?", (_hash_token(token),))


def purge_expired_sessions() -> None:
    db.execute("DELETE FROM sessions WHERE expires_at < ?",
               (datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),))


# ------------------------------------------------------------- rate limiting --
class RateLimiter:
    """In-process sliding-window limiter, keyed by identity + bucket."""

    def __init__(self) -> None:
        self._hits: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def check(self, key: str, limit: int, window_seconds: int) -> tuple[bool, int]:
        now = time.monotonic()
        with self._lock:
            entries = [t for t in self._hits.get(key, []) if now - t < window_seconds]
            if len(entries) >= limit:
                retry = int(window_seconds - (now - entries[0])) + 1
                self._hits[key] = entries
                return False, retry
            entries.append(now)
            self._hits[key] = entries
            if len(self._hits) > 4000:  # bound memory
                cutoff = now - 3600
                self._hits = {
                    k: [t for t in v if t > cutoff]
                    for k, v in self._hits.items() if any(t > cutoff for t in v)
                }
            return True, 0

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


limiter = RateLimiter()

LIMITS = {
    "auth": (10, 300),        # 10 login/signup attempts per 5 minutes
    "ai": (40, 300),          # AI-backed endpoints
    "submit": (30, 600),      # proof submissions
    "write": (240, 60),       # general writes
    "read": (600, 60),
}


def rate_limit(bucket: str, identity: str) -> tuple[bool, int]:
    limit, window = LIMITS.get(bucket, LIMITS["read"])
    return limiter.check(f"{bucket}:{identity}", limit, window)


# -------------------------------------------------------------- validation --
def clean_text(value, max_length: int = 2000) -> str:
    """Normalise and strip control characters. Output is stored/echoed as data,
    never as markup — the frontend renders through textContent."""
    if value is None:
        return ""
    text = str(value)
    text = unicodedata.normalize("NFKC", text)
    text = "".join(ch for ch in text if ch == "\n" or ch == "\t" or ord(ch) >= 32)
    return text.strip()[:max_length]


def valid_username(username: str) -> bool:
    return bool(USERNAME_RE.match(username or ""))


def password_problem(password: str) -> str | None:
    if not password or len(password) < 8:
        return "Password must be at least 8 characters."
    if len(password) > 200:
        return "Password is too long."
    if password.lower() in ("password", "12345678", "lifequest", "qwertyui"):
        return "Choose a less predictable password."
    return None


def safe_url(value: str) -> str:
    """Only http/https links are accepted; everything else is rejected."""
    url = clean_text(value, 500)
    if not url:
        return ""
    if not re.match(r"^https?://[^\s<>\"']+$", url, re.IGNORECASE):
        return ""
    return url


SAFE_FILENAME_RE = re.compile(r"[^A-Za-z0-9._-]")
ALLOWED_UPLOAD_TYPES = {
    "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif",
    "application/pdf": ".pdf", "text/plain": ".txt", "text/markdown": ".md",
    # Recorded on the spot through the camera. WebM is what Chrome and Firefox
    # produce from MediaRecorder; Safari produces MP4.
    "video/webm": ".webm", "video/mp4": ".mp4", "video/quicktime": ".mov",
}
VIDEO_TYPES = {"video/webm", "video/mp4", "video/quicktime"}


def upload_limit_for(content_type: str) -> int:
    normalised = (content_type or "").split(";")[0].strip().lower()
    return config.MAX_VIDEO_BYTES if normalised in VIDEO_TYPES else config.MAX_UPLOAD_BYTES


def store_upload(user_id: int, filename: str, content_type: str, data: bytes) -> dict | None:
    """Write an upload to disk under a generated name. Returns metadata or None."""
    if len(data) > upload_limit_for(content_type):
        return None
    extension = ALLOWED_UPLOAD_TYPES.get((content_type or "").split(";")[0].strip().lower())
    if extension is None:
        return None
    safe_original = SAFE_FILENAME_RE.sub("_", os.path.basename(filename or "file"))[:60]
    token = secrets.token_hex(12)
    stored_name = f"{user_id}_{token}{extension}"
    path = config.UPLOAD_DIR / stored_name
    path.write_bytes(data)
    return {
        "id": stored_name,
        "name": safe_original,
        "size": len(data),
        "contentType": content_type.split(";")[0].strip().lower(),
        "url": f"/api/uploads/{stored_name}",
    }


def upload_path_for(user_id: int, stored_name: str):
    """Resolve an upload path, refusing anything outside the upload directory
    or belonging to another user."""
    if SAFE_FILENAME_RE.sub("_", stored_name) != stored_name:
        return None
    if not stored_name.startswith(f"{user_id}_"):
        return None
    candidate = (config.UPLOAD_DIR / stored_name).resolve()
    root = config.UPLOAD_DIR.resolve()
    if root not in candidate.parents:
        return None
    if not candidate.is_file():
        return None
    return candidate

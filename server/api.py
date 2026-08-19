"""REST API. Every mutation is validated, rate limited and CSRF protected."""

from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from email.parser import BytesParser
from email.policy import default as email_policy

from . import config, db, security
from .ai import analyst, guide as guide_mod, provider as provider_mod
from .game import achievements as achievements_mod
from .game import player, quests as quests_mod, ranks
from .game import skills as skills_mod
from .game import xp as xp_mod
from .routing import HttpError, Request, Response, Router

router = Router()


# ------------------------------------------------------------------ helpers --
def _session(request: Request) -> dict:
    if not request.session:
        raise HttpError(401, "unauthenticated", "Sign in to continue.")
    return request.session


def _user_id(request: Request) -> int:
    return _session(request)["userId"]


def _require_onboarded(request: Request) -> int:
    session = _session(request)
    if not session.get("onboarded"):
        raise HttpError(409, "onboarding_required", "Finish onboarding first.")
    return session["userId"]


def _body(request: Request) -> dict:
    return request.json()


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def _session_cookie(token: str, max_age: int) -> str:
    return (f"{security.SESSION_COOKIE}={token}; Path=/; HttpOnly; SameSite=Lax; "
            f"Max-Age={max_age}")


def _auth_payload(request: Request, user_id: int, username: str, csrf: str,
                  onboarded: bool) -> dict:
    return {
        "user": {"id": user_id, "username": username, "onboarded": onboarded},
        "csrfToken": csrf,
        "ai": provider_mod.status(),
    }


# --------------------------------------------------------------------- auth --
@router.post("/api/auth/signup", auth=False, bucket="auth")
def signup(request: Request) -> Response:
    data = _body(request)
    username = security.clean_text(data.get("username"), 24)
    password = str(data.get("password") or "")

    if not security.valid_username(username):
        raise HttpError(400, "invalid_username",
                        "Usernames are 3-24 characters: letters, numbers, . _ - only.")
    problem = security.password_problem(password)
    if problem:
        raise HttpError(400, "invalid_password", problem)

    existing = db.query_one("SELECT id FROM users WHERE username = ? COLLATE NOCASE", (username,))
    if existing:
        raise HttpError(409, "username_taken", "That username is already taken.")

    password_hash, salt = security.hash_password(password)
    user_id = db.insert(
        """INSERT INTO users (username, password_hash, password_salt, created_at, preferences)
           VALUES (?,?,?,?,?)""",
        (username, password_hash, salt, _now(),
         json.dumps({"sound": True, "reducedMotion": False, "notifications": True})),
    )
    player.create_profile(user_id)
    token, csrf = security.create_session(user_id)
    payload = _auth_payload(request, user_id, username, csrf, False)
    return Response.json(payload, status=201, headers={
        "set-cookie": _session_cookie(token, config.SESSION_DAYS * 86400)})


@router.post("/api/auth/login", auth=False, bucket="auth")
def login(request: Request) -> Response:
    data = _body(request)
    username = security.clean_text(data.get("username"), 24)
    password = str(data.get("password") or "")

    row = db.query_one(
        "SELECT id, username, password_hash, password_salt, onboarded FROM users "
        "WHERE username = ? COLLATE NOCASE",
        (username,),
    )
    if row is None or not security.verify_password(password, row["password_hash"],
                                                   row["password_salt"]):
        # Identical response for unknown user and wrong password.
        raise HttpError(401, "invalid_credentials", "Incorrect username or password.")

    token, csrf = security.create_session(int(row["id"]))
    payload = _auth_payload(request, int(row["id"]), row["username"], csrf,
                            bool(row["onboarded"]))
    return Response.json(payload, headers={
        "set-cookie": _session_cookie(token, config.SESSION_DAYS * 86400)})


@router.post("/api/auth/logout", auth=False, bucket="write")
def logout(request: Request) -> Response:
    token = request.cookies.get(security.SESSION_COOKIE)
    security.destroy_session(token)
    return Response.json({"ok": True}, headers={
        "set-cookie": f"{security.SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"})


@router.get("/api/auth/me", auth=False, bucket="read")
def me(request: Request) -> Response:
    if not request.session:
        return Response.json({"user": None, "ai": provider_mod.status()})
    session = request.session
    return Response.json(_auth_payload(
        request, session["userId"], session["username"], session["csrf"],
        session.get("onboarded", False)))


# --------------------------------------------------------------- onboarding --
@router.post("/api/onboarding", bucket="write")
def onboarding(request: Request) -> Response:
    user_id = _user_id(request)
    data = _body(request)

    def _list(key: str) -> list[str]:
        raw = data.get(key) or []
        if isinstance(raw, str):
            raw = [part.strip() for part in raw.split(",")]
        return [security.clean_text(item, 60) for item in raw if security.clean_text(item, 60)][:10]

    age_band = data.get("ageBand") if data.get("ageBand") in ("youth", "teen", "adult") else "adult"
    activity = data.get("activityLevel")
    if activity not in ("low", "moderate", "high"):
        activity = "moderate"

    player.save_model(user_id, {
        "display_name": security.clean_text(data.get("displayName"), 40),
        "age_band": age_band,
        "activity_level": activity,
        "minutes_per_day": data.get("minutesPerDay", 45),
        "academic_subjects": _list("academicSubjects"),
        "passion_interests": _list("passionInterests"),
        "passion_curious": _list("passionCurious"),
        "physical_activities": _list("physicalActivities"),
        "existing_skills": _list("existingSkills"),
        "short_term_goals": security.clean_text(data.get("shortTermGoals"), 400),
        "long_term_goals": security.clean_text(data.get("longTermGoals"), 400),
    })

    for name in _list("passionCurious")[:5]:
        db.execute(
            """INSERT INTO passion_paths (user_id, name, status, interest_score, sessions,
                                          created_at, updated_at)
               VALUES (?,?,'exploring',0.5,0,?,?)""",
            (user_id, name, _now(), _now()),
        )

    db.execute("UPDATE users SET onboarded=1 WHERE id=?", (user_id,))
    created = quests_mod.starter_quests(user_id)
    request.session["onboarded"] = True

    return Response.json({
        "ok": True,
        "quests": [q for q in created if q],
        "snapshot": player.snapshot(user_id),
        "model": player.get_model(user_id),
    }, status=201)


# ------------------------------------------------------------------- player --
@router.get("/api/player", bucket="read")
def get_player(request: Request) -> Response:
    user_id = _user_id(request)
    quests_mod.expire_stale(user_id)
    snapshot = player.snapshot(user_id)
    model = player.get_model(user_id)
    row = db.query_one("SELECT preferences, username, created_at FROM users WHERE id=?", (user_id,))
    return Response.json({
        "snapshot": snapshot,
        "model": model,
        "username": row["username"] if row else "",
        "memberSince": row["created_at"] if row else None,
        "preferences": json.loads(row["preferences"] or "{}") if row else {},
        "ai": provider_mod.status(),
        "curve": xp_mod.curve_summary(),
    })


@router.patch("/api/player/model", bucket="write")
def patch_model(request: Request) -> Response:
    user_id = _require_onboarded(request)
    data = _body(request)
    updates: dict = {}
    mapping = {
        "displayName": "display_name", "ageBand": "age_band",
        "activityLevel": "activity_level", "minutesPerDay": "minutes_per_day",
        "academicSubjects": "academic_subjects", "passionInterests": "passion_interests",
        "passionCurious": "passion_curious", "physicalActivities": "physical_activities",
        "existingSkills": "existing_skills", "shortTermGoals": "short_term_goals",
        "longTermGoals": "long_term_goals",
    }
    for incoming, column in mapping.items():
        if incoming in data:
            value = data[incoming]
            if isinstance(value, list):
                updates[column] = [security.clean_text(v, 60) for v in value][:12]
            elif column == "minutes_per_day":
                updates[column] = value
            else:
                updates[column] = security.clean_text(value, 400)
    model = player.save_model(user_id, updates)
    return Response.json({"model": model})


@router.patch("/api/player/preferences", bucket="write")
def patch_preferences(request: Request) -> Response:
    user_id = _user_id(request)
    data = _body(request)
    row = db.query_one("SELECT preferences FROM users WHERE id=?", (user_id,))
    current = json.loads(row["preferences"] or "{}") if row else {}
    for key in ("sound", "reducedMotion", "notifications", "highContrast", "leaderboard"):
        if key in data:
            current[key] = bool(data[key])
    # Theme is the one preference that is not a switch. Anything else is
    # rejected rather than stored, so a bad value can never reach the palette.
    if "theme" in data and data["theme"] in ("light", "dark", "auto"):
        current["theme"] = data["theme"]
    db.execute("UPDATE users SET preferences=? WHERE id=?", (json.dumps(current), user_id))
    return Response.json({"preferences": current})


@router.get("/api/player/avatar", bucket="read")
def get_avatar(request: Request) -> Response:
    user_id = _user_id(request)
    return Response.json(player.avatar_options(user_id))


@router.patch("/api/player/avatar", bucket="write")
def patch_avatar(request: Request) -> Response:
    user_id = _require_onboarded(request)
    data = _body(request)
    incoming = data.get("avatar") if isinstance(data.get("avatar"), dict) else data
    # Anything unknown or still locked is replaced with the slot default, so a
    # crafted request cannot equip cosmetics the player has not earned.
    saved = player.save_avatar(user_id, incoming)
    return Response.json({"avatar": saved, "snapshot": player.snapshot(user_id)})


@router.get("/api/rankings", bucket="read")
def get_rankings(request: Request) -> Response:
    user_id = _user_id(request)
    profile = player.get_profile(user_id)
    row = db.query_one("SELECT preferences FROM users WHERE id=?", (user_id,))
    preferences = json.loads(row["preferences"] or "{}") if row else {}
    return Response.json({
        "standing": ranks.viewer_standing(user_id, profile),
        "boards": ranks.leaderboards(user_id),
        "listed": bool(preferences.get("leaderboard", True)),
        "snapshot": player.snapshot(user_id),
    })


@router.get("/api/player/skills", bucket="read")
def get_skills(request: Request) -> Response:
    user_id = _user_id(request)
    snapshot = player.snapshot(user_id)
    counts = player.domain_quest_counts(user_id)
    return Response.json({
        "tree": skills_mod.tree_for_user(user_id, snapshot["level"], counts),
        "milestones": skills_mod.LEVEL_MILESTONES,
        "level": snapshot["level"],
        "unlockedMilestones": [m["key"] for m in skills_mod.unlocked_milestones(snapshot["level"])],
    })


@router.get("/api/player/achievements", bucket="read")
def get_achievements(request: Request) -> Response:
    user_id = _user_id(request)
    items = achievements_mod.for_user(user_id)
    return Response.json({
        "achievements": items,
        "unlocked": sum(1 for a in items if a["unlocked"]),
        "total": len(items),
    })


@router.get("/api/player/progress", bucket="read")
def get_progress(request: Request) -> Response:
    user_id = _user_id(request)
    profile = player.get_profile(user_id)
    report = analyst.full_report(user_id, profile)
    report["snapshot"] = player.snapshot(user_id)
    return Response.json(report)


@router.get("/api/player/notifications", bucket="read")
def get_notifications(request: Request) -> Response:
    user_id = _user_id(request)
    rows = db.query(
        "SELECT id, kind, body, read, created_at FROM notifications "
        "WHERE user_id=? ORDER BY id DESC LIMIT 40", (user_id,))
    return Response.json({"notifications": [
        {"id": r["id"], "kind": r["kind"], "body": r["body"],
         "read": bool(r["read"]), "createdAt": r["created_at"]} for r in rows]})


@router.post("/api/player/notifications/read", bucket="write")
def read_notifications(request: Request) -> Response:
    user_id = _user_id(request)
    db.execute("UPDATE notifications SET read=1 WHERE user_id=?", (user_id,))
    return Response.json({"ok": True})


# ------------------------------------------------------------------- quests --
@router.get("/api/quests", bucket="read")
def list_quests(request: Request) -> Response:
    user_id = _user_id(request)
    quests_mod.expire_stale(user_id)
    status = request.query.get("status", "open")
    if status == "open":
        items = quests_mod.open_quests(user_id)
    else:
        items = quests_mod.list_quests(user_id, status)
    return Response.json({
        "quests": items,
        "chains": quests_mod.chain_state(user_id),
        "snapshot": player.snapshot(user_id),
    })


@router.post("/api/quests/daily", bucket="ai")
def ensure_daily(request: Request) -> Response:
    user_id = _require_onboarded(request)
    created = quests_mod.ensure_daily_set(user_id)
    return Response.json({
        "created": [q for q in created if q],
        "quests": quests_mod.open_quests(user_id),
        "snapshot": player.snapshot(user_id),
    })


@router.post("/api/quests/generate", bucket="ai")
def generate_quest(request: Request) -> Response:
    user_id = _require_onboarded(request)
    data = _body(request)
    domain = data.get("domain")
    if domain not in ("physical", "academic", "passion"):
        snapshot = player.snapshot(user_id)
        attrs = snapshot["attributes"]
        domain = sorted(("physical", "academic", "passion"), key=lambda d: attrs[d])[0]
    kind = data.get("kind", "daily")
    if kind not in ("daily", "weekly", "milestone", "epic"):
        kind = "daily"

    snapshot = player.snapshot(user_id)
    if kind == "epic" and not skills_mod.has_capability(snapshot["level"], "epic_chains"):
        raise HttpError(403, "locked", "Epic quests unlock at level 50.")
    if kind == "milestone" and not skills_mod.has_capability(snapshot["level"], "advanced_quests"):
        raise HttpError(403, "locked", "Milestone quests unlock at level 10.")

    quest = quests_mod.generate_one(
        user_id, domain, kind, salt=str(datetime.now().timestamp()),
        deadline=time.monotonic() + config.AI_QUEST_BUDGET)
    if quest is None:
        raise HttpError(409, "no_quest_available",
                        f"There are no {kind} archetypes in that domain at your level yet. "
                        "Try another domain, or level up to unlock more.")
    return Response.json({"quest": quest, "snapshot": player.snapshot(user_id)}, status=201)


@router.get("/api/quests/:quest_id", bucket="read")
def get_quest(request: Request) -> Response:
    user_id = _user_id(request)
    quest = quests_mod.get_quest(user_id, _int_param(request, "quest_id"))
    if not quest:
        raise HttpError(404, "not_found", "Quest not found.")
    history = db.query(
        """SELECT status, submitted_at, assessment, xp_awarded FROM quest_completions
            WHERE user_id=? AND quest_id=? ORDER BY id DESC""",
        (user_id, quest["id"]))
    return Response.json({
        "quest": quest,
        "attempts": [
            {"status": r["status"], "submittedAt": r["submitted_at"],
             "assessment": json.loads(r["assessment"] or "{}"), "xp": r["xp_awarded"]}
            for r in history
        ],
    })


@router.post("/api/quests/:quest_id/start", bucket="write")
def start_quest(request: Request) -> Response:
    user_id = _user_id(request)
    quest = quests_mod.start(user_id, _int_param(request, "quest_id"))
    if not quest:
        raise HttpError(409, "cannot_start", "That quest can't be started.")
    return Response.json({"quest": quest})


@router.post("/api/quests/:quest_id/abandon", bucket="write")
def abandon_quest(request: Request) -> Response:
    user_id = _user_id(request)
    quest = quests_mod.abandon(user_id, _int_param(request, "quest_id"))
    if not quest:
        raise HttpError(409, "cannot_abandon", "That quest can't be abandoned.")
    return Response.json({"quest": quest})


@router.post("/api/quests/:quest_id/submit", bucket="submit")
def submit_quest(request: Request) -> Response:
    user_id = _require_onboarded(request)
    quest_id = _int_param(request, "quest_id")
    data = _body(request)

    structured_in = data.get("structured") or {}
    structured: dict = {}
    if isinstance(structured_in, dict):
        for key, value in list(structured_in.items())[:8]:
            key = security.clean_text(key, 40)
            if not key:
                continue
            structured[key] = security.clean_text(value, 120)

    files_in = data.get("files") or []
    files = []
    if isinstance(files_in, list):
        for item in files_in[:6]:
            if isinstance(item, dict) and item.get("id"):
                stored = security.clean_text(item["id"], 120)
                if security.upload_path_for(user_id, stored):
                    files.append({
                        "id": stored,
                        "name": security.clean_text(item.get("name"), 80),
                        "url": f"/api/uploads/{stored}",
                        "contentType": security.clean_text(item.get("contentType"), 60),
                    })

    payload = {
        "text": security.clean_text(data.get("text"), 4000),
        "reflection": security.clean_text(data.get("reflection"), 4000),
        "link": security.safe_url(data.get("link") or ""),
        "structured": structured,
        "files": files,
        "submittedAt": _now(),
    }

    if not any([payload["text"], payload["reflection"], payload["link"], files, structured]):
        raise HttpError(400, "empty_proof",
                        "Submit at least a short description of what you did.")

    result = quests_mod.submit(user_id, quest_id, payload)
    if not result.get("ok"):
        status = 404 if result.get("error") == "not_found" else 409
        raise HttpError(status, result.get("error", "rejected"), result.get("message", ""))
    return Response.json(result)


@router.post("/api/quests/custom", bucket="write")
def create_custom_quest(request: Request) -> Response:
    user_id = _require_onboarded(request)
    data = _body(request)
    spec = {
        "title": security.clean_text(data.get("title"), 120),
        "description": security.clean_text(data.get("description"), 800),
        "domain": data.get("domain"),
        "kind": data.get("kind", "daily"),
        "difficulty": data.get("difficulty", 2),
        "estimatedTime": data.get("estimatedTime", 30),
        "completionCriteria": security.clean_text(data.get("completionCriteria"), 300),
        "proofType": [p for p in (data.get("proofType") or ["text", "reflection"])
                      if p in ("text", "photo", "video", "document", "link",
                               "reflection", "structured")],
    }
    result = quests_mod.create_custom(user_id, spec)
    if not result.get("ok"):
        raise HttpError(400, "rejected", result.get("message", "Quest rejected."))
    return Response.json(result, status=201)


@router.post("/api/quests/custom/review", bucket="ai")
def review_custom_quest(request: Request) -> Response:
    user_id = _require_onboarded(request)
    data = _body(request)
    spec = {
        "title": security.clean_text(data.get("title"), 120),
        "description": security.clean_text(data.get("description"), 800),
        "difficulty": data.get("difficulty", 2),
        "estimatedTime": data.get("estimatedTime", 30),
        "kind": data.get("kind", "daily"),
    }
    return Response.json(quests_mod.review_only(user_id, spec))


# ------------------------------------------------------------------- chains --
@router.get("/api/chains", bucket="read")
def get_chains(request: Request) -> Response:
    user_id = _user_id(request)
    snapshot = player.snapshot(user_id)
    return Response.json({
        "available": quests_mod.available_chains(user_id, snapshot["level"]),
        "active": quests_mod.chain_state(user_id),
    })


@router.post("/api/chains/:chain_key/start", bucket="write")
def start_chain(request: Request) -> Response:
    user_id = _require_onboarded(request)
    key = security.clean_text(request.params.get("chain_key"), 40)
    result = quests_mod.start_chain(user_id, key)
    if not result.get("ok"):
        raise HttpError(409, "cannot_start", result.get("message", "Cannot start questline."))
    return Response.json(result, status=201)


# ------------------------------------------------------------ passion paths --
@router.get("/api/paths", bucket="read")
def get_paths(request: Request) -> Response:
    user_id = _user_id(request)
    rows = db.query(
        "SELECT * FROM passion_paths WHERE user_id=? ORDER BY interest_score DESC, id",
        (user_id,))
    return Response.json({"paths": [
        {"id": r["id"], "name": r["name"], "status": r["status"],
         "interest": float(r["interest_score"]), "sessions": int(r["sessions"]),
         "notes": r["notes"], "updatedAt": r["updated_at"]} for r in rows]})


@router.post("/api/paths", bucket="write")
def create_path(request: Request) -> Response:
    user_id = _require_onboarded(request)
    data = _body(request)
    name = security.clean_text(data.get("name"), 60)
    if len(name) < 2:
        raise HttpError(400, "invalid_name", "Give the path a name.")
    existing = db.query_one(
        "SELECT id FROM passion_paths WHERE user_id=? AND name=? COLLATE NOCASE", (user_id, name))
    if existing:
        raise HttpError(409, "exists", "You're already tracking that path.")
    db.insert(
        """INSERT INTO passion_paths (user_id, name, status, interest_score, sessions,
                                      notes, created_at, updated_at)
           VALUES (?,?,'exploring',0.5,0,?,?,?)""",
        (user_id, name, security.clean_text(data.get("notes"), 400), _now(), _now()),
    )
    return Response.json({"ok": True}, status=201)


# -------------------------------------------------------------------- guide --
@router.get("/api/guide", bucket="read")
def get_guide(request: Request) -> Response:
    user_id = _user_id(request)
    snapshot = player.snapshot(user_id)
    profile = player.get_profile(user_id)
    report = analyst.full_report(user_id, profile)
    open_list = quests_mod.open_quests(user_id)
    return Response.json({
        "name": guide_mod.GUIDE_NAME,
        "summary": guide_mod.briefing_summary(snapshot, report),
        "recommendations": guide_mod.recommendations(snapshot, report, open_list),
        "insights": report["insights"],
        "history": guide_mod.history(user_id),
        "nextMilestone": snapshot["milestones"]["next"],
        "xp": snapshot["xp"],
        "ai": provider_mod.status(),
        "suggestedQuestions": [
            "What should I do today?",
            "Why am I not levelling up?",
            "What am I weakest at?",
            "I'm struggling with this quest.",
            "Give me a harder challenge.",
            "I want to explore a new passion.",
        ],
    })


@router.post("/api/guide/ask", bucket="ai")
def ask_guide(request: Request) -> Response:
    user_id = _user_id(request)
    data = _body(request)
    message = security.clean_text(data.get("message"), 1000)
    if len(message) < 2:
        raise HttpError(400, "empty_message", "Ask me something.")

    snapshot = player.snapshot(user_id)
    profile = player.get_profile(user_id)
    report = analyst.full_report(user_id, profile)
    open_list = quests_mod.open_quests(user_id)
    result = guide_mod.answer(user_id, message, snapshot, profile, report, open_list)
    return Response.json(result)


# ------------------------------------------------------------------ uploads --
@router.post("/api/uploads", bucket="write")
def upload(request: Request) -> Response:
    user_id = _user_id(request)
    content_type = request.header("content-type")
    if "multipart/form-data" not in content_type:
        raise HttpError(400, "invalid_upload", "Upload must be multipart/form-data.")
    if len(request.body) > config.MAX_VIDEO_BYTES + 4096:
        raise HttpError(413, "too_large", "That file is too large.")

    raw = b"Content-Type: " + content_type.encode() + b"\r\nMIME-Version: 1.0\r\n\r\n" + request.body
    message = BytesParser(policy=email_policy).parsebytes(raw)
    stored = []
    for part in message.iter_parts() if message.is_multipart() else []:
        filename = part.get_filename()
        if not filename:
            continue
        data = part.get_payload(decode=True) or b""
        meta = security.store_upload(user_id, filename, part.get_content_type(), data)
        if meta is None:
            raise HttpError(
                400, "unsupported_file",
                "Supported files: PNG, JPEG, WebP, GIF, PDF, TXT and MD up to 8 MB, "
                "or WebM/MP4 video up to 32 MB.")
        stored.append(meta)

    if not stored:
        raise HttpError(400, "no_file", "No file was received.")
    return Response.json({"files": stored}, status=201)


@router.get("/api/uploads/:name", bucket="read")
def serve_upload(request: Request) -> Response:
    user_id = _user_id(request)
    path = security.upload_path_for(user_id, request.params.get("name", ""))
    if path is None:
        raise HttpError(404, "not_found", "File not found.")
    suffix = path.suffix.lower()
    types = {".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
             ".gif": "image/gif", ".pdf": "application/pdf", ".txt": "text/plain",
             ".md": "text/plain", ".webm": "video/webm", ".mp4": "video/mp4",
             ".mov": "video/quicktime"}
    return Response(
        status=200,
        body=path.read_bytes(),
        headers={
            "content-type": types.get(suffix, "application/octet-stream"),
            "cache-control": "private, max-age=3600",
            "content-disposition": "inline",
            "x-content-type-options": "nosniff",
        },
    )


# --------------------------------------------------------------------- meta --
@router.get("/api/meta", auth=False, bucket="read")
def meta(request: Request) -> Response:
    from .game import catalog
    return Response.json({
        "app": "LifeQuest",
        "maxLevel": xp_mod.MAX_LEVEL,
        "totalXpToMaxLevel": xp_mod.total_xp_for_level(xp_mod.MAX_LEVEL),
        "curve": xp_mod.curve_summary(),
        "archetypes": len(catalog.ALL_TEMPLATES),
        "questlines": len(catalog.CHAINS),
        "achievements": len(achievements_mod.ALL_ACHIEVEMENTS),
        "skills": len(skills_mod.ALL_SKILLS),
        "milestones": skills_mod.LEVEL_MILESTONES,
        "ai": provider_mod.status(),
    })


def _int_param(request: Request, name: str) -> int:
    try:
        return int(request.params.get(name, ""))
    except (TypeError, ValueError):
        raise HttpError(400, "invalid_id", "Invalid identifier.")

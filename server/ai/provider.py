"""LLM abstraction layer.

Three implementations sit behind one interface:

  AnthropicProvider  – hosted model calls. Uses the official `anthropic` SDK when
                       it is installed, and falls back to a stdlib HTTPS call
                       against the Messages API when it is not (this project has
                       no third-party dependencies by design).
  OllamaProvider     – a model running locally through Ollama. Same contract, no
                       API key, no data leaving the machine.
  NullProvider       – no model configured. Returns None, which makes every AI
                       module fall back to its deterministic local reasoning.

Nothing in the game engine calls a provider directly: the five AI modules
(quest_generator, proof_evaluator, difficulty, analyst, guide) own their own
prompts, and each one works with or without a model.

Selection order (see `get_provider`): an explicit AI_PROVIDER wins, otherwise a
configured AI_API_KEY, otherwise a reachable Ollama, otherwise local reasoning.
The key is never sent to, or referenced by, the frontend.
"""

from __future__ import annotations

import json
import logging
import time
import urllib.error
import urllib.request
from typing import Any

from .. import config

log = logging.getLogger("lifequest.ai")

ANTHROPIC_VERSION = "2023-06-01"

# Adaptive thinking is off for these calls: they are short, schema-constrained
# and latency-sensitive. Effort stays at or below `high`, which is what the API
# requires when thinking is disabled on Opus-tier models.
_EFFORT = "medium"

_NO_MARKUP_RULE = (
    "Return only the requested content. Do not include internal or system XML tags "
    "in your response."
)


class ProviderError(RuntimeError):
    pass


class BaseProvider:
    name = "none"
    available = False

    def complete_json(self, system: str, prompt: str, schema: dict,
                      max_tokens: int = 2000, timeout: float | None = None) -> dict | None:
        return None

    def complete_text(self, system: str, prompt: str, max_tokens: int = 1000,
                      timeout: float | None = None) -> str | None:
        return None


class NullProvider(BaseProvider):
    """Used when no API key is configured. Every feature still works locally."""

    name = "local"
    available = False


class AnthropicProvider(BaseProvider):
    name = "anthropic"
    available = True

    def __init__(self, api_key: str, model: str, base_url: str, timeout: int) -> None:
        self.api_key = api_key
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self._client = None
        try:  # Prefer the official SDK when the environment has it.
            import anthropic  # type: ignore

            self._client = anthropic.Anthropic(api_key=api_key, base_url=self.base_url)
            self.transport = "sdk"
        except Exception:
            self.transport = "http"

    # -- public API ---------------------------------------------------------
    def complete_json(self, system: str, prompt: str, schema: dict,
                      max_tokens: int = 2000, timeout: float | None = None) -> dict | None:
        body = self._base_body(system, prompt, max_tokens)
        body["output_config"] = {
            "effort": _EFFORT,
            "format": {"type": "json_schema", "schema": schema},
        }
        text = self._send(body, timeout)
        if text is None:
            return None
        try:
            return json.loads(text)
        except ValueError:
            log.warning("AI returned non-JSON despite a schema; falling back")
            return None

    def complete_text(self, system: str, prompt: str, max_tokens: int = 1000,
                      timeout: float | None = None) -> str | None:
        body = self._base_body(system, prompt, max_tokens)
        body["output_config"] = {"effort": _EFFORT}
        return self._send(body, timeout)

    # -- internals ----------------------------------------------------------
    def _base_body(self, system: str, prompt: str, max_tokens: int) -> dict[str, Any]:
        return {
            "model": self.model,
            "max_tokens": max_tokens,
            "system": [
                {
                    "type": "text",
                    "text": system + "\n\n" + _NO_MARKUP_RULE,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            "thinking": {"type": "disabled"},
            "messages": [{"role": "user", "content": prompt}],
        }

    def _send(self, body: dict, timeout: float | None = None) -> str | None:
        try:
            if self._client is not None:
                return self._send_sdk(body, timeout)
            return self._send_http(body, timeout)
        except Exception as exc:  # never let an AI outage break the game loop
            log.warning("AI request failed (%s); using local reasoning", exc)
            return None

    def _send_sdk(self, body: dict, timeout: float | None = None) -> str | None:
        if timeout is not None:
            body = {**body, "timeout": timeout}
        response = self._client.messages.create(**body)
        if getattr(response, "stop_reason", None) == "refusal":
            log.info("AI declined the request; using local reasoning")
            return None
        for block in response.content:
            if getattr(block, "type", None) == "text":
                return block.text
        return None

    def _send_http(self, body: dict, timeout: float | None = None) -> str | None:
        request = urllib.request.Request(
            f"{self.base_url}/v1/messages",
            data=json.dumps(body).encode("utf-8"),
            headers={
                "content-type": "application/json",
                "x-api-key": self.api_key,
                "anthropic-version": ANTHROPIC_VERSION,
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(
                    request, timeout=timeout or self.timeout) as raw:
                payload = json.loads(raw.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:400]
            log.warning("AI HTTP %s: %s", exc.code, detail)
            return None
        if payload.get("stop_reason") == "refusal":
            log.info("AI declined the request; using local reasoning")
            return None
        for block in payload.get("content", []):
            if block.get("type") == "text":
                return block.get("text")
        return None


class OllamaProvider(BaseProvider):
    """A model served by a local Ollama daemon.

    Ollama speaks its own `/api/chat`, not the Messages API, so this is a
    separate transport rather than a base-URL swap on the Anthropic client.
    Two things it does differently and deliberately:

      * JSON is requested by handing Ollama the same JSON Schema the caller
        already wrote (`format`), which constrains decoding rather than merely
        asking nicely. Older daemons only understand `format: "json"`, so a
        rejected schema is retried that way before giving up.
      * The timeout is its own setting. A 4.7GB model answering on CPU is
        unhurried, and the hosted default of 45s would abort good replies.
    """

    name = "ollama"
    available = True
    transport = "ollama"

    def __init__(self, model: str, base_url: str, timeout: int,
                 keep_alive: str = "15m") -> None:
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.keep_alive = keep_alive

    def complete_json(self, system: str, prompt: str, schema: dict,
                      max_tokens: int = 2000, timeout: float | None = None) -> dict | None:
        # Scoring wants the most probable answer, not an interesting one.
        started = time.monotonic()
        budget = timeout or self.timeout
        text = self._chat(system, prompt, max_tokens, fmt=schema, temperature=0.2,
                          timeout=budget)
        if text is None:
            # The retry exists for old daemons that reject a schema, which they do
            # immediately. A timeout is the opposite case — retrying it would spend
            # the budget twice over — so only retry inside whatever time is left.
            remaining = budget - (time.monotonic() - started)
            if remaining < 2.0:
                return None
            text = self._chat(system, prompt, max_tokens, fmt="json", temperature=0.2,
                              timeout=remaining)
        if text is None:
            return None
        try:
            return json.loads(text)
        except ValueError:
            # Small local models like to wrap JSON in prose or a code fence.
            salvaged = _first_json_object(text)
            if salvaged is None:
                log.warning("Ollama returned non-JSON despite a schema; falling back")
            return salvaged

    def complete_text(self, system: str, prompt: str, max_tokens: int = 1000,
                      timeout: float | None = None) -> str | None:
        return self._chat(system, prompt, max_tokens, timeout=timeout)

    def _chat(self, system: str, prompt: str, max_tokens: int, fmt: Any = None,
              temperature: float = 0.6, timeout: float | None = None) -> str | None:
        body: dict[str, Any] = {
            "model": self.model,
            "stream": False,
            # Loading a 4.7GB model costs ~80s; answering once it is resident
            # costs ~6s. Holding it in memory between interactions is the whole
            # difference between "usable" and "did it crash?".
            "keep_alive": self.keep_alive,
            "messages": [
                {"role": "system", "content": system + "\n\n" + _NO_MARKUP_RULE},
                {"role": "user", "content": prompt},
            ],
            "options": {"num_predict": max_tokens, "temperature": temperature},
        }
        if fmt is not None:
            body["format"] = fmt

        request = urllib.request.Request(
            f"{self.base_url}/api/chat",
            data=json.dumps(body).encode("utf-8"),
            headers={"content-type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(
                    request, timeout=timeout or self.timeout) as raw:
                payload = json.loads(raw.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:300]
            log.warning("Ollama HTTP %s: %s", exc.code, detail)
            return None
        except Exception as exc:      # daemon stopped, model pulled, timeout…
            log.warning("Ollama request failed (%s); using local reasoning", exc)
            return None

        text = (payload.get("message") or {}).get("content")
        return text.strip() if isinstance(text, str) and text.strip() else None

    def warm(self) -> None:
        """Load the weights now so the first real interaction is not the one
        that waits for them. Cheap: one token, then the model stays resident."""
        body = {"model": self.model, "stream": False, "keep_alive": self.keep_alive,
                "messages": [{"role": "user", "content": "hi"}],
                "options": {"num_predict": 1}}
        request = urllib.request.Request(
            f"{self.base_url}/api/chat", data=json.dumps(body).encode("utf-8"),
            headers={"content-type": "application/json"}, method="POST")
        try:
            with urllib.request.urlopen(request, timeout=self.timeout):
                log.info("AI: %s is warm", self.model)
        except Exception as exc:
            log.info("AI: could not pre-warm %s (%s)", self.model, exc)


def _first_json_object(text: str) -> dict | None:
    """Pull the first balanced {...} out of a reply that wrapped it in prose."""
    start = text.find("{")
    if start < 0:
        return None
    depth = 0
    in_string = False
    escaped = False
    for index in range(start, len(text)):
        char = text[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(text[start:index + 1])
                except ValueError:
                    return None
    return None


def ollama_reachable(base_url: str, timeout: float = 1.5) -> bool:
    """Is a daemon answering? Kept short — this runs on the first AI call."""
    try:
        with urllib.request.urlopen(f"{base_url.rstrip('/')}/api/tags", timeout=timeout) as raw:
            json.loads(raw.read().decode("utf-8"))
        return True
    except Exception:
        return False


_provider: BaseProvider | None = None


def _build_provider() -> BaseProvider:
    choice = config.AI_PROVIDER
    if not config.AI_ENABLED or choice in ("none", "local", "off"):
        return NullProvider()
    if choice == "anthropic" or (choice == "auto" and config.AI_API_KEY):
        if config.AI_API_KEY:
            return AnthropicProvider(
                config.AI_API_KEY, config.AI_MODEL, config.AI_BASE_URL, config.AI_TIMEOUT)
        log.warning("AI_PROVIDER=anthropic but no AI_API_KEY is set; using local reasoning")
        return NullProvider()

    if choice == "ollama":
        return _ollama()

    # auto, with no hosted key: use the local daemon if one is actually running.
    if ollama_reachable(config.OLLAMA_URL):
        log.info("AI: Ollama detected at %s (%s)", config.OLLAMA_URL, config.OLLAMA_MODEL)
        return _ollama()
    return NullProvider()


def _ollama() -> OllamaProvider:
    return OllamaProvider(config.OLLAMA_MODEL, config.OLLAMA_URL,
                          config.OLLAMA_TIMEOUT, config.OLLAMA_KEEP_ALIVE)


def get_provider() -> BaseProvider:
    global _provider
    if _provider is None:
        _provider = _build_provider()
    return _provider


def set_provider(provider: BaseProvider | None) -> None:
    """Test seam — lets the suite inject a fake model."""
    global _provider
    _provider = provider


_NOTES = {
    "anthropic": "Connected to a hosted language model.",
    "ollama": "Connected to a local model through Ollama. Nothing leaves this machine.",
}


def status() -> dict:
    provider = get_provider()
    return {
        "provider": provider.name,
        "model": getattr(provider, "model", None) if provider.available else None,
        "transport": getattr(provider, "transport", "local"),
        "modelBacked": provider.available,
        "local": provider.name == "ollama",
        "note": _NOTES.get(provider.name) or (
            "Running on the built-in reasoning engine. Start Ollama, or set AI_API_KEY, to "
            "connect a model — quest generation, proof evaluation and the Guide all work "
            "either way."
        ),
    }

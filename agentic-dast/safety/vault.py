"""Fail-closed Test Credential Vault.

Agents pass symbolic identities only (e.g. 'agency_a_admin', 'agency_b_admin').
Tokens are resolved and injected strictly inside SafetyGateway and scrubbed from logs.
"""

from __future__ import annotations

import json
import os
import re
import threading
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

import httpx
from pydantic import BaseModel, Field

from safety.models import SafetyConfigError, SafetyCredentialError

SENSITIVE_HEADER_NAMES = frozenset(
    {
        "authorization",
        "cookie",
        "set-cookie",
        "x-api-key",
        "x-auth-token",
        "proxy-authorization",
    }
)


class ActorConfig(BaseModel):
    agency_id: str | None = None
    role: str
    auth_type: str
    login_url: str | None = None
    username: str | None = None
    password_env: str | None = None
    default_synthetic_password: str | None = None


class VaultFileSchema(BaseModel):
    notice: str | None = None
    actors: dict[str, ActorConfig] = Field(min_length=1)


_JWT_RE = re.compile(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+")
_JSON_SECRET_RE = re.compile(r'("(?:access_token|refresh_token|password)"\s*:\s*)"[^"]*"')


class TestCredentialVault:
    """In-memory token cache & sanitizer backed by configs/credentials.vault.json."""

    __test__ = False

    def __init__(self, vault_path: Path) -> None:
        self._lock = threading.Lock()
        self._tokens: dict[str, str] = {}
        try:
            raw = json.loads(Path(vault_path).read_text(encoding="utf-8"))
            parsed = VaultFileSchema.model_validate(raw)
        except Exception as exc:  # noqa: BLE001
            raise SafetyConfigError(f"Failed to load credential vault {vault_path}: {exc}") from exc
        self._actors = parsed.actors

    def list_actors(self) -> list[str]:
        return sorted(self._actors.keys())

    def get_actor_config(self, actor: str) -> ActorConfig:
        if actor not in self._actors:
            raise SafetyCredentialError(f"Unknown symbolic actor '{actor}' (fail-closed)")
        return self._actors[actor]

    def set_token(self, actor: str, token: str) -> None:
        self.get_actor_config(actor)
        if not token:
            raise SafetyCredentialError(f"Empty token rejected for actor '{actor}'")
        with self._lock:
            self._tokens[actor] = token

    def clear_token(self, actor: str) -> None:
        with self._lock:
            self._tokens.pop(actor, None)

    def resolve_auth_headers(
        self,
        actor: str,
        login_fetcher: Callable[[ActorConfig, str], str] | None = None,
    ) -> dict[str, str]:
        cfg = self.get_actor_config(actor)
        if cfg.auth_type == "none":
            return {}
        if cfg.auth_type != "bearer_login":
            raise SafetyCredentialError(f"Unsupported auth_type '{cfg.auth_type}' for actor '{actor}'")

        with self._lock:
            cached = self._tokens.get(actor)
        if cached:
            return {"Authorization": f"Bearer {cached}"}

        if login_fetcher is None:
            raise SafetyCredentialError(f"No token cached and no login fetcher provided for '{actor}'")

        password = ""
        if cfg.password_env:
            password = os.environ.get(cfg.password_env, "")
        if not password and cfg.default_synthetic_password:
            password = cfg.default_synthetic_password
        if not cfg.login_url or not cfg.username or not password:
            raise SafetyCredentialError(f"Incomplete synthetic credentials for actor '{actor}'")

        token = login_fetcher(cfg, password)
        if not token:
            raise SafetyCredentialError(f"Login fetcher returned empty token for '{actor}'")
        with self._lock:
            self._tokens[actor] = token
        return {"Authorization": f"Bearer {token}"}

    async def resolve_auth_headers_async(
        self,
        actor: str,
        login_fetcher: Callable[[ActorConfig, str], Awaitable[str]] | None = None,
    ) -> dict[str, str]:
        cfg = self.get_actor_config(actor)
        if cfg.auth_type == "none":
            return {}
        if cfg.auth_type != "bearer_login":
            raise SafetyCredentialError(f"Unsupported auth_type '{cfg.auth_type}' for actor '{actor}'")

        with self._lock:
            cached = self._tokens.get(actor)
        if cached:
            return {"Authorization": f"Bearer {cached}"}

        if login_fetcher is None:
            raise SafetyCredentialError(f"No token cached and no login fetcher provided for '{actor}'")

        password = ""
        if cfg.password_env:
            password = os.environ.get(cfg.password_env, "")
        if not password and cfg.default_synthetic_password:
            password = cfg.default_synthetic_password
        if not cfg.login_url or not cfg.username or not password:
            raise SafetyCredentialError(f"Incomplete synthetic credentials for actor '{actor}'")

        token = await login_fetcher(cfg, password)
        if not token:
            raise SafetyCredentialError(f"Login fetcher returned empty token for '{actor}'")
        with self._lock:
            self._tokens[actor] = token
        return {"Authorization": f"Bearer {token}"}

    def sanitize_headers(self, headers: dict[str, str] | httpx.Headers) -> dict[str, str]:
        sanitized: dict[str, str] = {}
        for key, value in headers.items():
            if key.lower() in SENSITIVE_HEADER_NAMES:
                sanitized[key] = "<REDACTED>"
            else:
                sanitized[key] = self.scrub_secrets(str(value))
        return sanitized

    def scrub_secrets(self, text: str) -> str:
        if not text:
            return text
        with self._lock:
            tokens = list(self._tokens.values())
        cleaned = text
        for tok in tokens:
            if tok and tok in cleaned:
                cleaned = cleaned.replace(tok, "<REDACTED_TOKEN>")
        return cleaned

    def active_secret_values(self) -> list[str]:
        with self._lock:
            vals: list[str] = list(self._tokens.values())
        for cfg in self._actors.values():
            if cfg.default_synthetic_password:
                vals.append(cfg.default_synthetic_password)
            if cfg.password_env and cfg.password_env in os.environ:
                vals.append(os.environ[cfg.password_env])
        return [v for v in vals if v]

    def scrub_all(self, text: str) -> str:
        if not text:
            return text
        cleaned = self.scrub_secrets(text)
        for val in self.active_secret_values():
            if val in cleaned:
                cleaned = cleaned.replace(val, "<REDACTED_SECRET>")
        cleaned = _JWT_RE.sub("<REDACTED_JWT>", cleaned)
        cleaned = _JSON_SECRET_RE.sub(r'\1"<REDACTED>"', cleaned)
        return cleaned

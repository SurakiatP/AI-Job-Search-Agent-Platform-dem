"""Reference-only secret storage; production supports the native macOS Keychain."""

from __future__ import annotations

import sys
from typing import Protocol
from uuid import UUID, uuid4

from job_search_platform.services.errors import ServiceError


class SecretStore(Protocol):
    def put(self, value: str) -> str: ...
    def get(self, reference: str) -> str: ...
    def delete(self, reference: str) -> None: ...


class MacOSKeychain:
    SERVICE = "ai-job-search-agent-platform.v1"

    def __init__(self):
        if sys.platform != "darwin":
            raise ServiceError("secret_store_unavailable")
        try:
            from keyring.backends.macOS import Keyring
            self.backend = Keyring()
            if self.backend.priority <= 0:
                raise RuntimeError
        except Exception:
            raise ServiceError("secret_store_unavailable") from None

    @staticmethod
    def _account(reference):
        try:
            if not isinstance(reference, str) or not reference.startswith("keychain:"):
                raise ValueError
            return str(UUID(reference.removeprefix("keychain:")))
        except (TypeError, ValueError):
            raise ServiceError("secret_store_unavailable") from None

    def put(self, value):
        account = str(uuid4())
        try:
            self.backend.set_password(self.SERVICE, account, value)
        except Exception:
            raise ServiceError("secret_store_unavailable") from None
        return "keychain:" + account

    def get(self, reference):
        account = self._account(reference)
        try:
            value = self.backend.get_password(self.SERVICE, account)
            if not isinstance(value, str) or not value:
                raise RuntimeError
        except Exception:
            raise ServiceError("secret_store_unavailable") from None
        return value

    def delete(self, reference):
        account = self._account(reference)
        try:
            self.backend.delete_password(self.SERVICE, account)
        except Exception:
            raise ServiceError("secret_store_unavailable") from None

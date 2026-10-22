"""Safe errors exposed by all transports."""
from __future__ import annotations

from uuid import UUID, uuid4


class ServiceError(Exception):
    def __init__(self, code: str, *, message_key: str | None = None, retryable: bool = False,
                 fields: dict[str, str] | None = None, correlation_id: UUID | None = None):
        self.code = code
        self.message_key = message_key or f"errors.{code}"
        self.retryable = retryable
        self.fields = fields
        self.correlation_id = correlation_id or uuid4()
        super().__init__(self.code)

    def public_payload(self) -> dict:
        payload = {"code": self.code, "message_key": self.message_key,
                   "retryable": self.retryable, "correlation_id": str(self.correlation_id)}
        if self.fields:
            payload["fields"] = self.fields
        return payload

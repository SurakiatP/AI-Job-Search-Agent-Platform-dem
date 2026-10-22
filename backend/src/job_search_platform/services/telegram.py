"""FR-J05 Telegram channel: link a chat to an account with a one-time code, poll the bot for /start, deliver digests.

Owner-only (agents never reach this module). The bot token lives in the client and is never logged or returned."""
from __future__ import annotations

import asyncio
import hashlib
import logging
import re
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import delete, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

from job_search_platform.db.models import Project, SavedSearch, TelegramLink, User
from job_search_platform.integrations.telegram import TelegramClient, TelegramError
from job_search_platform.services import rate_limits
from job_search_platform.services.errors import ServiceError

logger = logging.getLogger("jsp.telegram")

CODE_TTL = timedelta(minutes=10)
CODE_PATTERN = re.compile(r"[A-Za-z0-9_-]{1,64}")
CONFIRM = {"en": "Telegram is now connected. Your saved-search digests will arrive here.",
           "th": "เชื่อมต่อ Telegram แล้ว สรุปงานที่บันทึกไว้จะส่งมาที่นี่"}


class DeliveryFailed(Exception):
    """A digest could not be sent now (the link is kept); the caller decides whether that fails the run."""


def _digest(code: str) -> bytes:
    return hashlib.sha256(code.encode()).digest()


def clear_switches(db, user_ids) -> None:
    db.execute(update(SavedSearch).where(SavedSearch.telegram_enabled, SavedSearch.project_id.in_(
        select(Project.id).where(Project.user_id.in_(user_ids)))).values(telegram_enabled=False))


def unlink_in(db, user_id: UUID) -> None:
    db.execute(delete(TelegramLink).where(TelegramLink.user_id == user_id))
    clear_switches(db, [user_id])


class Telegram:
    def __init__(self, sessions, client: TelegramClient | None):
        self.sessions = sessions
        self.client = client
        self._offset: int | None = None  # in memory: Telegram redelivers after a restart and a code works once

    @property
    def enabled(self) -> bool:
        return self.client is not None

    def _need(self) -> TelegramClient:
        if self.client is None:
            raise ServiceError("telegram_disabled")
        return self.client

    def _username(self) -> str:
        try:
            return self._need().bot_username()
        except TelegramError:
            raise ServiceError("telegram_unavailable", retryable=True) from None

    def status(self, user_id: UUID) -> dict:
        if self.client is None:
            return {"enabled": False, "linked": False, "bot_username": None, "linked_at": None}
        try:
            username = self.client.bot_username()
        except TelegramError:
            username = None
        with self.sessions() as db:
            link = db.get(TelegramLink, user_id)
            linked = link is not None and link.chat_id is not None
            return {"enabled": True, "linked": linked, "bot_username": username,
                    "linked_at": link.linked_at if linked else None}

    def link(self, user_id: UUID, *, now: datetime | None = None) -> dict:
        username = self._username()
        now = now or datetime.now(timezone.utc)
        code = secrets.token_urlsafe(24)
        expires = now + CODE_TTL
        with self.sessions.begin() as db:
            rate_limits.hit(db, "telegram_link", str(user_id))
            db.execute(pg_insert(TelegramLink).values(user_id=user_id, code_hash=_digest(code), code_expires_at=expires)
                       .on_conflict_do_update(index_elements=["user_id"],
                                              set_={"code_hash": _digest(code), "code_expires_at": expires}))
        return {"url": f"https://t.me/{username}?start={code}", "expires_at": expires}

    def unlink(self, user_id: UUID) -> None:
        self._need()
        with self.sessions.begin() as db:
            unlink_in(db, user_id)

    def redeem(self, code: str, chat_id: int, *, now: datetime | None = None) -> str | None:
        """Bind ``chat_id`` to the account that issued ``code``; the account's locale, or None for a bad code."""
        now = now or datetime.now(timezone.utc)
        with self.sessions.begin() as db:
            link = db.scalar(select(TelegramLink).where(TelegramLink.code_hash == _digest(code),
                                                        TelegramLink.code_expires_at > now).with_for_update())
            if link is None:
                return None
            other = db.scalars(select(TelegramLink.user_id).where(TelegramLink.chat_id == chat_id,
                                                                  TelegramLink.user_id != link.user_id)).all()
            for user_id in other:  # one chat serves one account
                unlink_in(db, user_id)
            link.chat_id, link.linked_at, link.code_hash, link.code_expires_at = chat_id, now, None, None
            return db.scalar(select(User.locale).where(User.id == link.user_id))

    def _handle(self, update_: dict) -> bool:
        message = update_.get("message")
        chat = message.get("chat") if isinstance(message, dict) else None
        text = message.get("text") if isinstance(message, dict) else None
        if not (isinstance(chat, dict) and chat.get("type") == "private" and isinstance(chat.get("id"), int)
                and isinstance(text, str)):
            return False
        parts = text.split()
        if len(parts) != 2 or parts[0] != "/start" or not CODE_PATTERN.fullmatch(parts[1]):
            return False
        locale = self.redeem(parts[1], chat["id"])
        if locale is None:
            return False
        try:
            self.client.send_message(chat["id"], CONFIRM.get(locale, CONFIRM["en"]))
        except TelegramError:
            logger.warning("telegram_confirm_failed")
        return True

    def _poll(self) -> int:
        try:
            updates = self.client.get_updates(self._offset)
        except TelegramError as exc:
            logger.warning("telegram_poll_failed", extra={"kind": exc.kind})
            return 0
        linked = 0
        for item in updates:
            if isinstance(item.get("update_id"), int):
                self._offset = max(self._offset or 0, item["update_id"] + 1)
            try:
                linked += self._handle(item)
            except Exception as exc:  # noqa: BLE001 - one bad update must not drop the rest
                logger.warning("telegram_update_failed", extra={"error": type(exc).__name__})
        return linked

    async def poll(self) -> int:
        """One getUpdates round from the supervisor's housekeeping; returns how many chats were linked."""
        if self.client is None:
            return 0
        return await asyncio.to_thread(self._poll)

    def deliver(self, db, user_id: UUID, text: str) -> bool:
        """Send ``text`` to the account's chat. False: nothing to send to (no link, or Telegram says it is gone and the
        account was unlinked in ``db``). Raises DeliveryFailed on a transient failure."""
        link = db.get(TelegramLink, user_id)
        if self.client is None or link is None or link.chat_id is None:
            return False
        try:
            self.client.send_message(link.chat_id, text)
        except TelegramError as exc:
            if exc.kind == "blocked":
                unlink_in(db, user_id)
                return False
            logger.warning("telegram_send_failed")
            raise DeliveryFailed from None
        return True

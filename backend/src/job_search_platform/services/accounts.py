"""Signup, email verification, login, password reset and account deletion.

All methods are synchronous; routes call them with ``asyncio.to_thread``. Neither tokens, passwords nor
email addresses are ever logged.
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import logging
import os
import secrets
from urllib.parse import urlsplit
import shutil
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import UUID

from sqlalchemy import delete, select, update
from botocore.exceptions import ClientError
from sqlalchemy.exc import IntegrityError

from job_search_platform.db.models import Grant, Project, Run, StoredFile, User, UserToken
from job_search_platform.integrations.mailer import Mail
from job_search_platform.integrations.object_store import _is_missing
from job_search_platform.services import rate_limits
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.owner_sessions import OwnerExchange, OwnerSessions
from job_search_platform.services.runs import RunService
from job_search_platform.services.passwords import (
    check_policy, hash_password, normalize_email, verify_dummy, verify_password,
)

logger = logging.getLogger(__name__)

VERIFY_TTL = timedelta(hours=24)
RESET_TTL = timedelta(minutes=30)
CODE_TTL = timedelta(minutes=10)
AVATAR_PRESETS = ("compass", "briefcase", "spark", "mountain")
AVATAR_MAX_BYTES = 262_144


def _image_mime(data: bytes) -> str | None:
    """By content, never by the name or header the client sent. SVG is refused on purpose: it can carry script."""
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None
# kind -> (subject, body); the body holds a {link} placeholder where a link applies.
MESSAGES = {
    "en": {
        "verify": ("Verify your email", "Welcome! Confirm your email address to finish signing up:\n{link}\n\n"
                   "Or enter this 6-digit code on the sign-up page: {code}\n\n"
                   "The link expires in 24 hours and the code in 10 minutes. If you did not sign up, ignore this message."),
        "delete": ("Confirm deleting your account", "Someone asked to delete your account and all its projects and documents. "
                   "To confirm, enter this 6-digit code: {code}\n\nIt expires in 10 minutes. If this was not you, ignore this "
                   "message and change your password."),
        "exists": ("You already have an account", "Someone tried to sign up with this email, but you already have "
                   "an account. Log in at {link}\nForgot your password? Use the reset link on the login page."),
        "reset": ("Reset your password", "Choose a new password here:\n{link}\n\n"
                  "The link expires in 30 minutes. If you did not ask for this, ignore this message."),
    },
    "th": {
        "verify": ("ยืนยันอีเมลของคุณ", "ยินดีต้อนรับ! ยืนยันอีเมลเพื่อสมัครให้เสร็จสิ้น:\n{link}\n\n"
                   "หรือกรอกรหัส 6 หลักนี้ในหน้าสมัครสมาชิก: {code}\n\n"
                   "ลิงก์หมดอายุใน 24 ชั่วโมง ส่วนรหัสหมดอายุใน 10 นาที หากคุณไม่ได้สมัคร โปรดละเว้นอีเมลนี้"),
        "delete": ("ยืนยันการลบบัญชีของคุณ", "มีการขอลบบัญชีของคุณ รวมถึงโปรเจกต์และเอกสารทั้งหมด "
                   "หากต้องการยืนยัน กรอกรหัส 6 หลักนี้: {code}\n\nรหัสหมดอายุใน 10 นาที หากไม่ใช่คุณ โปรดละเว้นอีเมลนี้และเปลี่ยนรหัสผ่าน"),
        "exists": ("คุณมีบัญชีอยู่แล้ว", "มีผู้พยายามสมัครด้วยอีเมลนี้ แต่คุณมีบัญชีอยู่แล้ว "
                   "เข้าสู่ระบบได้ที่ {link}\nลืมรหัสผ่าน? ใช้ลิงก์รีเซ็ตในหน้าเข้าสู่ระบบ"),
        "reset": ("รีเซ็ตรหัสผ่านของคุณ", "ตั้งรหัสผ่านใหม่ที่นี่:\n{link}\n\n"
                  "ลิงก์หมดอายุใน 30 นาที หากคุณไม่ได้ร้องขอ โปรดละเว้นอีเมลนี้"),
    },
}


def _digest(token: str) -> bytes:
    return hashlib.sha256(token.encode("utf-8")).digest()


def is_admin(user: User) -> bool:
    """Operator access comes only from ADMIN_EMAILS (comma-separated); the address must be verified and enabled."""
    allowed = {item.strip().lower() for item in os.environ.get("ADMIN_EMAILS", "").split(",") if item.strip()}
    return user.email_verified_at is not None and user.disabled_at is None and user.email.lower() in allowed


def require_admin(sessions, user_id: UUID | None) -> None:
    with sessions() as db:
        user = db.get(User, user_id) if user_id else None
        if user is None or not is_admin(user):
            raise ServiceError("forbidden")


class Accounts:
    def __init__(self, sessions, owner_sessions: OwnerSessions, mailer, *, public_origin: str, runs: RunService | None = None,
                 workspace_root: Path | None = None):
        self.sessions = sessions
        self.workspace_root = workspace_root.resolve() if workspace_root is not None else None
        self.runs = runs or RunService(sessions)  # RunService; needed by request_deletion to cancel the user's live runs
        self.owner_sessions = owner_sessions
        self.mailer = mailer
        self.public_origin = public_origin.rstrip("/")

    # -- mail ------------------------------------------------------------------------------------
    def _send(self, kind: str, locale: str, to: str, link: str, code: str = "") -> None:
        if self.mailer is None:
            logger.warning("mail_disabled", extra={"kind": kind})
            return
        subject, body = MESSAGES.get(locale, MESSAGES["en"])[kind]
        try:
            self.mailer.send(Mail(to, subject, body.format(link=link, code=code)))
        except Exception:  # noqa: BLE001 - mail must never change the HTTP answer
            logger.warning("mail_send_failed", extra={"kind": kind})

    @staticmethod
    def _issue(db, user_id: UUID, purpose: str, ttl: timedelta) -> str:
        now = datetime.now(timezone.utc)
        db.execute(update(UserToken).where(UserToken.user_id == user_id, UserToken.purpose == purpose,
                                           UserToken.used_at.is_(None)).values(used_at=now))
        token = secrets.token_urlsafe(32)
        db.add(UserToken(user_id=user_id, purpose=purpose, token_hash=_digest(token), expires_at=now + ttl))
        db.flush()
        return token

    @staticmethod
    def _issue_code(db, user_id: UUID, purpose: str) -> str:
        """A six-digit code, stored only as a hash. One row per account and purpose, so a new code replaces the old one."""
        db.execute(delete(UserToken).where(UserToken.user_id == user_id, UserToken.purpose == purpose))
        code = f"{secrets.randbelow(10 ** 6):06d}"
        db.add(UserToken(user_id=user_id, purpose=purpose, token_hash=_digest(f"{user_id}:{code}"),
                         expires_at=datetime.now(timezone.utc) + CODE_TTL))
        db.flush()
        return code

    def _consume_code(self, user_id: UUID, purpose: str, code: str) -> None:
        """Checks a code; five tries per ten minutes for the account, counted whether or not the code is right."""
        self._rate_limit("otp_attempt", f"{user_id}:{purpose}")
        with self.sessions.begin() as db:
            row = db.scalar(select(UserToken).where(UserToken.user_id == user_id, UserToken.purpose == purpose).with_for_update())
            now = datetime.now(timezone.utc)
            ok = row is not None and row.used_at is None and row.expires_at > now and hmac.compare_digest(
                bytes(row.token_hash), _digest(f"{user_id}:{code.strip()}"))
            if not ok:
                raise ServiceError("invalid_code")
            row.used_at = now

    def _consume(self, db, token: str, purpose: str) -> User:
        row = db.scalar(select(UserToken).where(
            UserToken.token_hash == _digest(token), UserToken.purpose == purpose).with_for_update())
        now = datetime.now(timezone.utc)
        if row is None or row.used_at is not None or row.expires_at <= now:
            raise ServiceError("invalid_token")
        row.used_at = now
        return db.get(User, row.user_id)

    def _rate_limit(self, bucket: str, key: str) -> None:
        with self.sessions.begin() as db:  # own transaction so the hit survives a later failure
            rate_limits.hit(db, bucket, key)

    # -- signup / verification -------------------------------------------------------------------
    def signup(self, email: str, password: str, locale: str, ip: str) -> None:
        self._rate_limit("signup_ip", ip)
        email = normalize_email(email)
        check_policy(password)
        locale = locale if locale in MESSAGES else "th"
        password_hash = hash_password(password)  # always hashed, so timing does not reveal existing emails
        mail: tuple[str, str, str, str] | None = None
        try:
            with self.sessions.begin() as db:
                existing = db.scalar(select(User).where(User.email == email))
                if existing is not None:
                    mail = ("exists", existing.locale, email, f"{self.public_origin}/login")
                else:
                    user = User(email=email, password_hash=password_hash, locale=locale)
                    db.add(user)
                    db.flush()
                    token = self._issue(db, user.id, "verify_email", VERIFY_TTL)
                    code = self._issue_code(db, user.id, "verify_code")
                    mail = ("verify", locale, email, f"{self.public_origin}/verify-email?token={token}", code)
        except IntegrityError:  # concurrent signup of the same email won the race
            mail = ("exists", locale, email, f"{self.public_origin}/login")
        self._send(*mail)

    def verify_email(self, token: str) -> None:
        with self.sessions.begin() as db:
            user = self._consume(db, token, "verify_email")
            if user.email_verified_at is None:
                user.email_verified_at = datetime.now(timezone.utc)

    def verify_email_code(self, email: str, code: str) -> None:
        """Sign-up check with the emailed six-digit code. Unknown or already verified addresses answer like a wrong code."""
        try:
            email = normalize_email(email)
        except ServiceError:
            raise ServiceError("invalid_code") from None
        with self.sessions() as db:
            user_id = db.scalar(select(User.id).where(User.email == email))
        if user_id is None:
            self._rate_limit("otp_attempt", f"unknown:{email}")
            raise ServiceError("invalid_code")
        self._consume_code(user_id, "verify_code", code)
        with self.sessions.begin() as db:
            user = db.get(User, user_id)
            if user.email_verified_at is None:
                user.email_verified_at = datetime.now(timezone.utc)

    # -- avatar ----------------------------------------------------------------------------------
    def set_avatar_image(self, user_id: UUID, data: bytes) -> None:
        mime = _image_mime(data)
        if mime is None or not 0 < len(data) <= AVATAR_MAX_BYTES:
            raise ServiceError("invalid_image")
        with self.sessions.begin() as db:
            user = db.get(User, user_id)
            user.avatar_image, user.avatar_mime, user.avatar_updated_at = data, mime, datetime.now(timezone.utc)

    def set_avatar_preset(self, user_id: UUID, preset: str) -> None:
        if preset not in AVATAR_PRESETS:
            raise ServiceError("invalid_image")
        with self.sessions.begin() as db:
            user = db.get(User, user_id)  # choosing a built-in avatar replaces any uploaded picture
            user.avatar_preset, user.avatar_image, user.avatar_mime = preset, None, None
            user.avatar_updated_at = datetime.now(timezone.utc)

    def clear_avatar_image(self, user_id: UUID) -> None:
        with self.sessions.begin() as db:
            user = db.get(User, user_id)
            user.avatar_image, user.avatar_mime, user.avatar_updated_at = None, None, datetime.now(timezone.utc)

    def avatar_image(self, user_id: UUID) -> tuple[bytes, str] | None:
        with self.sessions() as db:
            user = db.get(User, user_id)
            return (bytes(user.avatar_image), user.avatar_mime) if user and user.avatar_image else None

    def send_deletion_code(self, user_id: UUID) -> None:
        with self.sessions.begin() as db:
            user = db.get(User, user_id)
            if user is None:
                raise ServiceError("unauthorized")
            rate_limits.hit(db, "otp_send", str(user_id))
            mail = ("delete", user.locale, user.email, "", self._issue_code(db, user.id, "delete_account"))
        self._send(*mail)

    def resend_verification(self, user_id: UUID) -> None:
        with self.sessions.begin() as db:
            user = db.get(User, user_id)
            if user is None or user.email_verified_at is not None:
                return
            rate_limits.hit(db, "resend_email", user.email)
            mail = ("verify", user.locale, user.email,
                    f"{self.public_origin}/verify-email?token={self._issue(db, user.id, 'verify_email', VERIFY_TTL)}",
                    self._issue_code(db, user.id, "verify_code"))
        self._send(*mail)

    # -- login / logout --------------------------------------------------------------------------
    def login(self, email: str, password: str, ip: str) -> OwnerExchange:
        self._rate_limit("login_ip", ip)
        try:
            email = normalize_email(email)
        except ServiceError:
            verify_dummy(password)
            raise ServiceError("invalid_credentials")
        self._rate_limit("login_email", email)
        with self.sessions() as db:
            user = db.scalar(select(User).where(User.email == email))
            stored = user.password_hash if user is not None else None
            usable = user is not None and user.disabled_at is None
            user_id = user.id if user is not None else None
        if stored is None:
            verify_dummy(password)
        valid = stored is not None and verify_password(password, stored)
        if not (usable and valid):
            raise ServiceError("invalid_credentials")
        return self.owner_sessions.create(user_id)

    def logout(self, cookie: str) -> None:
        self.owner_sessions.revoke(cookie)

    # -- password reset --------------------------------------------------------------------------
    def forgot_password(self, email: str) -> None:
        try:
            email = normalize_email(email)
        except ServiceError:
            return  # same silent answer as an unknown email
        self._rate_limit("forgot_email", email)
        mail = None
        with self.sessions.begin() as db:
            user = db.scalar(select(User).where(User.email == email))
            if user is not None and user.disabled_at is None:
                token = self._issue(db, user.id, "reset_password", RESET_TTL)
                mail = ("reset", user.locale, email, f"{self.public_origin}/reset-password?token={token}")
        if mail is not None:
            self._send(*mail)

    def reset_password(self, token: str, password: str) -> None:
        check_policy(password)
        new_hash = hash_password(password)
        with self.sessions.begin() as db:
            user = self._consume(db, token, "reset_password")
            now = datetime.now(timezone.utc)
            user.password_hash = new_hash
            OwnerSessions.revoke_all(db, user.id, now)

    # -- account ---------------------------------------------------------------------------------
    def account(self, user_id: UUID) -> dict:
        with self.sessions() as db:
            user = db.get(User, user_id)
            if user is None:
                raise ServiceError("unauthorized")
            return {"id": user.id, "email": user.email, "locale": user.locale,
                    "email_verified": user.email_verified_at is not None, "is_admin": is_admin(user),
                    "avatar_preset": user.avatar_preset, "has_avatar_image": user.avatar_image is not None,
                    "avatar_version": user.avatar_updated_at.isoformat() if user.avatar_updated_at else None,
                    "created_at": user.created_at}

    def agents(self, user_id: UUID) -> list[dict]:
        with self.sessions() as db:
            rows = db.execute(select(Grant, Project.name).join(Project, Project.id == Grant.project_id)
                              .where(Project.user_id == user_id).order_by(Grant.expires_at)).all()
            return [{"id": grant.id, "project_id": grant.project_id, "project_name": name, "label": grant.label,
                     "capabilities": sorted(grant.capabilities), "created_at": grant.created_at, "expires_at": grant.expires_at,
                     "revoked_at": grant.revoked_at,
                     "client_id_host": (urlsplit(grant.oauth_client_id).hostname or grant.oauth_client_id) if grant.oauth_client_id else None}
                    for grant, name in rows]

    def request_deletion(self, user_id: UUID, password: str, confirm_email: str, code: str) -> None:
        with self.sessions() as db:
            user = db.get(User, user_id)
            if user is None:
                raise ServiceError("unauthorized")
            email, stored = user.email, user.password_hash
        try:
            matches = normalize_email(confirm_email) == email
        except ServiceError:
            matches = False
        if not matches:
            raise ServiceError("confirmation_mismatch")
        if not verify_password(password, stored):
            raise ServiceError("invalid_credentials")
        self._consume_code(user_id, "delete_account", code)
        now = datetime.now(timezone.utc)
        with self.sessions.begin() as db:
            # Lock order: projects (by id), then the user row, then runs (by id) - projects before user, as
            # every other path that takes both, so two transactions cannot wait on each other.
            db.execute(select(Project.id).where(Project.user_id == user_id).order_by(Project.id).with_for_update())
            user = db.get(User, user_id, with_for_update=True)
            user.deletion_requested_at = now
            user.disabled_at = user.disabled_at or now
            OwnerSessions.revoke_all(db, user_id, now)
            db.execute(update(Grant).where(
                Grant.project_id.in_(select(Project.id).where(Project.user_id == user_id)),
                Grant.revoked_at.is_(None)).values(revoked_at=now))
            live = db.scalars(select(Run).where(
                Run.project_id.in_(select(Project.id).where(Project.user_id == user_id)),
                Run.status.in_(("queued", "running", "waiting_approval", "needs_input"))
            ).order_by(Run.id).with_for_update()).all()
            for run in live:
                self.runs.cancel_locked(db, run, now)

    # -- purge -----------------------------------------------------------------------------------
    async def purge_due(self, store, *, now: datetime | None = None) -> int:
        """Delete accounts whose deletion was requested: objects first, then the user row (cascades the rest).

        A user whose objects cannot all be removed is skipped and retried next cycle. Returns users purged.
        """
        now = now or datetime.now(timezone.utc)

        def pending():
            with self.sessions() as db:
                return db.execute(select(User.id, User.deletion_requested_at).where(
                    User.deletion_requested_at.is_not(None)).order_by(User.deletion_requested_at)).all()

        def keys_of(user_id):
            with self.sessions() as db:
                return list(db.scalars(select(StoredFile.storage_key).join(Project, Project.id == StoredFile.project_id)
                                       .where(Project.user_id == user_id)))

        def project_ids(user_id):
            with self.sessions() as db:
                return list(db.scalars(select(Project.id).where(Project.user_id == user_id)))

        def busy(user_id):
            """True while a worker may still run for the user: a non-terminal run or a held lease."""
            with self.sessions() as db:
                return db.scalar(select(Run.id).where(
                    Run.project_id.in_(select(Project.id).where(Project.user_id == user_id)),
                    Run.status.not_in(("completed", "failed", "cancelled", "interrupted"))
                    | Run.lease_owner.is_not(None)).limit(1)) is not None

        def wipe_workspaces(ids):
            if self.workspace_root is None:
                return
            for project_id in ids:
                path = self.workspace_root / str(project_id)
                if path.is_symlink():
                    path.unlink()  # never follow a link out of the workspace root
                elif path.exists():
                    if not path.resolve().is_relative_to(self.workspace_root):
                        raise ValueError("workspace_outside_root")
                    shutil.rmtree(path)

        def drop(user_id):
            with self.sessions.begin() as db:
                # runs -> sessions has no ON DELETE CASCADE, so the project cascade would trip over it.
                db.execute(delete(Run).where(Run.project_id.in_(select(Project.id).where(Project.user_id == user_id))))
                db.execute(delete(User).where(User.id == user_id))

        purged = 0
        for user_id, requested_at in await asyncio.to_thread(pending):
            if now - requested_at > timedelta(hours=24):
                logger.warning("account_purge_overdue", extra={"user_id": str(user_id)})
            try:
                if await asyncio.to_thread(busy, user_id):
                    continue  # a cancelled run's worker is still winding down; retry next cycle
                for key in await asyncio.to_thread(keys_of, user_id):
                    try:
                        await store.delete(key)
                    except ClientError as exc:
                        if not _is_missing(exc):
                            raise
                await asyncio.to_thread(wipe_workspaces, await asyncio.to_thread(project_ids, user_id))
                await asyncio.to_thread(drop, user_id)
            except Exception as exc:  # noqa: BLE001 - one stuck user must not block the rest; retry next cycle
                logger.warning("account_purge_failed", extra={"user_id": str(user_id), "error": type(exc).__name__})
                continue
            purged += 1
            logger.info("account_purged", extra={"user_id": str(user_id)})
        return purged

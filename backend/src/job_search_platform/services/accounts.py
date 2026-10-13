"""Signup, email verification, login, password reset and account deletion.

All methods are synchronous; routes call them with ``asyncio.to_thread``. Neither tokens, passwords nor
email addresses are ever logged.
"""
from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from job_search_platform.db.models import Grant, Project, User, UserToken
from job_search_platform.integrations.mailer import Mail
from job_search_platform.services import rate_limits
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.owner_sessions import OwnerExchange, OwnerSessions
from job_search_platform.services.passwords import (
    check_policy, hash_password, normalize_email, verify_dummy, verify_password,
)

logger = logging.getLogger(__name__)

VERIFY_TTL = timedelta(hours=24)
RESET_TTL = timedelta(minutes=30)
# kind -> (subject, body); the body holds a {link} placeholder where a link applies.
MESSAGES = {
    "en": {
        "verify": ("Verify your email", "Welcome! Confirm your email address to finish signing up:\n{link}\n\n"
                   "The link expires in 24 hours. If you did not sign up, ignore this message."),
        "exists": ("You already have an account", "Someone tried to sign up with this email, but you already have "
                   "an account. Log in at {link}\nForgot your password? Use the reset link on the login page."),
        "reset": ("Reset your password", "Choose a new password here:\n{link}\n\n"
                  "The link expires in 30 minutes. If you did not ask for this, ignore this message."),
    },
    "th": {
        "verify": ("ยืนยันอีเมลของคุณ", "ยินดีต้อนรับ! ยืนยันอีเมลเพื่อสมัครให้เสร็จสิ้น:\n{link}\n\n"
                   "ลิงก์หมดอายุใน 24 ชั่วโมง หากคุณไม่ได้สมัคร โปรดละเว้นอีเมลนี้"),
        "exists": ("คุณมีบัญชีอยู่แล้ว", "มีผู้พยายามสมัครด้วยอีเมลนี้ แต่คุณมีบัญชีอยู่แล้ว "
                   "เข้าสู่ระบบได้ที่ {link}\nลืมรหัสผ่าน? ใช้ลิงก์รีเซ็ตในหน้าเข้าสู่ระบบ"),
        "reset": ("รีเซ็ตรหัสผ่านของคุณ", "ตั้งรหัสผ่านใหม่ที่นี่:\n{link}\n\n"
                  "ลิงก์หมดอายุใน 30 นาที หากคุณไม่ได้ร้องขอ โปรดละเว้นอีเมลนี้"),
    },
}


def _digest(token: str) -> bytes:
    return hashlib.sha256(token.encode("utf-8")).digest()


class Accounts:
    def __init__(self, sessions, owner_sessions: OwnerSessions, mailer, *, public_origin: str):
        self.sessions = sessions
        self.owner_sessions = owner_sessions
        self.mailer = mailer
        self.public_origin = public_origin.rstrip("/")

    # -- mail ------------------------------------------------------------------------------------
    def _send(self, kind: str, locale: str, to: str, link: str) -> None:
        if self.mailer is None:
            logger.warning("mail_disabled", extra={"kind": kind})
            return
        subject, body = MESSAGES.get(locale, MESSAGES["en"])[kind]
        try:
            self.mailer.send(Mail(to, subject, body.format(link=link)))
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
                    mail = ("verify", locale, email, f"{self.public_origin}/verify-email?token={token}")
        except IntegrityError:  # concurrent signup of the same email won the race
            mail = ("exists", locale, email, f"{self.public_origin}/login")
        self._send(*mail)

    def verify_email(self, token: str) -> None:
        with self.sessions.begin() as db:
            user = self._consume(db, token, "verify_email")
            if user.email_verified_at is None:
                user.email_verified_at = datetime.now(timezone.utc)

    def resend_verification(self, user_id: UUID) -> None:
        with self.sessions.begin() as db:
            user = db.get(User, user_id)
            if user is None or user.email_verified_at is not None:
                return
            rate_limits.hit(db, "resend_email", user.email)
            mail = ("verify", user.locale, user.email,
                    f"{self.public_origin}/verify-email?token={self._issue(db, user.id, 'verify_email', VERIFY_TTL)}")
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
                    "email_verified": user.email_verified_at is not None, "created_at": user.created_at}

    def agents(self, user_id: UUID) -> list[dict]:
        with self.sessions() as db:
            rows = db.execute(select(Grant, Project.name).join(Project, Project.id == Grant.project_id)
                              .where(Project.user_id == user_id).order_by(Grant.expires_at)).all()
            return [{"id": grant.id, "project_id": grant.project_id, "project_name": name, "label": grant.label,
                     "capabilities": sorted(grant.capabilities), "created_at": grant.created_at, "expires_at": grant.expires_at,
                     "revoked_at": grant.revoked_at} for grant, name in rows]

    def request_deletion(self, user_id: UUID, password: str, confirm_email: str) -> None:
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
        now = datetime.now(timezone.utc)
        with self.sessions.begin() as db:
            user = db.get(User, user_id, with_for_update=True)
            user.deletion_requested_at = now
            user.disabled_at = user.disabled_at or now
            OwnerSessions.revoke_all(db, user_id, now)
            db.execute(update(Grant).where(
                Grant.project_id.in_(select(Project.id).where(Project.user_id == user_id)),
                Grant.revoked_at.is_(None)).values(revoked_at=now))
        # Task 7 cancels queued/running runs here and adds the purge worker.

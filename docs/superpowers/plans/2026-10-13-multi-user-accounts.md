# Multi-user Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-owner loopback launch with email and password accounts. Each user owns their projects and sees only their own data. Grants and LLM runs require a verified email, runs have a daily quota, and account deletion purges the user's data.

**Architecture:**
- Add `users`, `user_tokens` and `rate_limit_events` tables, plus `projects.user_id` (ON DELETE CASCADE).
- `owner_sessions` gains `user_id` and stays the cookie session store (same CSRF scheme).
- `Actor` gains `user_id`, and its kind becomes `"user" | "grant"`.
- `authorize()` adds the project ownership check. Routes that do not pass through `authorize()` filter by `Project.user_id`.
- A new `Accounts` service backs the `/auth/*` and `/account` routes.
- A purge step in the supervisor loop hard-deletes users who requested deletion.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.1 ORM, Alembic, PostgreSQL 17, stdlib `hashlib.scrypt` and `smtplib`, React 19 with react-router and i18next, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-13-multi-user-accounts-design.md`. It is the binding authority; read it before any task.

**Worktree:** `/Users/parksurakiat/AI-Job-Search-Agent-Platform-dem-worktrees/accounts`, branch `feat/multi-user-accounts`. Run every command from the worktree root. Never modify `/Users/parksurakiat/AI-Job-Search-Agent-Platform-dem`; the owner's app runs from there.

## Global Constraints

- **No new runtime dependencies.** Password hashing uses `hashlib.scrypt` and email uses `smtplib`, both stdlib.
- **Password hash format:** `scrypt$<n>$<r>$<p>$<salt b64>$<hash b64>`, with n=2**17, r=8, p=1, a 16-byte salt and a 64-byte key. Compare with `hmac.compare_digest`.
- **Password policy:** 10–128 characters, no composition rules. A violation raises `weak_password` (422).
- **Token lifetimes:** `verify_email` 24 h and `reset_password` 30 min. Tokens are one-use. The database stores only the sha256 of a token. Issuing a new token supersedes the user's older unused tokens of the same purpose.
- **Sessions:** expire at the earlier of 7 days after `last_seen_at` and 30 days after `created_at`. Refresh `last_seen_at` at most once per hour. The cookie is `jsp_owner_session`, `HttpOnly`, `SameSite=Strict`, and `Secure` when `APP_PUBLIC_ORIGIN` is https.
- **Daily quota:** `USER_DAILY_RUN_QUOTA` defaults to 30 runs per user per Asia/Bangkok day, using `services.approvals.budget_day_start`. Exceeding it returns 429 `quota_exceeded` with field `reset_at` (ISO-8601).
- **Rate limits:** a hit returns 429 `rate_limited` with field `retry_after` (seconds, as a string).

  | Bucket | Limit |
  |---|---|
  | signup per IP | 5 per 3600 s |
  | login per IP | 10 per 900 s |
  | login per email | 10 per 900 s |
  | resend per email | 3 per 3600 s |
  | forgot per email | 3 per 3600 s |

- **Error codes:** `email_unverified` 403, `quota_exceeded` 429, `rate_limited` 429, `invalid_credentials` 401, `invalid_token` 400, `weak_password` 422, `confirmation_mismatch` 422. A cross-user project access returns `not_found` 404, never 403.
- **Signup, forgot password and resend verification** always answer `202 {"status":"check_email"}`. The response never reveals whether an email has an account.
- **Logging:** never log raw tokens, passwords or email addresses. Langfuse spans must not carry email or user id.
- **Commits:** one commit per task at minimum, conventional messages. End each commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not push.
- **Shell output:** an `rtk` hook may condense command output. If a result looks empty or garbled, re-run it as `rtk proxy <cmd>`.
- **Backend tests:** `uv run --locked --project backend pytest <paths> -q`. Postgres-backed tests read credentials from `CORE02_PRIVATE_DIR`, defaulting to `~/.cache/job-search-platform/core02-runtime-20261003`; the owner's dev Postgres on 55432 already has these. Tests needing MinIO or Hermes carry `@pytest.mark.integration`.
- **Frontend checks:** `npm run build --prefix frontend`. For Playwright, run `npx playwright test` from `tests/` with `PLAYWRIGHT_OUTPUT_DIR` set to a scratch dir. The config starts Vite on port 4175.

## Review Focus

1. **Cross-user access through a route that skips `authorize()`.** The routes are: projects list, create, get, patch and delete; session patch, delete and restore; gateway; tools. Each must 404 for another user's project. Tested in Task 5.
2. **An old `"owner"` run scope after migration.** Queued runs with `actor_scope="owner"` must not run as some other user. `claim-existing` rewrites them, and the queue treats a bare `"owner"` as not current. Tested in Tasks 3 and 8.
3. **Concurrent run submits at quota − 1.** Exactly one may succeed (the user row is locked). Tested in Task 6.
4. **A grant whose project owner is disabled or unverified.** The grant must stop working for runs, and for everything once the owner is disabled. Tested in Task 6.
5. **Email case and whitespace.** `" A@X.com "` and `"a@x.com"` are the same account at signup, login, forgot and deletion confirmation. Tested in Task 4.

---

## File Structure

| File | Responsibility |
|---|---|
| `backend/migrations/versions/0022_users.py` (create) | Schema changes |
| `backend/src/job_search_platform/db/models.py` (modify) | `User`, `UserToken`, `RateLimitEvent`; `Project.user_id`; `OwnerSession.user_id` and `last_seen_at`; remove `OwnerLaunchNonce` |
| `backend/src/job_search_platform/services/passwords.py` (create) | Policy, hash, verify |
| `backend/src/job_search_platform/services/rate_limits.py` (create) | Postgres window limiter |
| `backend/src/job_search_platform/integrations/mailer.py` (create) | `Mail`, `SmtpMailer`, `MemoryMailer` |
| `backend/src/job_search_platform/services/owner_sessions.py` (modify) | Becomes user sessions: create, authenticate, CSRF, revoke; launch nonce removed |
| `backend/src/job_search_platform/services/accounts.py` (create) | signup, verify, resend, login, logout, forgot, reset, account view, agents list, request deletion, purge |
| `backend/src/job_search_platform/services/quota.py` (create) | Daily run quota and verified-owner gate |
| `backend/src/job_search_platform/api/accounts.py` (create) | `/auth/*` and `/account*` routes |
| `services/contracts.py`, `authorization.py`, `runs.py`, `grants.py`, `workers/queue.py`, `workers/supervisor.py`, `api/rest.py`, `api/dependencies.py`, `main.py` (modify) | Actor, ownership, gates, queue fairness, purge, wiring |
| `scripts/accounts.py` (create), `scripts/run_local.py` (modify) | CLI; launcher prints the URL |
| `infra/compose.yaml` (modify) | Mailpit |
| `docs/contracts/application-api.yaml` (modify) | Contract for new and removed routes |
| `frontend/src/lib/api.ts`, `api-types.ts`, `app/router.tsx` (modify); `frontend/src/features/auth/*` and `features/account/*` (create); `locales/*.json` (modify) | Web UI |
| `tests/fixtures/application.ts` (modify), `tests/e2e/accounts.spec.ts` (create) | Browser tests |

---

### Task 1: Password, rate-limit and mailer primitives

**Files:**
- Create: `backend/src/job_search_platform/services/passwords.py`, `backend/src/job_search_platform/integrations/mailer.py`
- Test: `backend/tests/unit/test_passwords.py`, `backend/tests/unit/test_mailer.py`

(`rate_limits.py` needs the schema, so it lives in Task 2.)

**Interfaces produced:**
- `passwords.check_policy(password: str) -> None` raises `ServiceError("weak_password")`.
- `passwords.hash_password(password: str) -> str`
- `passwords.verify_password(password: str, encoded: str) -> bool`
- `passwords.verify_dummy(password: str) -> None` runs one verify against a lazily built dummy hash. Use it for unknown emails so timing does not reveal them.
- Module constants `SCRYPT_N`, `SCRYPT_R`, `SCRYPT_P`, so tests can lower N.
- `mailer.Mail(to: str, subject: str, text: str)`, a frozen dataclass.
- `mailer.SmtpMailer(host, port, username, password, sender, starttls).send(mail) -> None`
- `mailer.SmtpMailer.from_env() -> SmtpMailer | None`. Returns `None` when `SMTP_HOST` is unset.
- `mailer.MemoryMailer()` with `.sent: list[Mail]` and `.send(mail)`.

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/unit/test_passwords.py
import pytest
from job_search_platform.services import passwords
from job_search_platform.services.errors import ServiceError


@pytest.fixture(autouse=True)
def fast_scrypt(monkeypatch):
    monkeypatch.setattr(passwords, "SCRYPT_N", 2**10)


def test_round_trip_and_format():
    encoded = passwords.hash_password("correct horse battery")
    algo, n, r, p, salt, key = encoded.split("$")
    assert (algo, n, r, p) == ("scrypt", str(2**10), "8", "1")
    assert passwords.verify_password("correct horse battery", encoded)
    assert not passwords.verify_password("correct horse batterY", encoded)


def test_verify_uses_parameters_stored_in_hash(monkeypatch):
    encoded = passwords.hash_password("correct horse battery")
    monkeypatch.setattr(passwords, "SCRYPT_N", 2**11)
    assert passwords.verify_password("correct horse battery", encoded)


@pytest.mark.parametrize("bad", ["", "short", "x" * 9, "x" * 129])
def test_policy_rejects_length(bad):
    with pytest.raises(ServiceError) as err:
        passwords.check_policy(bad)
    assert err.value.code == "weak_password"


@pytest.mark.parametrize("ok", ["x" * 10, "x" * 128, "รหัสผ่านภาษาไทยยาว"])
def test_policy_accepts_length(ok):
    passwords.check_policy(ok)


@pytest.mark.parametrize("garbage", ["", "plain", "scrypt$1$2", "bcrypt$a$b$c$d$e", "scrypt$x$8$1$AA$AA"])
def test_verify_rejects_malformed_hash(garbage):
    assert passwords.verify_password("whatever-password", garbage) is False


def test_verify_dummy_returns_none():
    assert passwords.verify_dummy("anything-at-all") is None
```

```python
# backend/tests/unit/test_mailer.py
from job_search_platform.integrations.mailer import Mail, MemoryMailer, SmtpMailer


def test_memory_mailer_records():
    m = MemoryMailer()
    m.send(Mail("a@x.com", "s", "t"))
    assert m.sent == [Mail("a@x.com", "s", "t")]


def test_from_env_none_without_host(monkeypatch):
    monkeypatch.delenv("SMTP_HOST", raising=False)
    assert SmtpMailer.from_env() is None


def test_from_env_reads_settings(monkeypatch):
    for key, value in {"SMTP_HOST": "127.0.0.1", "SMTP_PORT": "51025", "SMTP_FROM": "no-reply@example.test",
                       "SMTP_STARTTLS": "false"}.items():
        monkeypatch.setenv(key, value)
    m = SmtpMailer.from_env()
    assert (m.host, m.port, m.sender, m.starttls) == ("127.0.0.1", 51025, "no-reply@example.test", False)


def test_smtp_send_uses_smtplib(monkeypatch):
    calls = []

    class FakeSMTP:
        def __init__(self, host, port, timeout):
            calls.append(("connect", host, port))
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def starttls(self): calls.append(("starttls",))
        def login(self, u, p): calls.append(("login", u))
        def send_message(self, msg): calls.append(("send", msg["To"], msg["Subject"]))

    monkeypatch.setattr("smtplib.SMTP", FakeSMTP)
    SmtpMailer("h", 25, "u", "p", "from@x.test", True).send(Mail("to@x.test", "Subj", "Body"))
    assert calls == [("connect", "h", 25), ("starttls",), ("login", "u"), ("send", "to@x.test", "Subj")]
```

- [ ] **Step 2: Run tests and confirm they fail**

Run: `uv run --locked --project backend pytest backend/tests/unit/test_passwords.py backend/tests/unit/test_mailer.py -q`
Expected: collection error (`ModuleNotFoundError`).

- [ ] **Step 3: Implement**

```python
# backend/src/job_search_platform/services/passwords.py
"""Password policy and stdlib scrypt hashing (self-describing hash strings)."""
from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
from functools import lru_cache

from job_search_platform.services.errors import ServiceError

MIN_LENGTH, MAX_LENGTH = 10, 128
SCRYPT_N, SCRYPT_R, SCRYPT_P = 2**17, 8, 1
SALT_BYTES, KEY_BYTES = 16, 64


def check_policy(password: str) -> None:
    if not isinstance(password, str) or not MIN_LENGTH <= len(password) <= MAX_LENGTH:
        raise ServiceError("weak_password")


def _derive(password: str, salt: bytes, n: int, r: int, p: int) -> bytes:
    return hashlib.scrypt(password.encode("utf-8"), salt=salt, n=n, r=r, p=p,
                          maxmem=256 * 1024 * 1024, dklen=KEY_BYTES)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(SALT_BYTES)
    key = _derive(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P)
    b64 = lambda raw: base64.b64encode(raw).decode("ascii")
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${b64(salt)}${b64(key)}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algo, n, r, p, salt, key = encoded.split("$")
        if algo != "scrypt":
            return False
        expected = base64.b64decode(key, validate=True)
        actual = _derive(password, base64.b64decode(salt, validate=True), int(n), int(r), int(p))
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual, expected)


@lru_cache(maxsize=1)
def _dummy_hash() -> str:
    return hash_password(secrets.token_urlsafe(16))


def verify_dummy(password: str) -> None:
    """Spend the same work as a real check, so unknown emails are not distinguishable by timing."""
    verify_password(password, _dummy_hash())
```

```python
# backend/src/job_search_platform/integrations/mailer.py
"""Outbound email: stdlib SMTP in production, an in-memory recorder in tests."""
from __future__ import annotations

import os
import smtplib
from dataclasses import dataclass, field
from email.message import EmailMessage


@dataclass(frozen=True)
class Mail:
    to: str
    subject: str
    text: str


@dataclass
class SmtpMailer:
    host: str
    port: int
    username: str | None
    password: str | None = field(repr=False)
    sender: str
    starttls: bool

    @classmethod
    def from_env(cls) -> "SmtpMailer | None":
        host = os.environ.get("SMTP_HOST")
        if not host:
            return None
        return cls(host, int(os.environ.get("SMTP_PORT", "587")), os.environ.get("SMTP_USERNAME") or None,
                   os.environ.get("SMTP_PASSWORD") or None,
                   os.environ.get("SMTP_FROM", "no-reply@localhost"),
                   os.environ.get("SMTP_STARTTLS", "true").lower() == "true")

    def send(self, mail: Mail) -> None:
        message = EmailMessage()
        message["From"], message["To"], message["Subject"] = self.sender, mail.to, mail.subject
        message.set_content(mail.text)
        with smtplib.SMTP(self.host, self.port, timeout=15) as smtp:
            if self.starttls:
                smtp.starttls()
            if self.username:
                smtp.login(self.username, self.password or "")
            smtp.send_message(message)


@dataclass
class MemoryMailer:
    sent: list[Mail] = field(default_factory=list)

    def send(self, mail: Mail) -> None:
        self.sent.append(mail)
```

- [ ] **Step 4: Run tests and confirm they pass**

Same command. Expected: all pass, with no warnings.

- [ ] **Step 5: Commit**

```bash
rtk git add backend/src/job_search_platform/services/passwords.py backend/src/job_search_platform/integrations/mailer.py backend/tests/unit/test_passwords.py backend/tests/unit/test_mailer.py
rtk git commit -m "feat(accounts): scrypt password hashing and SMTP mailer primitives"
```

---

### Task 2: Schema, models and rate limiter

**Files:**
- Create: `backend/migrations/versions/0022_users.py`, `backend/src/job_search_platform/services/rate_limits.py`
- Modify: `backend/src/job_search_platform/db/models.py` (add models; `Project.user_id` at ~line 19; `OwnerSession` at ~296; delete `OwnerLaunchNonce` at ~306)
- Test: `backend/tests/integration/test_users_schema.py`, `backend/tests/integration/test_rate_limits.py`

**Interfaces produced:**
- Models `User`, `UserToken`, `RateLimitEvent`, with columns exactly as in spec §Data model.
- `Project.user_id: Mapped[uuid.UUID | None]`
- `OwnerSession.user_id: Mapped[uuid.UUID]` and `OwnerSession.last_seen_at: Mapped[datetime]`
- `rate_limits.LIMITS: dict[str, tuple[int, int]]` with keys `signup_ip`, `login_ip`, `login_email`, `resend_email`, `forgot_email`
- `rate_limits.hit(db, bucket: str, key: str, *, now: datetime | None = None) -> None` raises `ServiceError("rate_limited", fields={"retry_after": "<int seconds>"})`
- `rate_limits.prune(db, *, now=None) -> int` deletes rows older than 24 h.
- `normalize_email(raw: str) -> str` in `services/passwords.py` (append it there). It strips, lower-cases, and requires exactly one `@` with non-empty sides and a total of 254 characters or fewer. Otherwise it raises `ServiceError("invalid_email")`.

Migration `0022_users` (`down_revision = "0021_gateway_runs"`), following the style of 0021:
1. Create `users`:
   - `id` uuid pk
   - `email` varchar(254), not null, unique, `CHECK (email = lower(email) AND email LIKE '%_@_%')`
   - `password_hash` varchar(255), not null
   - `locale` varchar(2), not null, default `'th'`, `CHECK (locale IN ('th','en'))`
   - `email_verified_at`, `disabled_at`, `deletion_requested_at`: timestamptz, nullable
   - `created_at` timestamptz, default `now()`
2. Create `user_tokens`:
   - `id` uuid pk
   - `user_id` FK `users.id` ON DELETE CASCADE, not null, indexed
   - `purpose` varchar(20), `CHECK (purpose IN ('verify_email','reset_password'))`
   - `token_hash` bytea, unique, not null
   - `expires_at` timestamptz, not null
   - `used_at` timestamptz, nullable
3. Create `rate_limit_events`:
   - `id` bigserial pk
   - `bucket` varchar(40)
   - `key_hash` bytea
   - `created_at` timestamptz, default `now()`
   - index `ix_rate_limit_events_lookup (bucket, key_hash, created_at)`
4. Projects: `ALTER TABLE projects ADD COLUMN user_id uuid NULL REFERENCES users(id) ON DELETE CASCADE`, plus index `ix_projects_user_id`.
5. Owner sessions:
   - `DELETE FROM owner_sessions`. These are old loopback sessions and every user must log in again.
   - Add `user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE` with index `ix_owner_sessions_user_id`.
   - Add `last_seen_at timestamptz NOT NULL DEFAULT now()`.
6. `DROP TABLE owner_launch_nonces`.
7. Downgrade: recreate `owner_launch_nonces` with its 0001 DDL, delete from `owner_sessions`, drop the added columns, then drop the three new tables.

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/integration/test_users_schema.py
import pytest
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError

from job_search_platform.db.models import Project, User


def test_users_schema_and_project_cascade(db_session):
    user = User(email="a@example.test", password_hash="scrypt$1$8$1$AA==$AA==", locale="en")
    db_session.add(user)
    db_session.flush()
    project = Project(name="P", user_id=user.id)
    db_session.add(project)
    db_session.flush()
    db_session.delete(user)
    db_session.flush()
    assert db_session.get(Project, project.id) is None


def test_email_must_be_lowercase(db_session):
    db_session.add(User(email="A@example.test", password_hash="x", locale="en"))
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_launch_nonce_table_is_gone(db_session):
    assert "owner_launch_nonces" not in inspect(db_session.bind).get_table_names()
    cols = {c["name"] for c in inspect(db_session.bind).get_columns("owner_sessions")}
    assert {"user_id", "last_seen_at"} <= cols
```

```python
# backend/tests/integration/test_rate_limits.py
from datetime import datetime, timedelta, timezone
import pytest
from job_search_platform.services import rate_limits
from job_search_platform.services.errors import ServiceError


def test_window_blocks_then_releases(db_session):
    now = datetime(2026, 10, 13, 12, tzinfo=timezone.utc)
    for _ in range(5):
        rate_limits.hit(db_session, "signup_ip", "10.0.0.1", now=now)
    with pytest.raises(ServiceError) as err:
        rate_limits.hit(db_session, "signup_ip", "10.0.0.1", now=now + timedelta(seconds=10))
    assert err.value.code == "rate_limited" and int(err.value.fields["retry_after"]) > 0
    rate_limits.hit(db_session, "signup_ip", "10.0.0.2", now=now)  # other key unaffected
    rate_limits.hit(db_session, "signup_ip", "10.0.0.1", now=now + timedelta(seconds=3601))


def test_prune_removes_old_rows(db_session):
    old = datetime(2026, 10, 1, tzinfo=timezone.utc)
    rate_limits.hit(db_session, "login_ip", "k", now=old)
    assert rate_limits.prune(db_session, now=old + timedelta(days=2)) == 1
```

Add `normalize_email` cases to `backend/tests/unit/test_passwords.py`:

```python
@pytest.mark.parametrize("raw,expected", [(" A@X.com ", "a@x.com"), ("a@x.com", "a@x.com")])
def test_normalize_email(raw, expected):
    assert passwords.normalize_email(raw) == expected


@pytest.mark.parametrize("bad", ["", "ax.com", "a@", "@x.com", "a@b@c", "a" * 250 + "@x.com"])
def test_normalize_email_rejects(bad):
    with pytest.raises(ServiceError):
        passwords.normalize_email(bad)
```

- [ ] **Step 2: Run tests and confirm they fail**

Run: `uv run --locked --project backend pytest backend/tests/integration/test_users_schema.py backend/tests/integration/test_rate_limits.py backend/tests/unit/test_passwords.py -q`
Expected: import errors.

- [ ] **Step 3: Implement the models, migration, `rate_limits.py` and `normalize_email`**

`rate_limits.hit`:
- Hash the key with `sha256(key.encode())`.
- Lock with `pg_advisory_xact_lock(hashtext(bucket || key_hex))` so two concurrent hits cannot both pass.
- Count rows where `created_at > now - window`. If `count >= limit`, compute `retry_after = window - (now - oldest_in_window)` (at least 1 s) and raise.
- Otherwise insert a row with `created_at=now`.

The model must declare `__table_args__` matching the migration's checks and indexes, so that `test_schema` metadata comparisons keep passing.

- [ ] **Step 4: Run tests and confirm they pass, then run the schema suite**

Run the Step 2 command, then `uv run --locked --project backend pytest backend/tests/integration/test_schema.py -q`.
Expected: the new tests pass. `test_schema` may fail only where it references `OwnerLaunchNonce` or owner session columns; Task 3 rewrites those. List any such failures in the report.

- [ ] **Step 5: Commit**

```bash
rtk git add backend/migrations/versions/0022_users.py backend/src/job_search_platform/db/models.py backend/src/job_search_platform/services/rate_limits.py backend/src/job_search_platform/services/passwords.py backend/tests
rtk git commit -m "feat(accounts): users, tokens and rate-limit schema"
```

---

### Task 3: User actor, sessions and ownership in `authorize()`

This is the large mechanical task. It switches the whole backend from the anonymous owner to a user who owns projects.

**Files:**
- Modify:
  - `services/contracts.py:22-27` (`Actor`)
  - `services/owner_sessions.py` (whole file)
  - `services/authorization.py:26-45`
  - `services/runs.py`: `actor_scope` at 80-86, literal `actor_scope="owner"` at 593, 783, 832 and 881, `_requester` at 971-974, plus every `kind == "owner"` / `kind != "owner"` check listed in the inventory
  - `services/files.py:544`, `services/documents.py:336, 362, 420, 493`, `services/approvals.py:89, 183, 378`
  - `workers/queue.py:240-262` (`_scope_is_current`)
  - `api/rest.py`: delete `/owner/bootstrap` (177) and `/owner/session` (190); change `_owner_only` (86-88) and line 952
  - `api/dependencies.py` (the dependencies stay; only `OwnerSessions` method names change)
  - `main.py:62-78, 141` and the OpenAPI no-security list at `main.py:327-335`
  - `scripts/run_local.py:33-73`: remove nonce creation, the fragment link and `webbrowser.open(link)`, and print `f"App: {scheme_host}/login"` instead
  - `docs/contracts/application-api.yaml`: remove `/owner/bootstrap` and `/owner/session` and their schemas
- Test:
  - Modify `backend/tests/helpers.py`, `backend/tests/test_owner_sessions.py`, and every test that calls `create_launch_nonce` or `/owner/bootstrap` (`integration/test_rest_api.py`, `test_job_application_status.py`, `test_security_boundaries.py`, `test_application_startup.py`, `test_surface_parity.py`, `test_sse.py`).
  - Create `backend/tests/integration/test_project_ownership.py`.

**Interfaces produced (later tasks rely on these exact names):**
- `Actor` (frozen dataclass): `kind: Literal["user", "grant"]`, `owner_session_id`, `grant_id`, `project_id`, `capabilities`, and a new last field `user_id: UUID | None = None`.
  - A user actor is `Actor("user", session_id, None, None, frozenset(), user_id)`.
  - A grant actor is built in `services/grants.py:56` and must now pass `user_id=<project owner id>`; load the project's `user_id` in the same query.
- `services/owner_sessions.py` keeps its name and the class `OwnerSessions`:
  - `__init__(self, sessions, *, public_origin: str, idle_ttl=timedelta(days=7), absolute_ttl=timedelta(days=30))`. Allowed origin = `public_origin`. Allowed host = its netloc. Any scheme and host are allowed; the loopback-only validation is removed.
  - `secure_cookies: bool` property, true when `public_origin` starts with `https://`.
  - `create(self, user_id: UUID) -> OwnerExchange`, synchronous, used inside `asyncio.to_thread` by callers. It inserts an `OwnerSession(user_id=..., expires_at=now+absolute_ttl, last_seen_at=now)` and returns the cookie, CSRF token, actor and expiry.
  - `authenticate`, `validate_write` and `current` keep their signatures. `_authenticate` must:
    - Reject the session if the user is disabled, if `last_seen_at + idle_ttl <= now`, or if `expires_at <= now`.
    - Refresh `last_seen_at` when it is more than 1 h old.
    - Return the user actor.
  - `revoke(self, cookie: str) -> None` and `revoke_all(self, db, user_id: UUID, now) -> None`. `revoke_all` sets `revoked_at` on the user's live sessions inside the caller's transaction.
  - Removed: `create_launch_nonce`, `exchange`, `LaunchToken`.
- `authorize()`, user branch:
  - The session row must belong to `actor.user_id` and not be revoked or expired.
  - The user must not be disabled.
  - Then require `db.scalar(select(Project.user_id).where(Project.id == project_id)) == actor.user_id`; otherwise raise `ServiceError("not_found")`.
  - The grant branch does not change, plus one check: a disabled project owner raises `unauthorized`.
- `runs.actor_scope(actor)` returns `f"user:{actor.user_id}"` for users. The literal `actor_scope="owner"` sites become `actor_scope(actor)`.
- `_requester`: a `user:` prefix maps to `RunRequester(kind="owner")`. The API DTO value stays `"owner"`, so the contract does not change.
- `queue._scope_is_current`:
  - `scope.startswith("user:")` is current when that user exists, is not disabled and owns `project_id`.
  - The bare legacy `"owner"` is never current.
- `_owner_only(actor)` requires `actor.kind == "user"`. Rename every `kind == "owner"` check to `"user"`; the semantics are unchanged.
- Test helpers in `backend/tests/helpers.py`:
  - `user(db, *, email=None, verified=True, expires_in=timedelta(hours=1)) -> Actor` inserts a `User` (email defaults to `f"u{uuid4().hex[:8]}@example.test"`, password_hash `"x"`) and an `OwnerSession`, and returns the user actor.
  - `project(db, name="Synthetic Project", *, owner: Actor | None = None)` sets `user_id=owner.user_id` when given.
  - `owner = user` is kept as an alias so the ~80 call sites keep working. The `project()` callers that pair with an owner actor must pass `owner=`. Update them file by file; the isolation check makes a missing owner fail loudly with `not_found`.
  - `login_cookie(services, user_id) -> tuple[str, str]` returns the cookie and CSRF from `services.owner_sessions.create(user_id)`. It replaces the launch and bootstrap flow in REST tests: set `client.cookies.set("jsp_owner_session", cookie)` and send `X-CSRF-Token`.

- [ ] **Step 1: Write the failing ownership test**

```python
# backend/tests/integration/test_project_ownership.py
import pytest
from job_search_platform.services.authorization import authorize
from job_search_platform.services.errors import ServiceError
from job_search_platform.workers.queue import PostgresRunQueue
from helpers import project, user
from datetime import datetime, timezone


def test_user_reaches_only_own_project(db_session):
    alice, bob = user(db_session), user(db_session)
    pa = project(db_session, owner=alice)
    authorize(db_session, alice, pa.id, "read", "project")
    with pytest.raises(ServiceError) as err:
        authorize(db_session, bob, pa.id, "read", "project")
    assert err.value.code == "not_found"


def test_disabled_user_session_rejected(db_session):
    alice = user(db_session)
    pa = project(db_session, owner=alice)
    from job_search_platform.db.models import User
    db_session.get(User, alice.user_id).disabled_at = datetime.now(timezone.utc)
    db_session.flush()
    with pytest.raises(ServiceError) as err:
        authorize(db_session, alice, pa.id, "read", "project")
    assert err.value.code == "unauthorized"


def test_legacy_owner_scope_is_not_current(db_session):
    alice = user(db_session)
    pa = project(db_session, owner=alice)
    now = datetime.now(timezone.utc)
    assert PostgresRunQueue._scope_is_current(db_session, "owner", pa.id, now) is False
    assert PostgresRunQueue._scope_is_current(db_session, f"user:{alice.user_id}", pa.id, now) is True
    bob = user(db_session)
    assert PostgresRunQueue._scope_is_current(db_session, f"user:{bob.user_id}", pa.id, now) is False
```

Rewrite `backend/tests/test_owner_sessions.py` to cover:
- `create` followed by `authenticate` returns a user actor.
- An idle session (`last_seen_at` 8 days ago) is rejected.
- A session past its absolute expiry is rejected.
- `last_seen_at` is refreshed only when it is more than 1 h old.
- A wrong CSRF raises `invalid_csrf`.
- `revoke_all` kills every session of that user and no other user's.
- `secure_cookies` is true for `https://example.test` and false for `http://127.0.0.1:8000`.

- [ ] **Step 2: Run tests and confirm they fail**

Run: `uv run --locked --project backend pytest backend/tests/integration/test_project_ownership.py backend/tests/test_owner_sessions.py -q`
Expected: FAIL (`helpers.user` missing).

- [ ] **Step 3: Implement the interfaces above.** Wire `main.py`:
- `OwnerSessions(sessions, public_origin=os.environ.get("APP_PUBLIC_ORIGIN", "http://127.0.0.1:8000"))`.
- Remove `_origin_settings`. Keep `JSP_DEV_ORIGIN` support by allowing the Vite dev origin as an extra allowed origin: `OwnerSessions(..., extra_origins={dev})`. Add that keyword, a frozenset defaulting to empty.
- Set the cookie in the auth routes (Task 4) with `secure=owner_sessions.secure_cookies`.

- [ ] **Step 4: Run the full non-integration suite and the Postgres suite**

Run: `uv run --locked --project backend pytest backend/tests -q -m "not integration"`.
Then run the integration tests that touch auth: `uv run --locked --project backend pytest backend/tests/integration/test_rest_api.py backend/tests/integration/test_security_boundaries.py backend/tests/integration/test_surface_parity.py backend/tests/integration/test_sse.py backend/tests/integration/test_project_authorization.py -q`. They need MinIO, which the owner's dev stack provides.

Expected: everything passes except the known baseline failures `test_application_startup` (built-frontend smoke) and `test_storage_infrastructure` (restart proof). Report the counts.

- [ ] **Step 5: Commit**

```bash
rtk git add -A backend scripts/run_local.py docs/contracts/application-api.yaml
rtk git commit -m "feat(accounts): user actor, user sessions and project ownership checks"
```

---

### Task 4: Accounts service and `/auth`, `/account` routes

**Files:**
- Create: `backend/src/job_search_platform/services/accounts.py`, `backend/src/job_search_platform/api/accounts.py`
- Modify:
  - `main.py`: include the router under `/api/v1`, and add `accounts` and `mailer` to `Services`
  - `api/dependencies.py`: `Services.accounts: Any = None` and `Services.mailer: Any = None`
  - `api/rest.py` `_http_error` map: add the error codes from Global Constraints. Add `retry_after` and `reset_at` to `SAFE_FIELDS`.
  - `main.py` `_safe_field_names` allow-list: add `email`, `password`, `token`, `confirm_email`, mapped to `"invalid"`. Never echo values.
  - `docs/contracts/application-api.yaml`: add the routes and schemas.
- Test: `backend/tests/integration/test_accounts.py`, `backend/tests/integration/test_accounts_api.py`

**Interfaces:**
- `Accounts(sessions, owner_sessions, mailer, *, public_origin: str)`. All methods are synchronous; routes call them with `asyncio.to_thread`.
  - `signup(email, password, locale, ip) -> None`
  - `verify_email(token) -> None`
  - `resend_verification(user_id) -> None`
  - `login(email, password, ip) -> OwnerExchange`
  - `logout(cookie) -> None`
  - `forgot_password(email) -> None`
  - `reset_password(token, password) -> None`
  - `account(user_id) -> dict`
  - `agents(user_id) -> list[dict]`
  - `request_deletion(user_id, password, confirm_email, runs: RunService) -> None`
  - `purge_due(store, *, now=None) -> int` (implemented in Task 7; declare it here as a stub raising `NotImplementedError`)
- Tokens: `secrets.token_urlsafe(32)`. Store `sha256` of the token. Send links `f"{public_origin}/verify-email?token={t}"` and `f"{public_origin}/reset-password?token={t}"`.
- Mail text lives in a small dict `MESSAGES[locale][kind]` inside `accounts.py`, with kinds `verify`, `exists` and `reset`, in Thai and English. The mail must not include the password.
- A mail send failure is logged as `logger.warning("mail_send_failed", extra={"kind": kind})`, with no address or token, and is swallowed.

Routes (in `api/accounts.py`):
- `POST /auth/signup`, `POST /auth/verify-email`, `POST /auth/resend-verification` (`owner_actor`), `POST /auth/login`, `POST /auth/logout` (`write_actor`), `POST /auth/password/forgot`, `POST /auth/password/reset`.
- `GET /account` (`owner_actor`), `DELETE /account` (`write_actor`), `GET /account/agents` (`owner_actor`).
- Login sets the cookie exactly like the removed bootstrap route did, but with `secure=services.owner_sessions.secure_cookies`. It returns `{"user": account, "csrf_token": ...}`.
- Add `POST /auth/session`, which returns `{"authenticated": true, "csrf_token", "expires_at", "user": account}` from `owner_sessions.current`. This replaces `/owner/session` for page reloads; the frontend in Task 9 uses it.
- The client IP for rate limits is `request.client.host`.
- Add every `/auth/*` route without a session to the OpenAPI no-security list in `main.py`.

- [ ] **Step 1: Write failing tests**

`test_accounts.py` (service level, with a `MemoryMailer` and fast scrypt via the `monkeypatch` of `passwords.SCRYPT_N`):

```python
def test_signup_verify_login_flow(accounts, mailer, db_session): ...
    # signup(" Alice@Example.test ", "long-enough-pw", "en", "1.1.1.1")
    #   → one mail to "alice@example.test", subject from MESSAGES["en"]["verify"]
    # token = link query param from mailer.sent[-1].text
    # verify_email(token) → User.email_verified_at set; verify_email(token) again raises invalid_token
    # login("ALICE@example.test", "long-enough-pw", ip) → OwnerExchange with actor.user_id == user.id
def test_duplicate_signup_sends_exists_mail_and_same_result(...): ...
    # second signup returns None (no error), mailer.sent[-1] is the "exists" mail, still one User row
def test_login_failures_are_uniform(...): ...
    # unknown email, wrong password, disabled user → ServiceError code "invalid_credentials" each
def test_token_expiry_and_supersede(...): ...
    # forgot twice → first reset token raises invalid_token; reset with second works;
    # a token with expires_at in the past raises invalid_token
def test_reset_revokes_all_sessions(...): ...
def test_weak_password_on_signup_and_reset(...): ...
def test_resend_noop_when_verified(...): ...
def test_agents_lists_only_own_grants(...): ...
    # alice and bob each with a project and grant; agents(alice) contains only alice's grant, with project name
```

Write each test fully in the file. The comments above state exactly what each must assert.

`test_accounts_api.py` (FastAPI `TestClient` over the app with `MemoryMailer`, following the `api_context` pattern in `test_rest_api.py`):
- `POST /auth/signup` with a new and an existing email: both return 202 with the identical body `{"status":"check_email"}`.
- The 6th signup from the same client IP within an hour returns 429 `rate_limited` with `fields.retry_after`.
- Login sets `jsp_owner_session` with HttpOnly and SameSite=Strict. With `APP_PUBLIC_ORIGIN=https://example.test`, the cookie has the `Secure` attribute.
- `DELETE /account` with a wrong `confirm_email` returns 422 `confirmation_mismatch`. With a wrong password it returns 401 `invalid_credentials`.

Mark `test_accounts_api.py` with `@pytest.mark.integration` if `api_context` needs MinIO.

- [ ] **Step 2: Run and confirm failure.** `uv run --locked --project backend pytest backend/tests/integration/test_accounts.py backend/tests/integration/test_accounts_api.py -q`
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run the Step 2 command plus `backend/tests/integration/test_rest_api.py::test_runtime_openapi_matches_application_contract_paths_methods_and_schemas`.** All must pass.
- [ ] **Step 5: Commit** with `feat(accounts): signup, verification, login, reset and account routes`

---

### Task 5: Close routes that skip `authorize()`, and the cross-user isolation suite

**Files:**
- Modify `api/rest.py`:
  - `GET /projects` (203): add `.where(Project.user_id == actor.user_id)`.
  - `POST /projects` (210): set `Project(name=..., user_id=actor.user_id)`.
  - `GET /projects/{project_id}` (221), `PATCH` (230), `DELETE` (242): call `authorize(db, actor, project_id, "read"|"manage", "project")` first.
  - Session `PATCH` (356), `DELETE` (369) and `POST .../restore` (389): call `authorize(db, actor, project_id, "manage", "session")` first.
  - `GET /gateway` (1086) and `GET /tools` (1101) hold no per-project data. Leave them as they are; any logged-in user may read them.
- Check `services/experience.py`, where `list_items`, `update_item` and `delete_item` take no actor. Confirm that every REST caller (`rest.py:637-662`) authorizes before calling them. If any caller does not, add the `authorize` call in the route.
- Test: `backend/tests/integration/test_cross_user_isolation.py`, marked `@pytest.mark.integration` (it uses `api_context`, which needs MinIO).

- [ ] **Step 1: Write the failing isolation suite**

Setup:
- Alice and Bob are both verified. Each logs in with `helpers.login_cookie`.
- Alice gets a project with a session, CV, job, document, run and grant, seeded with the helpers used by `test_rest_api.py`'s `seeded` fixture.

Tests:
- **`test_bob_cannot_list_alice_projects`:** Bob's `GET /projects` has none of Alice's ids.
- **`test_bob_gets_404_on_every_alice_route`:** parametrize over every route template in the runtime OpenAPI that contains `{project_id}`. Build the URL with Alice's ids: use Alice's real ids for `{session_id}`, `{cv_id}`, `{job_id}`, `{document_id}`, `{run_id}`, `{grant_id}`, `{approval_id}` and `{file_id}`, and a random uuid for any other parameter.
  - Issue the documented method as Bob, sending JSON `{}` and the CSRF header for writes.
  - Assert the status is 404, or 422 only when request validation rejects the body before authorization. For 422, re-check that a valid-shaped body still yields 404.
  - Assert that Alice's project still exists afterwards.
- **`test_bob_grant_cannot_reach_alice`:** a grant on Bob's project, used with Alice's `project_id`, gets 404 over REST. Over MCP (`/mcp` `tools/call` `get_run` with Alice's run id) and A2A (`tasks/get` with Alice's run id) it gets the existing not-found error. Use the clients in `test_surface_parity.py`.
- **`test_agents_endpoint_is_per_user`:** `GET /account/agents` as Bob lists only Bob's grants.

- [ ] **Step 2: Run and confirm failures.** `uv run --locked --project backend pytest backend/tests/integration/test_cross_user_isolation.py -q`. Expect failures at least for the project and session routes.
- [ ] **Step 3: Fix the routes listed above, and any other route the parametrized test exposes**
- [ ] **Step 4: Run the Step 2 command plus `backend/tests/integration/test_rest_api.py backend/tests/integration/test_project_authorization.py -q`.** All must pass.
- [ ] **Step 5: Commit** with `fix(accounts): enforce project ownership on routes outside authorize()`

---

### Task 6: Verification gate, daily quota and per-user queue fairness

**Files:**
- Create: `backend/src/job_search_platform/services/quota.py`
- Modify:
  - `services/runs.py`: call `enforce_run_gates` inside `_submit_in_transaction` (after `authorize`, about line 221) and inside `_queue_export`, `_submit_profile_sync`, `_submit_extract_sync` and `_submit_match_sync`, before each `Run(` is constructed.
  - `services/grants.py:29` `Grants.issue`: call `require_verified_owner(db, project_id)` after `authorize`.
  - `workers/queue.py:46-58`: add the per-user running cap.
- Test: `backend/tests/integration/test_quota_and_gates.py`

**Interfaces:**
- `quota.require_verified_owner(db, project_id) -> UUID` loads the project's user `FOR UPDATE`. It raises `email_unverified` if the user is not verified, or `unauthorized` if the user is disabled. It returns the user id.
- `quota.enforce_run_gates(db, project_id, *, now=None) -> None` calls `require_verified_owner` (which takes the lock), then counts the user's runs since `budget_day_start(now)`. If the count is at least `int(os.environ.get("USER_DAILY_RUN_QUOTA", "30"))`, it raises `ServiceError("quota_exceeded", fields={"reset_at": (budget_day_start(now) + timedelta(days=1)).isoformat()})`.
  - Count runs whose project has `user_id = ?`, across all operations, including runs created by grants.
- Queue: while scanning candidates (lines 55-58), skip a run whose project's `user_id` already has a run with `status == "running"`.
  - Precompute a set of user ids with running runs via `select(Project.user_id).join(Run, Run.project_id == Project.id).where(Run.status == "running")`.
  - Add each user id to that set when a run is claimed in the same pass.
  - Keep the existing `apply_submit` exemption.

- [ ] **Step 1: Write failing tests**
  - Unverified user: submitting a run raises `email_unverified`. Issuing a grant raises `email_unverified`. A grant created while the user was verified, after the user's `email_verified_at` is set back to NULL, gets `email_unverified` on run submit.
  - Quota: with `monkeypatch.setenv("USER_DAILY_RUN_QUOTA", "2")`, the third submit raises `quota_exceeded`, and `fields["reset_at"]` equals the next Bangkok midnight in UTC.
  - Day boundary: runs created before `budget_day_start(now)` do not count.
  - Race: with quota 2 and 1 existing run, two threads each open their own session and submit. Exactly one succeeds and the other gets `quota_exceeded`. Use `threading.Barrier(2)` before the submit calls, and the real `postgres_engine`.
  - Disabled owner: a grant used for a read gets `unauthorized`.
  - Queue: Alice has run A1 `running` and A2 `queued`; Bob has B1 `queued`. `claim_next` returns B1, and returns `None` while A1 is still running.

- [ ] **Step 2: Run and confirm failure.** `uv run --locked --project backend pytest backend/tests/integration/test_quota_and_gates.py -q`
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run the Step 2 command plus `backend/tests/integration/test_worker_lifecycle.py backend/tests/integration/test_approvals.py -q`.** These need Hermes and run locally.
- [ ] **Step 5: Commit** with `feat(accounts): email verification gate, daily run quota, per-user queue cap`

---

### Task 7: Account deletion and the purge worker

**Files:**
- Modify:
  - `services/accounts.py`: implement `request_deletion` and `purge_due`
  - `workers/supervisor.py`:
    - Add `purge_interval=300` to `__init__` (line 106).
    - Add `purge: Callable[[], int] | None = None`, injected from `main.py` as `lambda: accounts.purge_due(store)`.
    - In `_dispatch_loop` (133), call `await asyncio.to_thread(self._purge)` when `monotonic() - last_purge >= purge_interval`.
    - Catch and log exceptions as `purge_failed`, with no detail beyond the exception class name.
    - Also call `rate_limits.prune` in the same step.
- Test: `backend/tests/integration/test_account_deletion.py`. The MinIO part is marked `@pytest.mark.integration`.

**Behaviour:**
- `request_deletion(user_id, password, confirm_email, runs)`:
  - Verify the password (`invalid_credentials`) and that `normalize_email(confirm_email) == user.email` (`confirmation_mismatch`).
  - In one transaction:
    - Set `deletion_requested_at` and `disabled_at` to now.
    - Call `owner_sessions.revoke_all`.
    - Set `revoked_at` on every grant of the user's projects.
  - Then, for each of the user's runs in `queued`, `running`, `waiting_approval` or `needs_input`, call the existing cancel logic with a system path: `RunService.cancel` needs an actor, so add `RunService.cancel_for_owner(db, run) -> None`. It must apply the same state change and event as `cancel` does after authorization. Extract that shared body from `cancel` (line 908) rather than duplicating it.
- `purge_due(store, *, now=None) -> int`:
  - For each user with `deletion_requested_at` set, ordered oldest first:
    - Collect `StoredFile.storage_key` for the user's projects.
    - `store.delete(key)` each key. Treat not-found as success. If any other error occurs, skip this user this cycle.
    - Delete the `User` row in its own transaction. Cascades remove everything else.
  - Log `account_purged` with the user id only (no email). Users pending for more than 24 h log `account_purge_overdue`.
  - Return the number of users purged.
  - Confirm the object store's delete method name in `integrations/` (likely `ObjectStore.delete` or `remove`) and use it.

- [ ] **Step 1: Write failing tests**
  - Immediately after `request_deletion`:
    - The session cookie gets 401.
    - The grant gets 401.
    - A queued run is `cancelled`.
    - A login attempt gets `invalid_credentials`.
  - After `purge_due`:
    - No `User` row.
    - Zero rows in `projects`, `cvs`, `runs`, `grants` and `owner_sessions` for that user.
    - `signup` with the same email works again.
  - With a fake store whose `delete` raises for one key:
    - The user is still present after `purge_due`.
    - The next call, with a healthy store, purges them.
  - MinIO (integration): an uploaded CV object no longer exists after the purge.
  - Langfuse: run one run through `tracing` with the in-memory exporter used in `backend/tests/unit/test_tracing.py`. Assert that no exported span attribute value contains the user's email or `str(user_id)`.

- [ ] **Step 2: Run and confirm failure.** `uv run --locked --project backend pytest backend/tests/integration/test_account_deletion.py -q`
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run the Step 2 command plus `backend/tests/unit/test_tracing.py -q`.** All must pass.
- [ ] **Step 5: Commit** with `feat(accounts): account deletion with purge worker`

---

### Task 8: CLI, launcher, Mailpit and docs

**Files:**
- Create: `scripts/accounts.py`
- Modify:
  - `infra/compose.yaml`: add the `mailpit` service. Use the `axllent/mailpit` image pinned by digest; resolve the digest with `docker buildx imagetools inspect axllent/mailpit:<latest stable tag>`. Ports `127.0.0.1:51025:1025` (SMTP) and `127.0.0.1:58025:8025` (UI). Attach it to the default network. No volumes.
  - `docs/engineering/local-operation.md`: login flow, CLI, Mailpit, env vars `APP_PUBLIC_ORIGIN`, `SMTP_*` and `USER_DAILY_RUN_QUOTA`.
  - `.env.example`: this file is untracked and the owner has not decided whether to track it. Do not touch it. Document the env vars in `local-operation.md` only.
- Test: `backend/tests/integration/test_accounts_cli.py`

**CLI** (`uv run --locked --project backend python scripts/accounts.py ...`):
- `create-user --email E [--claim-existing] [--locale th|en]`:
  - Read the password with `getpass.getpass` twice. Or, if stdin is not a TTY, read one line from stdin; tests use this path.
  - Run `check_policy`, then create the user with `email_verified_at=now`.
  - With `--claim-existing`, in the same transaction:
    - `UPDATE projects SET user_id = :id WHERE user_id IS NULL`.
    - `UPDATE runs SET actor_scope = 'user:' || :id WHERE actor_scope = 'owner' AND project_id IN (projects of :id)`.
  - Print counts only, never the email.
- `disable-user --email E`: set `disabled_at`, revoke sessions and grants. Print "disabled".
- Exit code 0 on success. Exit code 2 with `error: <code>` on a `ServiceError`.

- [ ] **Step 1: Write failing tests**
  - Using `subprocess.run([sys.executable, "scripts/accounts.py", ...], input="long-enough-pw\n")` with the `CORE02_*` env pointing at the test database (see how `conftest.py` builds the URL; pass `JSP_DATABASE` and the related env):
    - `create-user --claim-existing` claims two pre-existing NULL-owner projects.
    - It rewrites a queued run's `actor_scope` from `owner` to `user:<id>`.
    - That run is then current for the queue.
  - `disable-user` makes a subsequent `authorize` raise `unauthorized`.
- [ ] **Step 2: Run and confirm failure.** `uv run --locked --project backend pytest backend/tests/integration/test_accounts_cli.py -q`
- [ ] **Step 3: Implement.** Check `docker compose -f infra/compose.yaml config -q` passes.
- [ ] **Step 4: Run the Step 2 command.** It must pass.
- [ ] **Step 5: Commit** with `feat(accounts): accounts CLI, Mailpit dev mail, local docs`

---

### Task 9: Frontend auth pages, account page and route guard

**Files:**
- Modify:
  - `frontend/src/lib/api.ts`: remove the launch-nonce code (lines 16-28) and `/owner/bootstrap`. Session bootstrap calls `POST /auth/session`; a 401 publishes `{status:'anonymous'}`. Add `login`, `logout`, `signup`, `verifyEmail`, `resendVerification`, `forgotPassword`, `resetPassword`, `getAccount`, `deleteAccount` and `listAccountAgents`.
  - `frontend/src/lib/api-types.ts`: `OwnerSessionState` becomes `{status:'loading'} | {status:'anonymous'} | {status:'ready', expires_at, user: Account} | {status:'error', error}`. Add `Account = {id, email, locale, email_verified, created_at}` and `AccountAgent`.
  - `frontend/src/app/router.tsx`:
    - `OwnerGate` (89-98): `anonymous` → `<Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />`. Keep the `error` branch, but its copy now says the session expired, with a login link.
    - Add the routes `/login`, `/signup`, `/verify-email`, `/forgot-password` and `/reset-password` outside the gate, and `/app/account` inside it, under `AppWorkspace`.
  - The landing start button (find it with `rtk proxy grep -rn "/overview" frontend/src/features/landing`) targets `/login`.
  - `frontend/src/locales/common.{th,en}.json`: all new copy.
- Create:
  - `frontend/src/features/auth/AuthPages.tsx` with the five pages, sharing one centered `Card` layout and using existing `Input`, `Button` and `Label` components.
  - `frontend/src/features/account/AccountPage.tsx` with three sections: email and verification, connected agents, and danger zone.
  - `frontend/src/components/VerifyBanner.tsx`, rendered in the app shell when `user.email_verified === false`.

**Behaviour:**
- **Login:** on success, navigate to `next` when it starts with `/app/`, otherwise `/app`.
- **Signup:** shows "check your email" no matter what the server returns.
- **verify-email / reset-password:** read `token` from the query string. Remove it from the URL with `history.replaceState` before posting.
- **Account page:**
  - "Resend" button.
  - Agents table with project, label, capabilities, created and expires columns, and a revoke action calling the existing `DELETE /projects/{pid}/grants/{gid}`.
  - "Delete account" opens the existing dialog component. The submit stays disabled until the typed email equals the account email. Success logs the user out to `/`.
- **Unverified users:**
  - The banner and its resend action are shown.
  - Run-starting buttons and grant creation are disabled with a tooltip `t('account.verifyFirst')`. Find them by grepping `api.ts` callers of the run POST and grant POST, and gate them via a small `useAccount()` hook that returns `user` from the session state.
- **Errors:** an API error `email_unverified` or `quota_exceeded` shows `t('errors.email_unverified')` or `t('errors.quota_exceeded', {reset_at})` in the existing error toast or alert path.
- Follow `/Users/parksurakiat/AI-Job-Search-Agent-Platform-dem/DESIGN.md`. Read it first.

- [ ] **Step 1: Run `npm run build --prefix frontend` to confirm a clean baseline**
- [ ] **Step 2: Implement**
- [ ] **Step 3: Run `npm run build --prefix frontend`.** It must pass with no new TypeScript errors.
- [ ] **Step 4: Commit** with `feat(accounts): web auth pages, account page, login gate`

---

### Task 10: Playwright fixture and accounts spec

**Files:**
- Modify `tests/fixtures/application.ts`:
  - Replace the `/owner/session` mock (line 23) with `/auth/session` returning `{authenticated:true, csrf_token:'synthetic-test-csrf', expires_at:'2030-01-01T00:00:00Z', user:{id, email:'synthetic@example.test', locale:'th', email_verified:true, created_at}}`.
  - Add mocks for `/account` and `/account/agents`.
- Modify every spec that mentions `/owner/` (`owner-instructions.spec.ts`, `workflow-regressions.spec.js`, `full-journey.spec.ts`, `workflow.spec.ts`) to the `/auth/session` mock.
- Create `tests/e2e/accounts.spec.ts`

**Spec cases (all against mocks, in the same style as the other specs):**
1. **Anonymous redirect:** `/auth/session` → 401. Visiting `/app/projects` redirects to `/login?next=%2Fapp%2Fprojects`. Logging in (mock `POST /auth/login` 200, then `/auth/session` 200) lands on `/app/projects`.
2. **Signup:** the form shows the check-email state. The request body has a normalized-looking email and `locale` equal to the current UI locale.
3. **verify-email:** `?token=abc` posts `{token:'abc'}`, removes the token from the URL, and shows success. With `400 invalid_token` it shows the localized error.
4. **Unverified user:** the banner is visible, and the "new grant" and "start run" controls are disabled.
5. **Account page:**
   - The agents table lists the mocked agents. Revoke calls the DELETE route.
   - The delete dialog's submit is disabled until the email matches.
   - Confirming calls `DELETE /account` and lands on `/`.
6. **Accessibility:** add `/login`, `/signup` and `/app/account` to the route list in `accessibility.spec.ts` (320 px, tablet, desktop; no overflow; language control visible).

- [ ] **Step 1: Write the spec and run it.** From `tests/`, run `npx playwright test e2e/accounts.spec.ts --reporter=line` with `PLAYWRIGHT_OUTPUT_DIR` set to a scratch dir. Expected: it passes against the Task 9 UI. Fix the UI if a case reveals a defect.
- [ ] **Step 2: Run the full suite.** `npx playwright test --reporter=line` must show 0 failed.
- [ ] **Step 3: Commit** with `test(e2e): accounts flows and auth-session fixture`

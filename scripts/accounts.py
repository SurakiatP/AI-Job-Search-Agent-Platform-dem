"""Owner-side account administration: create (optionally claiming legacy data) and disable users."""
from __future__ import annotations

import argparse
import getpass
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend" / "src"))

from sqlalchemy import select, text, update  # noqa: E402
from sqlalchemy.engine import URL  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from job_search_platform import config  # noqa: E402
from job_search_platform.db.models import Grant, Project, User  # noqa: E402
from job_search_platform.db.session import make_engine  # noqa: E402
from job_search_platform.main import _private_text  # noqa: E402
from job_search_platform.services.errors import ServiceError  # noqa: E402
from job_search_platform.services.owner_sessions import OwnerSessions  # noqa: E402
from job_search_platform.services.passwords import check_policy, hash_password, normalize_email  # noqa: E402


def _sessions() -> sessionmaker:
    url = URL.create("postgresql+psycopg", username=_private_text("postgres-user"),
                     password=_private_text("postgres-password"), host=config.postgres_host(),
                     port=config.postgres_port(), database=config.database_name())
    return sessionmaker(make_engine(url, connect_args={"connect_timeout": 2}), expire_on_commit=False)


def _read_password() -> str:
    if not sys.stdin.isatty():
        return sys.stdin.readline().rstrip("\n")
    first = getpass.getpass("Password: ")
    if first != getpass.getpass("Repeat password: "):
        raise ServiceError("confirmation_mismatch")
    return first


def create_user(sessions: sessionmaker, args) -> None:
    email = normalize_email(args.email)
    password = _read_password()
    check_policy(password)
    now = datetime.now(timezone.utc)
    with sessions.begin() as db:
        if db.scalar(select(User.id).where(User.email == email)) is not None:
            raise ServiceError("email_taken")
        user = User(email=email, password_hash=hash_password(password), locale=args.locale, email_verified_at=now)
        db.add(user)
        db.flush()
        if args.claim_existing:
            projects = db.execute(text("UPDATE projects SET user_id = :id WHERE user_id IS NULL"),
                                  {"id": user.id}).rowcount
            # The snapshot trigger forbids rewriting actor_scope; lift it for this transaction only (DDL is
            # transactional, so it is enforced again on commit or rollback).
            db.execute(text("ALTER TABLE runs DISABLE TRIGGER runs_snapshot_immutable"))
            runs = db.execute(text(
                "UPDATE runs SET actor_scope = 'user:' || :id WHERE actor_scope = 'owner' "
                "AND project_id IN (SELECT id FROM projects WHERE user_id = :id)"), {"id": str(user.id)}).rowcount
            db.execute(text("ALTER TABLE runs ENABLE TRIGGER runs_snapshot_immutable"))
            print(f"created; claimed projects={projects} runs={runs}")
        else:
            print("created")


def disable_user(sessions: sessionmaker, args) -> None:
    now = datetime.now(timezone.utc)
    with sessions.begin() as db:
        user = db.scalar(select(User).where(User.email == normalize_email(args.email)))
        if user is None:
            raise ServiceError("not_found")
        user.disabled_at = now
        OwnerSessions.revoke_all(db, user.id, now)
        db.execute(update(Grant).where(Grant.revoked_at.is_(None),
                                       Grant.project_id.in_(select(Project.id).where(Project.user_id == user.id)))
                   .values(revoked_at=now))
    print("disabled")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    create = sub.add_parser("create-user")
    create.add_argument("--email", required=True)
    create.add_argument("--claim-existing", action="store_true")
    create.add_argument("--locale", choices=("th", "en"), default="th")
    create.set_defaults(run=create_user)
    disable = sub.add_parser("disable-user")
    disable.add_argument("--email", required=True)
    disable.set_defaults(run=disable_user)
    args = parser.parse_args()
    try:
        args.run(_sessions(), args)
    except ServiceError as exc:
        print(f"error: {exc.code}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())

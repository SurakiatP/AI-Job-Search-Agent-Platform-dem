"""Alembic state for deploy.sh: code-head | db-head | knows <revision>."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend" / "src"))

from alembic.config import Config  # noqa: E402
from alembic.script import ScriptDirectory  # noqa: E402
from alembic.util.exc import CommandError  # noqa: E402


def _scripts() -> ScriptDirectory:
    cfg = Config()
    cfg.set_main_option("script_location", str(ROOT / "backend" / "migrations"))
    return ScriptDirectory.from_config(cfg)


def _db_head() -> str:
    from alembic.runtime.migration import MigrationContext
    from sqlalchemy.engine import URL
    from job_search_platform import config
    from job_search_platform.db.session import make_engine
    from job_search_platform.main import _private_text
    url = URL.create("postgresql+psycopg", username=_private_text("postgres-user"),
                     password=_private_text("postgres-password"), host=config.postgres_host(),
                     port=config.postgres_port(), database=config.database_name())
    with make_engine(url, connect_args={"connect_timeout": 5}).connect() as connection:
        return MigrationContext.configure(connection).get_current_revision() or ""


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("code-head")
    sub.add_parser("db-head")
    sub.add_parser("knows").add_argument("revision")
    args = parser.parse_args(argv)
    if args.command == "code-head":
        print(_scripts().get_current_head())
    elif args.command == "db-head":
        print(_db_head())
    else:
        try:
            return 0 if _scripts().get_revision(args.revision) is not None else 1
        except CommandError:
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

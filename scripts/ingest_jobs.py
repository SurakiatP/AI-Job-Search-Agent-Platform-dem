"""WP5 hourly job ingest (run-once worker, TOR appendix ก.3): run | discover | status."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend" / "src"))

from sqlalchemy import select  # noqa: E402
from sqlalchemy.engine import URL  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from job_search_platform import config  # noqa: E402
from job_search_platform.db.models import IngestRun  # noqa: E402
from job_search_platform.db.session import make_engine  # noqa: E402
from job_search_platform.integrations import job_boards  # noqa: E402
from job_search_platform.integrations.logging import configure_logging  # noqa: E402
from job_search_platform.main import _private_text  # noqa: E402
from job_search_platform.services import job_store  # noqa: E402
from job_search_platform.services.errors import ServiceError  # noqa: E402


def _sessions() -> sessionmaker:
    url = URL.create("postgresql+psycopg", username=_private_text("postgres-user"),
                     password=_private_text("postgres-password"), host=config.postgres_host(),
                     port=config.postgres_port(), database=config.database_name())
    return sessionmaker(make_engine(url.render_as_string(hide_password=False)), expire_on_commit=False)


def run(args) -> int:
    sources = (args.source,) if args.source else job_boards.SOURCES
    result = job_store.run_ingest(_sessions(), boards=job_store.load_boards(), sources=sources)
    print(json.dumps({"status": result.status, "fetched": result.fetched, "created": result.created,
                      "updated": result.updated, "closed": result.closed, "merged": result.merged}))
    return 1 if result.status == "failed" else 0


def discover(args) -> int:
    rows = job_boards.fetch_board("freehire", None)
    merged = job_store.discover_boards(rows, job_store.load_boards())
    job_store.BOARDS_FILE.write_text(json.dumps(merged, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({source: len(tokens) for source, tokens in merged.items()}))
    return 0


def status(args) -> int:
    with _sessions()() as db:
        for row in db.scalars(select(IngestRun).order_by(IngestRun.started_at.desc()).limit(5)):
            print(json.dumps({"started_at": row.started_at.isoformat(), "status": row.status, "fetched": row.fetched,
                              "created": row.created, "closed": row.closed, "merged": row.merged}))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    one = sub.add_parser("run")
    one.add_argument("--source", choices=job_boards.SOURCES)
    one.set_defaults(func=run)
    sub.add_parser("discover").set_defaults(func=discover)
    sub.add_parser("status").set_defaults(func=status)
    args = parser.parse_args()
    configure_logging()
    try:
        return args.func(args)
    except ServiceError as exc:
        print(f"error: {exc.code}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
